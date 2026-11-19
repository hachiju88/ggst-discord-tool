#!/usr/bin/env node
/**
 * Discord「BRIDGET LAB」チャンネル → wiki 取り込み用のヘルパー。
 * Claude Code のスキル（.claude/skills/bridget-lab-import）から使う。依存パッケージなし（Node 22+）。
 *
 *   node wiki/scripts/bridget-lab.mjs check                      接続確認
 *   node wiki/scripts/bridget-lab.mjs pending                    未処理の投稿を JSON で出す（古い順）
 *   node wiki/scripts/bridget-lab.mjs download <msgId> <dir>     投稿の添付（転送元の添付も含む）を保存
 *   node wiki/scripts/bridget-lab.mjs upload-video <file> <記事ID> 動画を R2 に置き、/media/... の URL を出す
 *   node wiki/scripts/bridget-lab.mjs mark <msgId> ok|ask        ✅ / ❓ を付ける（もう片方は外す）
 *   node wiki/scripts/bridget-lab.mjs reply <msgId> <本文>        投稿に返信する
 *
 * 環境変数
 *   DISCORD_BOT_TOKEN       bot のトークン（クラウド環境ではプロキシが差し込むので未設定でよい）
 *   CLOUDFLARE_API_TOKEN    R2 と D1 に書き込める API トークン（同上）
 *   BRIDGET_LAB_CHANNEL_ID  チャンネルID（未設定なら bot が入っているサーバーから名前で探す）
 *   CF_ACCOUNT_ID / CF_D1_DATABASE_ID / CF_R2_BUCKET  未設定なら自動で探す / bridget-wiki-media
 *
 * 処理済みかどうかは、bot が付けたリアクションで判断する（✅ = 取り込み済み、❓ = 保留）。
 */
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

// プロキシ環境では Node の fetch にプロキシを使わせる（起動時の環境変数でしか有効にできないので自分を起動し直す）
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  process.exit(r.status ?? 1);
}

const DISCORD = 'https://discord.com/api/v10';
const CF = 'https://api.cloudflare.com/client/v4';
const CHANNEL_NAME = 'bridgetlab'; // 「BRIDGET LAB」「bridget-lab」など（記号・大文字小文字は無視）
const D1_NAME = 'bridget-wiki';
const BUCKET = process.env.CF_R2_BUCKET || 'bridget-wiki-media';
const MAX_SCAN = 1000; // さかのぼって見る投稿の数
const MAX_VIDEO = 50 * 1024 * 1024;
const EMOJI = { ok: '✅', ask: '❓' };
const VIDEO_TYPES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };

const die = (msg) => {
  console.error(`エラー: ${msg}`);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Discord ----------
async function discord(path, init = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${DISCORD}${path}`, {
      ...init,
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN || 'placeholder'}`,
        'User-Agent': 'DiscordBot (bridget-lab-import, 1.0)',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      await sleep(Math.ceil((body.retry_after ?? 1) * 1000) + 100);
      continue;
    }
    if (!res.ok) die(`Discord ${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }
  die(`Discord ${path} → 429 が続きました`);
}

let channelCache;
async function channel() {
  if (channelCache) return channelCache;
  const id = process.env.BRIDGET_LAB_CHANNEL_ID;
  if (id) return (channelCache = await discord(`/channels/${id}`));
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const found = [];
  for (const g of await discord('/users/@me/guilds')) {
    for (const c of await discord(`/guilds/${g.id}/channels`)) {
      if ([0, 5].includes(c.type) && norm(c.name) === CHANNEL_NAME) found.push(c);
    }
  }
  if (found.length === 0) die('BRIDGET LAB チャンネルが見つかりません（bot がそのチャンネルを見られるか確認してください）');
  if (found.length > 1) die(`BRIDGET LAB チャンネルが複数あります。BRIDGET_LAB_CHANNEL_ID で指定してください: ${found.map((c) => c.id).join(', ')}`);
  return (channelCache = found[0]);
}

const statusOf = (m) => {
  const mine = (m.reactions ?? []).filter((r) => r.me).map((r) => r.emoji.name);
  return mine.includes(EMOJI.ok) ? 'ok' : mine.includes(EMOJI.ask) ? 'ask' : 'pending';
};

const jst = (iso) =>
  new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 16); // "2026-11-19 21:05"

const attachmentsOf = (list = []) =>
  list.map((a) => ({ filename: a.filename, contentType: a.content_type ?? '', size: a.size, url: a.url }));

const embedsOf = (list = []) =>
  list.map((e) => ({
    type: e.type,
    url: e.url,
    title: e.title,
    author: e.author?.name,
    description: e.description,
    hasVideo: !!e.video,
  }));

/** 投稿を、取り込みに必要な情報だけの形にする */
function simplify(m, ch, bot) {
  const snap = m.message_reference?.type === 1 ? m.message_snapshots?.[0]?.message : undefined;
  const files = [...attachmentsOf(m.attachments), ...attachmentsOf(snap?.attachments)];
  const out = {
    id: m.id,
    link: `https://discord.com/channels/${ch.guild_id}/${ch.id}/${m.id}`,
    author: m.member?.nick || m.author.global_name || m.author.username,
    date: jst(m.timestamp),
    edited: !!m.edited_timestamp,
    content: m.content,
    attachments: files.map(({ url, ...a }, index) => ({ index, ...a })),
    embeds: embedsOf(m.embeds),
  };
  if (snap) {
    out.forwarded = { date: snap.timestamp ? jst(snap.timestamp) : undefined, content: snap.content, embeds: embedsOf(snap.embeds) };
  }
  if (m.message_reference?.type !== 1 && m.referenced_message) {
    const r = m.referenced_message;
    out.replyTo = {
      id: r.id,
      author: r.author?.global_name || r.author?.username,
      byBot: r.author?.id === bot.id,
      status: statusOf(r),
      content: r.content,
    };
  }
  return out;
}

async function allMessages(ch) {
  const all = [];
  let before;
  while (all.length < MAX_SCAN) {
    const page = await discord(`/channels/${ch.id}/messages?limit=100${before ? `&before=${before}` : ''}`);
    all.push(...page);
    if (page.length < 100) break;
    before = page[page.length - 1].id;
  }
  return all.reverse(); // 古い順
}

async function cmdPending() {
  const [ch, bot] = await Promise.all([channel(), discord('/users/@me')]);
  const msgs = await allMessages(ch);
  const pending = msgs
    .filter((m) => m.author.id !== bot.id && !m.author.bot && [0, 19].includes(m.type) && statusOf(m) === 'pending')
    .map((m) => simplify(m, ch, bot));
  const onHold = msgs.filter((m) => statusOf(m) === 'ask').length;
  console.log(JSON.stringify({ channel: ch.name, pending, onHoldCount: onHold }, null, 2));
}

async function getMessage(id) {
  const ch = await channel();
  return { ch, m: await discord(`/channels/${ch.id}/messages/${id}`) };
}

async function cmdDownload(id, dir) {
  if (!id || !dir) die('使い方: download <msgId> <保存先フォルダ>');
  const { m } = await getMessage(id);
  const snap = m.message_reference?.type === 1 ? m.message_snapshots?.[0]?.message : undefined;
  const files = [...attachmentsOf(m.attachments), ...attachmentsOf(snap?.attachments)];
  await mkdir(dir, { recursive: true });
  const saved = [];
  for (const [i, a] of files.entries()) {
    const res = await fetch(a.url);
    if (!res.ok) die(`添付のダウンロードに失敗: ${a.filename} → ${res.status}`);
    const path = join(dir, `${id}-${i}-${basename(a.filename).replace(/[^\w.\-]/g, '_')}`);
    await writeFile(path, Buffer.from(await res.arrayBuffer()));
    saved.push({ index: i, path, contentType: a.contentType, size: a.size });
  }
  console.log(JSON.stringify(saved, null, 2));
}

async function cmdMark(id, kind) {
  if (!id || !EMOJI[kind]) die('使い方: mark <msgId> ok|ask');
  const ch = await channel();
  const other = kind === 'ok' ? EMOJI.ask : EMOJI.ok;
  const base = `/channels/${ch.id}/messages/${id}/reactions`;
  await discord(`${base}/${encodeURIComponent(EMOJI[kind])}/@me`, { method: 'PUT' });
  const { m } = await getMessage(id);
  if ((m.reactions ?? []).some((r) => r.me && r.emoji.name === other)) {
    await discord(`${base}/${encodeURIComponent(other)}/@me`, { method: 'DELETE' });
  }
  console.log(`${EMOJI[kind]} を付けました: ${id}`);
}

async function cmdReply(id, text) {
  if (!id || !text) die('使い方: reply <msgId> <本文>');
  const ch = await channel();
  await discord(`/channels/${ch.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: text.slice(0, 2000),
      message_reference: { message_id: id, fail_if_not_exists: false },
      allowed_mentions: { parse: [] },
      flags: 4, // SUPPRESS_EMBEDS（リンクのプレビューを出さない）
    }),
  });
  console.log(`返信しました: ${id}`);
}

// ---------- Cloudflare（R2 / D1） ----------
async function cf(path, init = {}) {
  const res = await fetch(`${CF}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN || 'placeholder'}`, ...init.headers },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = undefined;
  }
  if (!res.ok || body?.success === false) die(`Cloudflare ${init.method ?? 'GET'} ${path} → ${res.status} ${text.slice(0, 500)}`);
  return body?.result;
}

async function cfIds() {
  let account = process.env.CF_ACCOUNT_ID;
  if (!account) {
    const accounts = await cf('/accounts');
    if (accounts.length !== 1) die(`Cloudflare のアカウントが ${accounts.length} 件あります。CF_ACCOUNT_ID で指定してください`);
    account = accounts[0].id;
  }
  let db = process.env.CF_D1_DATABASE_ID;
  if (!db) {
    const list = await cf(`/accounts/${account}/d1/database?name=${D1_NAME}`);
    const hit = list.find((d) => d.name === D1_NAME);
    if (!hit) die(`D1 データベース ${D1_NAME} が見つかりません`);
    db = hit.uuid;
  }
  return { account, db };
}

const d1 = (ids, sql, params) =>
  cf(`/accounts/${ids.account}/d1/database/${ids.db}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });

async function cmdUploadVideo(file, page) {
  if (!file || !page) die('使い方: upload-video <ファイル> <記事ID（例: combos/center/2k-basic）>');
  if (!/^[a-z]+(\/(center|corner))?\/[a-z0-9][a-z0-9-]{0,59}$/.test(page)) die(`記事IDの形が正しくありません: ${page}`);
  const ext = extname(file).toLowerCase();
  const type = VIDEO_TYPES[ext];
  if (!type) die('mp4 / webm / mov の動画だけ置けます');
  const buf = await readFile(file);
  if (buf.length === 0) die('ファイルが空です');
  if (buf.length > MAX_VIDEO) die(`動画が大きすぎます（${(buf.length / 1024 / 1024).toFixed(1)}MB）。YouTube に上げて URL を使ってください`);

  const ids = await cfIds();
  const now = new Date();
  const key = `videos/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}${ext}`;
  await cf(`/accounts/${ids.account}/r2/buckets/${BUCKET}/objects/${key.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PUT',
    headers: { 'Content-Type': type },
    body: buf,
  });
  // サイトのフォームでアップロードしたときと同じように記録する（記事から外されたら自動で消えるように）
  await d1(ids, 'INSERT INTO media (key, user, size, created_at) VALUES (?, ?, ?, ?)', [key, 'discord:bridget-lab', buf.length, now.toISOString()]);
  await d1(ids, 'INSERT OR IGNORE INTO media_refs (key, page) VALUES (?, ?)', [key, page]);
  console.log(`/media/${key}`);
}

async function cmdCheck() {
  const bot = await discord('/users/@me');
  console.log(`Discord: ${bot.username} としてログインできました`);
  const ch = await channel();
  console.log(`チャンネル: #${ch.name}（${ch.id}）`);
  const sample = await discord(`/channels/${ch.id}/messages?limit=20`);
  const human = sample.filter((m) => !m.author.bot);
  if (human.length && human.every((m) => !m.content && !m.attachments?.length && !m.message_snapshots?.length && !m.embeds?.length)) {
    console.log('⚠ 投稿の本文が空です。Developer Portal で bot の「MESSAGE CONTENT INTENT」をオンにしてください');
  } else {
    console.log(`投稿を読めました（直近 ${sample.length} 件）`);
  }
  if (process.argv.includes('--cloudflare')) {
    const ids = await cfIds();
    await cf(`/accounts/${ids.account}/r2/buckets/${BUCKET}`);
    await d1(ids, 'SELECT COUNT(*) AS n FROM media', []);
    console.log('Cloudflare: R2 と D1 に接続できました');
  }
}

const [cmd, ...args] = process.argv.slice(2);
const commands = {
  check: cmdCheck,
  pending: cmdPending,
  download: cmdDownload,
  'upload-video': cmdUploadVideo,
  mark: cmdMark,
  reply: cmdReply,
};
if (!commands[cmd]) die(`コマンドは ${Object.keys(commands).join(' / ')} のどれかです`);
await commands[cmd](...args);
