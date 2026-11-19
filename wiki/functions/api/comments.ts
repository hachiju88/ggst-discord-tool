/**
 * Cloudflare Pages Functions: コメントAPI
 *   GET    /api/comments?page=<記事ID>
 *   POST   /api/comments   { page, name, body }
 *   DELETE /api/comments?id=<コメントID>   （自分のコメントのみ）
 *
 * 読むのはログイン不要。投稿・削除はログインが必要（未ログインは 401）。
 * 投稿者の識別にはログインしたメールアドレスを使う。保存するが、画面には出さない。
 */
import { json, userOf, writer, type AccessEnv } from '../../server/auth';

interface Env extends AccessEnv {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const page = new URL(request.url).searchParams.get('page');
  if (!page) return json({ error: 'page is required' }, 400);
  const me = await userOf(request, env);
  const { results } = await env.DB.prepare(
    'SELECT id, name, body, created_at, author FROM comments WHERE page = ? ORDER BY created_at ASC',
  )
    .bind(page)
    .all<{ id: string; name: string; body: string; created_at: string; author: string }>();
  return json({
    loggedIn: !!me,
    comments: results.map(({ author, ...c }) => ({ ...c, mine: !!me && author === me })),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const w = await writer(request, env, { json: true, loginMessage: 'コメントするにはログインが必要です' });
  if ('error' in w) return w.error;
  const me = w.user;
  const { page, name, body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof page !== 'string' || !page || page.length > 200) return json({ error: '不正なページです' }, 400);
  if (typeof body !== 'string' || !body.trim()) return json({ error: '本文を入力してください' }, 400);
  if (body.length > 2000) return json({ error: '本文は2000文字までです' }, 400);
  const displayName = typeof name === 'string' ? name.trim().slice(0, 30) : '';
  await env.DB.prepare('INSERT INTO comments (id, page, name, body, author, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), page, displayName, body.trim(), me, new Date().toISOString())
    .run();
  return json({ ok: true }, 201);
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const id = new URL(request.url).searchParams.get('id');
  const w = await writer(request, env);
  if ('error' in w) return w.error;
  const me = w.user;
  if (!id) return json({ error: 'id is required' }, 400);
  await env.DB.prepare('DELETE FROM comments WHERE id = ? AND author = ?').bind(id, me).run();
  return json({ ok: true });
};
