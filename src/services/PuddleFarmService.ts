import JSONbig from 'json-bigint';

const BASE_URL = 'https://puddle.farm/api';
const UA = 'ggst-discord-tool';
const REQUEST_DELAY_MS = 1000;
const MAX_RETRIES = 3;

// puddle.farm returns int64 player IDs as JSON numbers. Native JSON.parse loses
// precision for values > 2^53, so use json-bigint with storeAsString to keep IDs
// as strings (then we always coerce to string for safety).
const safeJSON = JSONbig({ storeAsString: true, useNativeBigInt: false });

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function apiFetch<T>(path: string): Promise<T | null> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json',
        },
      });
      if (res.ok) {
        const text = await res.text();
        return safeJSON.parse(text) as T;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES - 1) {
        const wait = Math.pow(2, attempt + 1) * 1000;
        console.warn(`[PuddleFarm] HTTP ${res.status} on ${path}, retry in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      console.error(`[PuddleFarm] HTTP ${res.status} for ${path}`);
      return null;
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(Math.pow(2, attempt + 1) * 1000);
      } else {
        console.error(`[PuddleFarm] Fetch error for ${path}:`, err);
      }
    }
  }
  return null;
}

// IDs are string after json-bigint parse (or coerced via String() defensively).
// All consumers treat them as opaque strings.

export type SearchResult = {
  id: string;
  name: string;
  rating: number;
  deviation: number;
  char_short: string;
  char_long: string;
};

export type PlayerRating = {
  char_short: string;
  char_long: string;
  rating: number;
  deviation: number;
};

export type PlayerResponse = {
  id: string;
  name: string;
  ratings: PlayerRating[];
  platform: string;
  status: string;
  top_global: number;
};

export type RatingPoint = {
  timestamp: string;
  rating: number;
};

export const PuddleFarmService = {
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/health`, {
        headers: { 'User-Agent': UA, 'Accept': 'text/plain' },
      });
      const text = await res.text();
      return res.ok && text.trim() === 'OK';
    } catch {
      return false;
    }
  },

  async searchPlayer(searchString: string, exact = false): Promise<SearchResult[]> {
    await sleep(REQUEST_DELAY_MS);
    const params = new URLSearchParams({ search_string: searchString, exact: String(exact) });
    const result = await apiFetch<{ results: SearchResult[] }>(`/player/search?${params}`);
    if (!result?.results) return [];
    return result.results.map(r => ({ ...r, id: String(r.id) }));
  },

  async getPlayer(playerId: string): Promise<PlayerResponse | null> {
    await sleep(REQUEST_DELAY_MS);
    const result = await apiFetch<PlayerResponse>(`/player/${playerId}`);
    if (!result) return null;
    return { ...result, id: String(result.id) };
  },

  async getRatings(playerId: string, charShort: string, days: number): Promise<RatingPoint[] | null> {
    await sleep(REQUEST_DELAY_MS);
    return apiFetch<RatingPoint[]>(`/ratings/${playerId}/${charShort}/${days}`);
  },

  async getCharacters(): Promise<[string, string][]> {
    await sleep(REQUEST_DELAY_MS);
    const result = await apiFetch<unknown[][]>('/characters');
    if (!result) return [];
    return result
      .filter(Array.isArray)
      .map(row => [String(row[0] ?? ''), String(row[1] ?? '')] as [string, string])
      .filter(([s, l]) => s.length > 0 && l.length > 0);
  },
};
