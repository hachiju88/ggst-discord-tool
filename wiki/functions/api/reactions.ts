/**
 * Cloudflare Pages Functions: いいね・お気に入りAPI
 *   GET  /api/reactions
 *        → { loggedIn, likes: { [記事ID]: 件数 }, mine: { like: [記事ID], fav: [記事ID] }, guestData? }
 *   POST /api/reactions  { page, kind: "like" | "fav", on: boolean }
 *
 * 誰が押したかは、ログインしていればメールアドレス、ゲストならブラウザごとのID（クッキー）で区別する（画面には出さない）。
 * - ログインしなくても押せる。ゲストのクッキーは GET で先に渡しておく（最初の書き込みが何本も同時に飛んでもIDが分かれないように）
 * - ゲストのいいねは、同じIPアドレス（IPv6 は /64）から1時間に GUEST_LIKES_PER_HOUR 件まで（数の水増し対策）
 * - ログイン中にゲストのときのデータが残っていれば guestData に件数を返す（引き継ぐかは本人に聞く → /api/guest-merge）
 * お気に入りは本人にしか返さない。
 */
import { ANON_PREFIX, actor, anonIdOf, json, newAnon, viewerOf, withCookie, type AccessEnv } from '../../server/auth';
import { ipHashOf } from '../../server/guest';

interface Env extends AccessEnv {
  DB: D1Database;
}

const KINDS = ['like', 'fav'] as const;
const GUEST_LIKES_PER_HOUR = 60;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const { id: me, email } = await viewerOf(request, env);
  const anon = email ? anonIdOf(request) : null;
  const [counts, mine, guest] = await Promise.all([
    env.DB.prepare("SELECT page, COUNT(*) AS n FROM reactions WHERE kind = 'like' GROUP BY page").all<{ page: string; n: number }>(),
    me
      ? env.DB.prepare('SELECT page, kind FROM reactions WHERE user = ?').bind(me).all<{ page: string; kind: string }>()
      : Promise.resolve({ results: [] as { page: string; kind: string }[] }),
    anon
      ? env.DB.prepare(
          `SELECT
             (SELECT COUNT(*) FROM reactions WHERE user = ?1 AND kind = 'like') AS likes,
             (SELECT COUNT(*) FROM reactions WHERE user = ?1 AND kind = 'fav') AS favs,
             (SELECT COUNT(*) FROM comments WHERE author = ?1) AS comments`,
        )
          .bind(ANON_PREFIX + anon)
          .first<{ likes: number; favs: number; comments: number }>()
      : Promise.resolve(null),
  ]);
  const res = json({
    loggedIn: !!email,
    likes: Object.fromEntries(counts.results.map((r) => [r.page, r.n])),
    mine: {
      like: mine.results.filter((r) => r.kind === 'like').map((r) => r.page),
      fav: mine.results.filter((r) => r.kind === 'fav').map((r) => r.page),
    },
    ...(guest && guest.likes + guest.favs + guest.comments > 0 ? { guestData: guest } : {}),
  });
  res.headers.set('Cache-Control', 'no-store');
  // ゲストでまだクッキーが無ければ、ここで渡しておく
  return withCookie(res, !me ? newAnon().setCookie : undefined);
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const w = await actor(request, env, { json: true });
  if ('error' in w) return w.error;
  const me = w.user;
  const { page, kind, on } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof page !== 'string' || !page || page.length > 200) return json({ error: '不正なページです' }, 400);
  if (!KINDS.includes(kind as any)) return json({ error: '不正な種類です' }, 400);
  const now = new Date();

  if (on && !w.email) {
    // ゲスト：IPアドレスごとの件数を見ながら1文で入れる（同時に送られても上限を超えない）
    const ipHash = await ipHashOf(request, env.DB);
    if (!ipHash) return json({ error: '接続元を確認できませんでした' }, 400);
    const r = await env.DB.prepare(
      `INSERT OR IGNORE INTO reactions (page, user, kind, created_at, ip_hash)
       SELECT ?1, ?2, ?3, ?4, ?5
       WHERE ?3 <> 'like'
          OR (SELECT COUNT(*) FROM reactions WHERE ip_hash = ?5 AND kind = 'like' AND created_at > ?6) < ?7`,
    )
      .bind(page, me, kind, now.toISOString(), ipHash, new Date(now.getTime() - 3600_000).toISOString(), GUEST_LIKES_PER_HOUR)
      .run();
    if (!r.meta.changes) {
      const exists = await env.DB.prepare('SELECT 1 FROM reactions WHERE page = ? AND user = ? AND kind = ?').bind(page, me, kind).first();
      if (!exists) return json({ error: 'いいねが多すぎます。しばらく時間をおくか、ログインしてください' }, 429);
    }
  } else if (on) {
    await env.DB.prepare('INSERT OR IGNORE INTO reactions (page, user, kind, created_at) VALUES (?, ?, ?, ?)')
      .bind(page, me, kind, now.toISOString())
      .run();
  } else {
    await env.DB.prepare('DELETE FROM reactions WHERE page = ? AND user = ? AND kind = ?').bind(page, me, kind).run();
  }
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM reactions WHERE page = ? AND kind = 'like'")
    .bind(page)
    .first<{ n: number }>();
  return withCookie(json({ ok: true, likes: row?.n ?? 0 }), w.setCookie);
};
