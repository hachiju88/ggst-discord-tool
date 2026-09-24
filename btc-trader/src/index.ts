import { analyzeNews, type NewsAnalysis } from './analyst';
import { BitflyerClient } from './bitflyer';
import { loadConfig, type Config } from './config';
import { analyzeTechnicals } from './indicators';
import { fetchHourlyPrices } from './market';
import { fetchNews } from './news';
import { COLORS, notify } from './notifier';
import { jstDate, Store, type State } from './state';
import { decide, type Portfolio } from './strategy';

const yen = (v: number) => `${Math.round(v).toLocaleString('ja-JP')} 円`;

async function getNewsAnalysis(cfg: Config, state: State, tech: ReturnType<typeof analyzeTechnicals>) {
  if (!cfg.anthropicEnabled) return undefined;
  const cached = state.news;
  const age = cached ? Date.now() - cached.analyzedAt : Infinity;
  if (cached && age < cfg.newsIntervalMinutes * 60_000) return cached.analysis;

  const news = await fetchNews(cfg.newsFeeds);
  console.log(`[news] ${news.length} 件のニュースを取得`);
  const analysis = await analyzeNews(cfg, tech, news);
  if (analysis) {
    state.news = { analyzedAt: Date.now(), analysis };
    return analysis;
  }
  // 新しい分析に失敗した場合、12時間以内の分析結果があればそれを使う
  return cached && age < 12 * 3_600_000 ? cached.analysis : undefined;
}

async function getPortfolio(cfg: Config, bf: BitflyerClient, state: State): Promise<{ portfolio: Portfolio; source: string }> {
  if (cfg.mode === 'paper') {
    state.paper ??= { btc: cfg.paperStartBtc, jpy: cfg.paperStartJpy };
    return { portfolio: state.paper, source: 'ペーパー口座' };
  }
  if (cfg.bitflyerApiKey && cfg.bitflyerApiSecret) {
    const balances = await bf.getBalances();
    const get = (c: string) => balances.find((b) => b.currency_code === c)?.available ?? 0;
    return { portfolio: { btc: get('BTC'), jpy: get('JPY') }, source: 'bitFlyer 残高' };
  }
  return { portfolio: { btc: cfg.paperStartBtc, jpy: cfg.paperStartJpy }, source: '想定残高（API キー未設定）' };
}

async function waitForExecution(bf: BitflyerClient, cfg: Config, orderId: string) {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const order = await bf.getChildOrder(cfg.productCode, orderId);
    if (order && order.child_order_state !== 'ACTIVE') return order;
  }
  return undefined;
}

export async function runCycle(cfg: Config, store: Store): Promise<void> {
  const state = store.load();
  const bf = new BitflyerClient(cfg.bitflyerApiKey, cfg.bitflyerApiSecret);

  const [ticker, history] = await Promise.all([bf.getTicker(cfg.productCode), fetchHourlyPrices(30)]);
  const tech = analyzeTechnicals(
    history.map((p) => p.price),
    ticker.ltp,
  );
  const news: NewsAnalysis | undefined = await getNewsAnalysis(cfg, state, tech);
  const { portfolio, source } = await getPortfolio(cfg, bf, state);

  const decision = decide(cfg, tech, news, portfolio, { lastTradeAt: state.lastTradeAt, tradesToday: state.tradesToday });
  const totalJpy = portfolio.btc * ticker.best_bid + portfolio.jpy;

  const lines = [
    `モード: **${cfg.mode}** / ${source}`,
    `価格: ${yen(ticker.ltp)}（24h ${tech.change24hPct?.toFixed(2) ?? 'N/A'}% / RSI ${tech.rsi14?.toFixed(1) ?? 'N/A'}）`,
    `保有: ${portfolio.btc.toFixed(8)} BTC + ${yen(portfolio.jpy)} ≒ 評価額 ${yen(totalJpy)}`,
    ...decision.reasons,
  ];
  if (news) {
    lines.push(`ニュース: ${news.summary}（リスク ${news.risk_level}）`);
    for (const e of news.key_events.slice(0, 3)) lines.push(`・${e}`);
  }

  let executed: { price: number; orderId?: string } | undefined;

  if (decision.action !== 'HOLD') {
    const side = decision.action;
    if (cfg.mode === 'paper') {
      const price = side === 'BUY' ? ticker.best_ask : ticker.best_bid;
      const p = state.paper!;
      if (side === 'BUY') {
        p.jpy -= decision.size * price;
        p.btc += decision.size * (1 - cfg.feeRate);
      } else {
        p.btc -= decision.size;
        p.jpy += decision.size * price * (1 - cfg.feeRate);
      }
      executed = { price };
      lines.push(`📝 ペーパー約定: ${side} ${decision.size} BTC @ ${yen(price)}`);
    } else if (cfg.mode === 'notify') {
      lines.push(`👉 推奨アクション: **${side} ${decision.size} BTC**（自動発注はしません。bitFlyer で手動で判断してください）`);
      executed = { price: ticker.ltp };
    } else {
      const health = await bf.getHealth(cfg.productCode);
      if (!['NORMAL', 'BUSY'].includes(health)) {
        lines.push(`⚠️ 取引所の状態が ${health} のため発注を見送りました`);
      } else {
        const orderId = await bf.sendMarketOrder(cfg.productCode, side, decision.size);
        const order = await waitForExecution(bf, cfg, orderId);
        if (!order) {
          // 約定状況が不明な場合も二重発注を避けるため取引済みとして扱う
          executed = { price: ticker.ltp, orderId };
          lines.push(`⏳ 発注済み（ID: ${orderId}）。約定確認がタイムアウトしました。bitFlyer で確認してください`);
        } else if (order.executed_size > 0) {
          executed = { price: order.average_price, orderId };
          lines.push(`✅ 約定: ${side} ${order.executed_size} BTC @ ${yen(order.average_price)}（${order.child_order_state}）`);
        } else {
          lines.push(`⚠️ 注文は約定しませんでした（${order.child_order_state}, ID: ${orderId}）`);
        }
      }
    }

    if (executed) {
      state.lastTradeAt = Date.now();
      state.tradeDay = jstDate();
      state.tradesToday += 1;
      state.trades.push({
        at: new Date().toISOString(),
        mode: cfg.mode,
        side,
        size: decision.size,
        price: executed.price,
        orderId: executed.orderId,
      });
    }
  }

  store.save(state);
  store.journal({
    mode: cfg.mode,
    price: ticker.ltp,
    tech: { ...tech },
    news,
    portfolio,
    decision,
    executed,
  });

  const title =
    decision.action === 'HOLD' ? '様子見 (HOLD)' : `${decision.action === 'BUY' ? '買い' : '売り'}シグナル (${decision.action})`;
  if (decision.action !== 'HOLD' || process.env.NOTIFY_HOLD === 'true') {
    await notify(cfg.discordWebhookUrl, title, lines, COLORS[decision.action]);
  } else {
    console.log(`[${new Date().toISOString()}] ${title}\n${lines.join('\n')}`);
  }
}

function showStatus(cfg: Config, store: Store) {
  const s = store.load();
  console.log(`モード: ${cfg.mode}`);
  if (s.paper) console.log(`ペーパー口座: ${s.paper.btc.toFixed(8)} BTC + ${yen(s.paper.jpy)}`);
  console.log(`本日の取引回数: ${s.tradesToday}`);
  if (s.lastTradeAt) console.log(`最終取引: ${new Date(s.lastTradeAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
  if (s.news) {
    console.log(`最新ニュース分析 (${new Date(s.news.analyzedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}):`);
    console.log(JSON.stringify(s.news.analysis, null, 2));
  }
  console.log(`取引履歴 (直近10件):`);
  for (const t of s.trades.slice(-10)) console.log(`  ${t.at} [${t.mode}] ${t.side} ${t.size} BTC @ ${yen(t.price)}`);
}

async function main() {
  const cmd = process.argv[2] ?? 'once';
  const cfg = loadConfig();
  const store = new Store(cfg.dataDir);

  if (cmd === 'status') return showStatus(cfg, store);

  const safeRun = async () => {
    try {
      await runCycle(cfg, store);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[cycle] エラー:', e);
      await notify(cfg.discordWebhookUrl, 'エラー', [msg.slice(0, 1500)], COLORS.ERROR);
      if (cmd === 'once') process.exitCode = 1;
    }
  };

  if (cmd === 'once') return safeRun();
  if (cmd !== 'loop') throw new Error(`不明なコマンド: ${cmd}（once / loop / status）`);

  console.log(`ループ開始: ${cfg.loopIntervalMinutes} 分ごと / モード ${cfg.mode}`);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    await safeRun();
    running = false;
  };
  await tick();
  setInterval(tick, cfg.loopIntervalMinutes * 60_000);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
