/**
 * ゲストの書き込みの連投・水増し対策で使う、IPアドレスのハッシュ。
 * IPアドレスはそのまま残さず、D1 の app_keys に置いた鍵（初回に自動で作る）で HMAC にして記録する。
 * 鍵は Turnstile などほかの鍵と分けてあるので、そちらを入れ替えても制限の記録はリセットされない。
 * IPv6 は /64（回線ごとの単位）にまとめる（同じ回線の中でアドレスを変えて制限を抜けられないように）。
 */
let cachedKey: CryptoKey | undefined;

async function hashKey(db: D1Database): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  let row = await db.prepare("SELECT value FROM app_keys WHERE name = 'ip_hash'").first<{ value: string }>();
  if (!row) {
    const v = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
    await db.prepare("INSERT OR IGNORE INTO app_keys (name, value) VALUES ('ip_hash', ?)").bind(v).run();
    // 同時に作られたときは先に入った方を使う
    row = await db.prepare("SELECT value FROM app_keys WHERE name = 'ip_hash'").first<{ value: string }>();
    if (!row) throw new Error('ip_hash の鍵を作れませんでした');
  }
  cachedKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(row.value), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return cachedKey;
}

/** 制限に使う単位（IPv4 はそのまま、IPv6 は先頭 64 ビット）。分からなければ null */
export function ipUnitOf(req: Request): string | null {
  const ip = (req.headers.get('CF-Connecting-IP') ?? '').trim().toLowerCase();
  if (!ip) return null;
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::');
  const a = head ? head.split(':') : [];
  const b = ip.includes('::') && tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b] : a;
  return full.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

/** IPアドレスの鍵付きハッシュ（IPが分からなければ null） */
export async function ipHashOf(req: Request, db: D1Database): Promise<string | null> {
  const unit = ipUnitOf(req);
  if (!unit) return null;
  const sig = await crypto.subtle.sign('HMAC', await hashKey(db), new TextEncoder().encode(unit));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
