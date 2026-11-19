/**
 * Cloudflare Pages Functions: コメントAPI
 *   GET    /api/comments?page=<記事ID>
 *   POST   /api/comments   { page, name, body }
 *   DELETE /api/comments?id=<コメントID>   （自分のコメントのみ）
 *
 * 投稿者の識別には Cloudflare Access がつけるメールアドレスヘッダーを使う。
 * メールアドレスは保存するが、画面には出さない。
 */
import { json, userOf as accessUser } from '../../server/auth';

interface Env {
  DB: D1Database;
}

const userOf = (req: Request) => accessUser(req) ?? 'anonymous';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const page = new URL(request.url).searchParams.get('page');
  if (!page) return json({ error: 'page is required' }, 400);
  const me = userOf(request);
  const { results } = await env.DB.prepare(
    'SELECT id, name, body, created_at, author FROM comments WHERE page = ? ORDER BY created_at ASC',
  )
    .bind(page)
    .all<{ id: string; name: string; body: string; created_at: string; author: string }>();
  return json({
    comments: results.map(({ author, ...c }) => ({ ...c, mine: me !== 'anonymous' && author === me })),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const { page, name, body } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof page !== 'string' || !page || page.length > 200) return json({ error: '不正なページです' }, 400);
  if (typeof body !== 'string' || !body.trim()) return json({ error: '本文を入力してください' }, 400);
  if (body.length > 2000) return json({ error: '本文は2000文字までです' }, 400);
  const displayName = typeof name === 'string' ? name.trim().slice(0, 30) : '';
  await env.DB.prepare('INSERT INTO comments (id, page, name, body, author, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), page, displayName, body.trim(), userOf(request), new Date().toISOString())
    .run();
  return json({ ok: true }, 201);
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const id = new URL(request.url).searchParams.get('id');
  const me = userOf(request);
  if (!id || me === 'anonymous') return json({ error: 'forbidden' }, 403);
  await env.DB.prepare('DELETE FROM comments WHERE id = ? AND author = ?').bind(id, me).run();
  return json({ ok: true });
};
