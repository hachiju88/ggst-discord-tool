import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { rsi, ema, sma, analyzeTechnicals } from '../src/indicators';
import { decide } from '../src/strategy';
import { parseFeed } from '../src/news';
import { signRequest } from '../src/bitflyer';
import { runBacktest } from '../src/backtest';
import { analyzeNews } from '../src/analyst';
import type { Config } from '../src/config';

const cfg: Config = {
  mode: 'paper', productCode: 'BTC_JPY', anthropicEnabled: false, claudeModel: 'claude-opus-5',
  claudeEffort: 'medium', newsIntervalMinutes: 240, newsFeeds: [], loopIntervalMinutes: 60,
  tradeSizeBtc: 0.001, coreBtc: 0.001, buyThreshold: 0.4, sellThreshold: -0.4, cooldownHours: 12,
  maxTradesPerDay: 2, maxJpyPerTrade: 30000, weights: { trend: 0.4, momentum: 0.3, news: 0.3 },
  paperStartBtc: 0.003, paperStartJpy: 0, feeRate: 0.0015, dataDir: 'data',
};

const tech = (trend: number, momentum: number, price = 15_000_000) =>
  ({ price, trendScore: trend, momentumScore: momentum }) as ReturnType<typeof analyzeTechnicals>;

test('sma / ema / rsi', () => {
  assert.equal(sma([1, 2, 3, 4], 2), 3.5);
  assert.equal(ema([1, 1, 1, 1], 2), 1);
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(rsi(up), 100);
  const down = Array.from({ length: 30 }, (_, i) => 100 - i);
  assert.equal(rsi(down), 0);
  assert.equal(rsi([1, 2, 3]), undefined);
});

test('analyzeTechnicals: 上昇トレンドは trendScore 正、RSI 高で momentum 負', () => {
  const closes = Array.from({ length: 200 }, (_, i) => 10_000_000 * (1 + i * 0.002));
  const t = analyzeTechnicals(closes, closes[closes.length - 1] * 1.002);
  assert.ok(t.trendScore > 0.5, `trend=${t.trendScore}`);
  assert.ok(t.momentumScore < 0, `momentum=${t.momentumScore}`);
  assert.ok(t.change24hPct! > 0);
});

test('decide: しきい値未満は HOLD', () => {
  const d = decide(cfg, tech(0.1, 0.1), undefined, { btc: 0.003, jpy: 0 }, { tradesToday: 0 });
  assert.equal(d.action, 'HOLD');
});

test('decide: 売りシグナルでもコア保有分は売らない', () => {
  const sell = decide(cfg, tech(-1, -1), undefined, { btc: 0.003, jpy: 0 }, { tradesToday: 0 });
  assert.equal(sell.action, 'SELL');
  const blocked = decide(cfg, tech(-1, -1), undefined, { btc: 0.0015, jpy: 0 }, { tradesToday: 0 });
  assert.equal(blocked.action, 'HOLD');
});

test('decide: 円不足・リスク高・上限超過・クールダウン・回数上限で買わない', () => {
  const pf = { btc: 0.002, jpy: 100_000 };
  assert.equal(decide(cfg, tech(1, 1), undefined, pf, { tradesToday: 0 }).action, 'BUY');
  assert.equal(decide(cfg, tech(1, 1), undefined, { btc: 0.002, jpy: 1000 }, { tradesToday: 0 }).action, 'HOLD');
  const risky = { sentiment: 1, confidence: 1, risk_level: 'high' as const, key_events: [], summary: '' };
  assert.equal(decide(cfg, tech(1, 1), risky, pf, { tradesToday: 0 }).action, 'HOLD');
  assert.equal(decide(cfg, tech(1, 1, 40_000_000), undefined, pf, { tradesToday: 0 }).action, 'HOLD');
  const now = Date.now();
  assert.equal(decide(cfg, tech(1, 1), undefined, pf, { tradesToday: 0, lastTradeAt: now - 3_600_000 }, now).action, 'HOLD');
  assert.equal(decide(cfg, tech(1, 1), undefined, pf, { tradesToday: 2 }).action, 'HOLD');
});

test('decide: ニュースは確信度で減衰する', () => {
  const pf = { btc: 0.002, jpy: 100_000 };
  const lowConf = { sentiment: 1, confidence: 0.1, risk_level: 'low' as const, key_events: [], summary: '' };
  const highConf = { ...lowConf, confidence: 1 };
  const a = decide(cfg, tech(0.3, 0.3), lowConf, pf, { tradesToday: 0 });
  const b = decide(cfg, tech(0.3, 0.3), highConf, pf, { tradesToday: 0 });
  assert.equal(a.action, 'HOLD');
  assert.equal(b.action, 'BUY');
});

test('parseFeed: RSS と Atom', () => {
  const rss = `<rss><channel><item><title><![CDATA[Bitcoin ETF &amp; flows]]></title><link>https://x/1</link>
    <pubDate>Wed, 24 Sep 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;desc&lt;/p&gt;</description></item></channel></rss>`;
  const items = parseFeed(rss, 'x');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Bitcoin ETF & flows');
  assert.equal(items[0].link, 'https://x/1');
  assert.equal(items[0].publishedAt?.toISOString(), '2026-09-24T10:00:00.000Z');
  const atom = `<feed><entry><title>BTC 急落</title><link href="https://y/2"/><updated>2026-09-24T01:00:00Z</updated></entry></feed>`;
  const a = parseFeed(atom, 'y');
  assert.equal(a[0].title, 'BTC 急落');
  assert.equal(a[0].link, 'https://y/2');
});

test('signRequest: HMAC-SHA256(timestamp+method+path+body)', () => {
  const expected = crypto.createHmac('sha256', 'secret').update('1700000000000POST/v1/me/sendchildorder{"a":1}').digest('hex');
  assert.equal(signRequest('secret', '1700000000000', 'POST', '/v1/me/sendchildorder', '{"a":1}'), expected);
});

test('runBacktest: 合成データで動作し、コア保有を割らない', () => {
  const start = Date.UTC(2026, 0, 1);
  const points = Array.from({ length: 24 * 60 }, (_, i) => ({
    time: start + i * 3_600_000,
    price: 15_000_000 * (1 + 0.1 * Math.sin(i / 60)),
  }));
  const r = runBacktest(cfg, points);
  assert.ok(r.trades > 0);
  assert.ok(r.final.btc >= cfg.coreBtc - 1e-6);
  assert.ok(r.final.jpy >= 0);
});

test('analyzeNews: structured output を解釈し範囲外の値をクランプする', async () => {
  let body: any;
  const server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      body = JSON.parse(data);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5', stop_reason: 'end_turn',
        stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: 'text', text: JSON.stringify({
          sentiment: 1.7, confidence: 0.8, risk_level: 'medium', key_events: ['a', 'b', 'c', 'd', 'e', 'f'], summary: 'ok',
        }) }],
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as any).port;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.ANTHROPIC_API_KEY = 'test';
  try {
    const out = await analyzeNews(cfg, tech(0, 0), [{ title: 'BTC up', link: '', source: 'x' }]);
    assert.ok(out);
    assert.equal(out!.sentiment, 1);
    assert.equal(out!.key_events.length, 5);
    assert.equal(body.model, 'claude-opus-5');
    assert.equal(body.fallbacks, 'default');
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.match(body.messages[0].content, /BTC up/);
  } finally {
    server.close();
  }
});
