export function sma(values: number[], period: number): number | undefined {
  if (values.length < period) return undefined;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function ema(values: number[], period: number): number | undefined {
  if (values.length < period) return undefined;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
  }
  return e;
}

/** Wilder の RSI */
export function rsi(values: number[], period = 14): number | undefined {
  if (values.length < period + 1) return undefined;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** 直近 period 本の対数リターンの標準偏差（1本あたり） */
export function volatility(values: number[], period = 24): number | undefined {
  if (values.length < period + 1) return undefined;
  const slice = values.slice(-(period + 1));
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) rets.push(Math.log(slice[i] / slice[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance);
}

export interface TechnicalSnapshot {
  price: number;
  emaFast?: number; // 24時間
  emaSlow?: number; // 72時間
  sma7d?: number; // 168時間
  rsi14?: number;
  change24hPct?: number;
  change7dPct?: number;
  volatility24h?: number;
  /** -1..1: 上昇トレンドほど +1 */
  trendScore: number;
  /** -1..1: 売られすぎ(反発期待)ほど +1、買われすぎほど -1 */
  momentumScore: number;
}

const clamp = (v: number, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, v));

/** 1時間足の終値配列からテクニカル指標をまとめて計算する */
export function analyzeTechnicals(hourlyCloses: number[], currentPrice: number): TechnicalSnapshot {
  const closes = [...hourlyCloses, currentPrice];
  const emaFast = ema(closes, 24);
  const emaSlow = ema(closes, 72);
  const sma7d = sma(closes, 168);
  const rsi14 = rsi(closes, 14);
  const at = (hoursAgo: number) => (closes.length > hoursAgo ? closes[closes.length - 1 - hoursAgo] : undefined);
  const p24 = at(24);
  const p168 = at(168);

  // トレンド: 短期EMAと長期EMAの乖離 + 7日平均との位置関係
  let trendScore = 0;
  if (emaFast !== undefined && emaSlow !== undefined) {
    // 乖離 2% で満点
    trendScore += clamp(((emaFast - emaSlow) / emaSlow) / 0.02) * 0.6;
  }
  if (sma7d !== undefined) {
    // 7日平均から 5% 上で満点
    trendScore += clamp(((currentPrice - sma7d) / sma7d) / 0.05) * 0.4;
  }

  // モメンタム(逆張り): RSI 30以下で +1、70以上で -1、50 で 0
  let momentumScore = 0;
  if (rsi14 !== undefined) {
    momentumScore = clamp((50 - rsi14) / 20);
  }

  return {
    price: currentPrice,
    emaFast,
    emaSlow,
    sma7d,
    rsi14,
    change24hPct: p24 ? ((currentPrice - p24) / p24) * 100 : undefined,
    change7dPct: p168 ? ((currentPrice - p168) / p168) * 100 : undefined,
    volatility24h: volatility(closes, 24),
    trendScore: clamp(trendScore),
    momentumScore,
  };
}
