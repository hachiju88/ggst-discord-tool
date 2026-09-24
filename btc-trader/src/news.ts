export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt?: Date;
  description?: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]) : undefined;
}

/** RSS 2.0 / Atom の最低限のパーサ */
export function parseFeed(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const block of blocks) {
    const title = tag(block, 'title');
    if (!title) continue;
    let link = tag(block, 'link');
    if (!link) {
      const href = block.match(/<link[^>]*href="([^"]+)"/i);
      link = href?.[1];
    }
    const dateText = tag(block, 'pubDate') ?? tag(block, 'published') ?? tag(block, 'updated') ?? tag(block, 'dc:date');
    const date = dateText ? new Date(dateText) : undefined;
    const description = tag(block, 'description') ?? tag(block, 'summary');
    items.push({
      title,
      link: link ?? '',
      source,
      publishedAt: date && !Number.isNaN(date.getTime()) ? date : undefined,
      description: description?.slice(0, 300),
    });
  }
  return items;
}

export async function fetchNews(feeds: string[], sinceHours = 24, limit = 40): Promise<NewsItem[]> {
  const since = Date.now() - sinceHours * 3_600_000;
  const results = await Promise.allSettled(
    feeds.map(async (url) => {
      const res = await fetch(url, {
        headers: { 'user-agent': 'btc-trader/1.0 (+rss reader)' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      return parseFeed(await res.text(), new URL(url).hostname);
    }),
  );

  const all: NewsItem[] = [];
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') all.push(...r.value);
    else console.warn(`[news] フィード取得失敗 ${feeds[i]}: ${r.reason}`);
  }

  const seen = new Set<string>();
  return all
    .filter((n) => !n.publishedAt || n.publishedAt.getTime() >= since)
    .filter((n) => {
      const key = n.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, limit);
}
