/**
 * テクニカル部分だけのバックテスト（ニュース分析は過去時点を再現できないため含まない）。
 * 使い方:
 *   npm run backtest                 # CoinGecko から直近90日の1時間足を取得
 *   npm run backtest -- prices.json  # [[epoch_ms, price], ...] 形式のファイルを使用
 */
import fs from 'node:fs';
import { loadConfig } from './config';
import { analyzeTechnicals } from './indicators';
import { fetchHourlyPrices, toHourly, type PricePoint } from './market';
import { jstDate } from './state';
import { decide, type Portfolio } from './strategy';

export interface BacktestResult {
  trades: number;
  finalJpy: number;
  holdJpy: number;
  final: Portfolio;
  maxDrawdownPct: number;
}

export function runBacktest(
  cfg: ReturnType<typeof loadConfig>,
  points: PricePoint[],
  spreadPct = 0.0005,
): BacktestResult {
  const closes = points.map((p) => p.price);
  const warmup = 168;
  const pf: Portfolio = { btc: cfg.paperStartBtc, jpy: cfg.paperStartJpy };
  let lastTradeAt: number | undefined;
  let tradeDay = '';
  let tradesToday = 0;
  let trades = 0;
  let peak = 0;
  let maxDd = 0;

  for (let i = warmup; i < points.length; i++) {
    const now = points[i].time;
    const price = closes[i];
    const day = jstDate(now);
    if (day !== tradeDay) {
      tradeDay = day;
      tradesToday = 0;
    }
    const tech = analyzeTechnicals(closes.slice(0, i), price);
    const d = decide(cfg, tech, undefined, pf, { lastTradeAt, tradesToday }, now);
    if (d.action === 'BUY') {
      const ask = price * (1 + spreadPct);
      pf.jpy -= d.size * ask;
      pf.btc += d.size * (1 - cfg.feeRate);
    } else if (d.action === 'SELL') {
      const bid = price * (1 - spreadPct);
      pf.btc -= d.size;
      pf.jpy += d.size * bid * (1 - cfg.feeRate);
    }
    if (d.action !== 'HOLD') {
      trades++;
      tradesToday++;
      lastTradeAt = now;
    }
    const value = pf.btc * price + pf.jpy;
    peak = Math.max(peak, value);
    maxDd = Math.max(maxDd, (peak - value) / peak);
  }

  const last = closes[closes.length - 1];
  return {
    trades,
    final: pf,
    finalJpy: pf.btc * last + pf.jpy,
    holdJpy: cfg.paperStartBtc * last + cfg.paperStartJpy,
    maxDrawdownPct: maxDd * 100,
  };
}

async function main() {
  const cfg = loadConfig();
  const file = process.argv[2];
  const points = file
    ? toHourly((JSON.parse(fs.readFileSync(file, 'utf8')) as [number, number][]).map(([time, price]) => ({ time, price })))
    : await fetchHourlyPrices(90);

  const r = runBacktest(cfg, points);
  const fmt = (v: number) => `${Math.round(v).toLocaleString('ja-JP')} 円`;
  const from = new Date(points[168]?.time ?? points[0].time).toLocaleDateString('ja-JP');
  const to = new Date(points[points.length - 1].time).toLocaleDateString('ja-JP');
  console.log(`期間: ${from} 〜 ${to}（1時間足 ${points.length} 本、先頭168本はウォームアップ）`);
  console.log(`取引回数: ${r.trades}`);
  console.log(`最終保有: ${r.final.btc.toFixed(8)} BTC + ${fmt(r.final.jpy)}`);
  console.log(`戦略の評価額: ${fmt(r.finalJpy)}`);
  console.log(`ガチホ(何もしない)の評価額: ${fmt(r.holdJpy)}`);
  console.log(`差分: ${fmt(r.finalJpy - r.holdJpy)}（${(((r.finalJpy - r.holdJpy) / r.holdJpy) * 100).toFixed(2)}%）`);
  console.log(`最大ドローダウン: ${r.maxDrawdownPct.toFixed(2)}%`);
  console.log('※ ニュース分析は含みません。手数料・スプレッドは概算です。過去の結果は将来を保証しません。');
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
