import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export type TradeMode = 'paper' | 'notify' | 'live';

export interface Config {
  mode: TradeMode;
  productCode: string;

  // bitFlyer
  bitflyerApiKey?: string;
  bitflyerApiSecret?: string;

  // Claude (ニュース分析)
  anthropicEnabled: boolean;
  claudeModel: string;
  claudeEffort: 'low' | 'medium' | 'high';
  newsIntervalMinutes: number;
  newsFeeds: string[];

  // Discord 通知
  discordWebhookUrl?: string;

  // 売買ルール
  loopIntervalMinutes: number;
  tradeSizeBtc: number;
  coreBtc: number;
  buyThreshold: number;
  sellThreshold: number;
  cooldownHours: number;
  maxTradesPerDay: number;
  maxJpyPerTrade: number;
  weights: { trend: number; momentum: number; news: number };

  // ペーパートレード初期残高
  paperStartBtc: number;
  paperStartJpy: number;
  feeRate: number;

  dataDir: string;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`環境変数 ${name} が数値ではありません: ${raw}`);
  return v;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

const DEFAULT_FEEDS = [
  'https://www.coindesk.com/arc/outboundfeeds/rss/',
  'https://cointelegraph.com/rss',
  'https://jp.cointelegraph.com/rss',
  'https://coinpost.jp/?feed=rss2',
];

export function loadConfig(): Config {
  const mode = str('TRADE_MODE', 'paper') as TradeMode;
  if (!['paper', 'notify', 'live'].includes(mode)) {
    throw new Error(`TRADE_MODE は paper / notify / live のいずれかです: ${mode}`);
  }

  const cfg: Config = {
    mode,
    productCode: str('PRODUCT_CODE', 'BTC_JPY'),
    bitflyerApiKey: process.env.BITFLYER_API_KEY || undefined,
    bitflyerApiSecret: process.env.BITFLYER_API_SECRET || undefined,

    anthropicEnabled: Boolean(process.env.ANTHROPIC_API_KEY) && str('NEWS_ANALYSIS', 'on') !== 'off',
    claudeModel: str('CLAUDE_MODEL', 'claude-opus-5'),
    claudeEffort: str('CLAUDE_EFFORT', 'medium') as Config['claudeEffort'],
    newsIntervalMinutes: num('NEWS_INTERVAL_MINUTES', 240),
    newsFeeds: str('NEWS_FEEDS', DEFAULT_FEEDS.join(','))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),

    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || undefined,

    loopIntervalMinutes: num('LOOP_INTERVAL_MINUTES', 60),
    tradeSizeBtc: num('TRADE_SIZE_BTC', 0.001),
    coreBtc: num('CORE_BTC', 0.001),
    buyThreshold: num('BUY_THRESHOLD', 0.4),
    sellThreshold: num('SELL_THRESHOLD', -0.4),
    cooldownHours: num('COOLDOWN_HOURS', 12),
    maxTradesPerDay: num('MAX_TRADES_PER_DAY', 2),
    maxJpyPerTrade: num('MAX_JPY_PER_TRADE', 30000),
    weights: {
      trend: num('WEIGHT_TREND', 0.4),
      momentum: num('WEIGHT_MOMENTUM', 0.3),
      news: num('WEIGHT_NEWS', 0.3),
    },

    paperStartBtc: num('PAPER_START_BTC', 0.003),
    paperStartJpy: num('PAPER_START_JPY', 0),
    feeRate: num('FEE_RATE', 0.0015),

    dataDir: str('DATA_DIR', 'data'),
  };

  if (cfg.tradeSizeBtc < 0.001) {
    throw new Error('TRADE_SIZE_BTC は bitFlyer の最小注文数量 0.001 以上にしてください');
  }
  if (!['low', 'medium', 'high'].includes(cfg.claudeEffort)) {
    throw new Error(`CLAUDE_EFFORT は low / medium / high のいずれかです: ${cfg.claudeEffort}`);
  }

  if (cfg.mode === 'live') {
    if (!cfg.bitflyerApiKey || !cfg.bitflyerApiSecret) {
      throw new Error('live モードには BITFLYER_API_KEY / BITFLYER_API_SECRET が必要です');
    }
    if (process.env.LIVE_TRADING_CONFIRM !== 'I_UNDERSTAND_THE_RISK') {
      throw new Error(
        'live モードで実際に発注するには LIVE_TRADING_CONFIRM=I_UNDERSTAND_THE_RISK を設定してください',
      );
    }
  }

  return cfg;
}
