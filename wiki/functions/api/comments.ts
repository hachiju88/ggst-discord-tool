/**
 * Cloudflare Pages Functions: コメントAPI
 *   GET    /api/comments?page=<記事ID>
 *   POST   /api/comments   { page, name, body, turnstile? }
 *   DELETE /api/comments?id=<コメントID>   （自分のコメント。管理者はどのコメントでも）
 *
 * 読むのはログイン不要。書くのもログイン不要（ゲスト）。
 *   - ログインしている人：今までどおり（確認なし・回数制限なし）
 *   - ゲスト：Cloudflare Turnstile（人間かどうかの確認）を通ったときだけ受け付け、連投を制限する
 *     Turnstile の鍵（TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY）が無いときは、ゲストの投稿を受け付けない
 * 投稿者の識別には、ログインしたメールアドレスかゲストのID（クッキー）を使う。保存するが、画面には出さない。
 * ゲストが自分のコメントを消せるのは、書いたときと同じブラウザからだけ（ログインすると引き継がれる）。
 *
 * 環境変数（Pages の「変数とシークレット」）:
 *   TURNSTILE_SITE_KEY    Turnstile のサイトキー（テキスト）
 *   TURNSTILE_SECRET_KEY  Turnstile のシークレットキー（シークレット）。IP アドレスを伏せて記録する鍵にも使う
 *   ADMIN_EMAILS          どのコメントでも消せる人のメールアドレス（カンマ区切り）
 */
import { ANON_PREFIX, actor, isAdmin, json, viewerOf, withCookie, type AccessEnv } from '../../server/auth';

interface Env extends AccessEnv {
  DB: D1Database;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  ADMIN_EMAILS?: string;
}

/** ゲストの連投制限（同じ人＝同じIDか同じIPアドレス） */
const GUEST_INTERVAL_SEC = 30; // 前の投稿から最低これだけ空ける
const GUEST_PER_HOUR = 10; // 1時間にこれだけまで

const guestEnabled = (env: Env) => !!(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const page = new URL(request.url).searchParams.get('page');
  if (!page) return json({ error: 'page is required' }, 400);
  const { id: me, email } = await viewerOf(request, env);
  const admin = isAdmin(email, env);
  const { results } = await env.DB.prepare(
    'SELECT id, name, body, created_at, author FROM comments WHERE page = ? ORDER BY created_at ASC',
  )
    .bind(page)
    .all<{ id: string; name: string; body: string; created_at: string; author: string }>();
  return json({
    loggedIn: !!email,
    guest: guestEnabled(env) ? { siteKey: env.TURNSTILE_SITE_KEY } : null,
    comments: results.map(({ author, ...c }) => {
      const mine = !!me && author === me;
      return { ...c, mine, canDelete: mine || admin, guest: author.startsWith(ANON_PREFIX) };
    }),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const w = await actor(request, env, { json: true });
  if ('error' in w) return w.error;
  const me = w.user;
  const { page, name, body, turnstile } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof page !== 'string' || !page || page.length > 200) return json({ error: '不正なページです' }, 400);
  if (typeof body !== 'string' || !body.trim()) return json({ error: '本文を入力してください' }, 400);
  if (body.length > 2000) return json({ error: '本文は2000文字までです' }, 400);
  const displayName = typeof name === 'string' ? name.trim().slice(0, 30) : '';

  let ipHash: string | null = null;
  if (!w.email) {
    // ゲスト
    if (!guestEnabled(env)) return json({ error: 'コメントするにはログインが必要です' }, 401);
    const ip = request.headers.get('CF-Connecting-IP') ?? '';
    ipHash = await hmac(env.TURNSTILE_SECRET_KEY!, ip);

    const now = Date.now();
    const recent = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS short,
         COUNT(*) AS hour
       FROM comments WHERE (ip_hash = ? OR author = ?) AND created_at > ?`,
    )
      .bind(new Date(now - GUEST_INTERVAL_SEC * 1000).toISOString(), ipHash, me, new Date(now - 3600_000).toISOString())
      .first<{ short: number | null; hour: number }>();
    if ((recent?.short ?? 0) > 0) return json({ error: `続けて投稿するには${GUEST_INTERVAL_SEC}秒ほど待ってください` }, 429);
    if ((recent?.hour ?? 0) >= GUEST_PER_HOUR) {
      return json({ error: 'しばらく時間をおいてから投稿してください（ログインすると制限はありません）' }, 429);
    }

    if (typeof turnstile !== 'string' || !turnstile || !(await verifyTurnstile(env.TURNSTILE_SECRET_KEY!, turnstile, ip))) {
      return json({ error: '確認に失敗しました。もう一度お試しください', retryTurnstile: true }, 403);
    }
  }

  await env.DB.prepare(
    'INSERT INTO comments (id, page, name, body, author, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), page, displayName, body.trim(), me, new Date().toISOString(), ipHash)
    .run();
  return withCookie(json({ ok: true }, 201), w.setCookie);
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const id = new URL(request.url).searchParams.get('id');
  const w = await actor(request, env);
  if ('error' in w) return w.error;
  if (!id) return json({ error: 'id is required' }, 400);
  if (isAdmin(w.email, env)) {
    await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
  } else {
    await env.DB.prepare('DELETE FROM comments WHERE id = ? AND author = ?').bind(id, w.user).run();
  }
  return json({ ok: true });
};

async function verifyTurnstile(secret: string, token: string, ip: string): Promise<boolean> {
  try {
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const d = (await res.json()) as { success?: boolean };
    return d.success === true;
  } catch (e) {
    console.error('turnstile verify failed', e);
    return false;
  }
}

/** IP アドレスをそのまま残さないように、鍵付きハッシュにして記録する */
async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
