/**
 * Cloudflare Pages Functions: いいね・お気に入りAPI
 *   GET  /api/reactions
 *        → { likes: { [記事ID]: 件数 }, mine: { like: [記事ID], fav: [記事ID] } }
 *   POST /api/reactions  { page, kind: "like" | "fav", on: boolean }
 *
 * 誰が押したかはログインしたメールアドレスで区別する（画面には出さない）。見るだけならログイン不要。
 * 押すにはログインが必要（未ログインは 401）。
 * お気に入りは本人にしか返さない。
 */
import { json, userOf, writer, type AccessEnv } from '../../server/auth';

interface Env extends AccessEnv {
  DB: D1Database;
}

const KINDS = ['like', 'fav'] as const;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const me = await userOf(request, env);
  const [counts, mine] = await Promise.all([
    env.DB.prepare("SELECT page, COUNT(*) AS n FROM reactions WHERE kind = 'like' GROUP BY page").all<{ page: string; n: number }>(),
    me
      ? env.DB.prepare('SELECT page, kind FROM reactions WHERE user = ?').bind(me).all<{ page: string; kind: string }>()
      : Promise.resolve({ results: [] as { page: string; kind: string }[] }),
  ]);
  return json({
    loggedIn: !!me,
    likes: Object.fromEntries(counts.results.map((r) => [r.page, r.n])),
    mine: {
      like: mine.results.filter((r) => r.kind === 'like').map((r) => r.page),
      fav: mine.results.filter((r) => r.kind === 'fav').map((r) => r.page),
    },
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const w = await writer(request, env, { json: true });
  if ('error' in w) return w.error;
  const me = w.user;
  const { page, kind, on } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof page !== 'string' || !page || page.length > 200) return json({ error: '不正なページです' }, 400);
  if (!KINDS.includes(kind as any)) return json({ error: '不正な種類です' }, 400);

  if (on) {
    await env.DB.prepare('INSERT OR IGNORE INTO reactions (page, user, kind, created_at) VALUES (?, ?, ?, ?)')
      .bind(page, me, kind, new Date().toISOString())
      .run();
  } else {
    await env.DB.prepare('DELETE FROM reactions WHERE page = ? AND user = ? AND kind = ?').bind(page, me, kind).run();
  }
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM reactions WHERE page = ? AND kind = 'like'")
    .bind(page)
    .first<{ n: number }>();
  return json({ ok: true, likes: row?.n ?? 0 });
};
