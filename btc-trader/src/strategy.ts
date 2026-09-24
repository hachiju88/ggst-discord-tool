import type { Config } from './config';
import type { TechnicalSnapshot } from './indicators';
import type { NewsAnalysis } from './analyst';

export type Action = 'BUY' | 'SELL' | 'HOLD';

export interface Portfolio {
  btc: number;
  jpy: number;
}

export interface TradeHistory {
  lastTradeAt?: number;
  tradesToday: number;
}

export interface Decision {
  action: Action;
  size: number;
  score: number;
  components: { trend: number; momentum: number; news: number };
  reasons: string[];
}

/**
 * テクニカル + ニュースのスコアを合成し、リスクルールを通してから売買判断を出す。
 * Claude の出力は news コンポーネント（重み付き・確信度で減衰）にしか影響しない。
 * 発注可否はすべてこの関数の決定的なルールで決まる。
 */
export function decide(
  cfg: Config,
  tech: TechnicalSnapshot,
  news: NewsAnalysis | undefined,
  portfolio: Portfolio,
  history: TradeHistory,
  now = Date.now(),
): Decision {
  const w = cfg.weights;
  const newsComponent = news ? news.sentiment * news.confidence : 0;
  const components = {
    trend: tech.trendScore,
    momentum: tech.momentumScore,
    news: newsComponent,
  };
  // ニュースがない場合はその重みを除いて正規化する
  const totalWeight = w.trend + w.momentum + (news ? w.news : 0);
  const score =
    totalWeight > 0
      ? (w.trend * components.trend + w.momentum * components.momentum + (news ? w.news * components.news : 0)) /
        totalWeight
      : 0;

  const reasons: string[] = [
    `合成スコア ${score.toFixed(2)}（トレンド ${components.trend.toFixed(2)} / モメンタム ${components.momentum.toFixed(2)} / ニュース ${news ? components.news.toFixed(2) : 'なし'}）`,
  ];
  const hold = (why: string): Decision => ({ action: 'HOLD', size: 0, score, components, reasons: [...reasons, why] });

  let action: Action = 'HOLD';
  if (score >= cfg.buyThreshold) action = 'BUY';
  else if (score <= cfg.sellThreshold) action = 'SELL';
  if (action === 'HOLD') {
    return hold(`しきい値（買い ${cfg.buyThreshold} / 売り ${cfg.sellThreshold}）に届かないため様子見`);
  }

  // --- リスクルール ---
  if (history.tradesToday >= cfg.maxTradesPerDay) {
    return hold(`本日の取引回数上限（${cfg.maxTradesPerDay}回）に達しているため見送り`);
  }
  if (history.lastTradeAt && now - history.lastTradeAt < cfg.cooldownHours * 3_600_000) {
    const left = (cfg.cooldownHours - (now - history.lastTradeAt) / 3_600_000).toFixed(1);
    return hold(`前回取引からのクールダウン中（残り約 ${left} 時間）`);
  }

  const size = cfg.tradeSizeBtc;
  if (action === 'BUY') {
    if (news?.risk_level === 'high') {
      return hold('ニュース分析でリスク高と判定されたため買いを見送り');
    }
    const cost = size * tech.price * (1 + cfg.feeRate);
    if (cost > cfg.maxJpyPerTrade) {
      return hold(`1回あたりの上限 ${cfg.maxJpyPerTrade.toLocaleString()} 円を超えるため見送り（必要 ${Math.ceil(cost).toLocaleString()} 円）`);
    }
    if (portfolio.jpy < cost) {
      return hold(`買いシグナルだが日本円残高不足（必要 ${Math.ceil(cost).toLocaleString()} 円 / 残高 ${Math.floor(portfolio.jpy).toLocaleString()} 円）`);
    }
    return { action, size, score, components, reasons: [...reasons, '買いしきい値を超えたため買い'] };
  }

  // SELL
  if (portfolio.btc - size < cfg.coreBtc - 1e-9) {
    return hold(`売りシグナルだがコア保有分 ${cfg.coreBtc} BTC を割るため見送り（保有 ${portfolio.btc.toFixed(8)} BTC）`);
  }
  return { action, size, score, components, reasons: [...reasons, '売りしきい値を下回ったため売り'] };
}
