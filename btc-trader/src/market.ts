/**
 * 価格履歴の取得。bitFlyer の公式 API にはローソク足がないため、
 * CoinGecko の BTC/JPY 時系列（2〜90日指定で1時間足）を指標計算に使う。
 * 現在値・発注は bitFlyer の板を使う。
 */
export interface PricePoint {
  time: number; // epoch ms
  price: number;
}

export async function fetchHourlyPrices(days = 30): Promise<PricePoint[]> {
  const url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=jpy&days=${days}`;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (process.env.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    throw new Error(`CoinGecko の価格履歴取得に失敗 (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { prices: [number, number][] };
  return toHourly(json.prices.map(([time, price]) => ({ time, price })));
}

/** 1時間ごとに最後の値だけを残す（CoinGecko は最新点が不規則な間隔で入るため） */
export function toHourly(points: PricePoint[]): PricePoint[] {
  const byHour = new Map<number, PricePoint>();
  for (const p of points) {
    byHour.set(Math.floor(p.time / 3_600_000), p);
  }
  return [...byHour.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}
