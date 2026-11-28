/**
 * Cloudflare Pages Functions: ゲストのときのデータをアカウントへ引き継ぐ
 *   POST /api/guest-merge  { merge: boolean }
 *
 * ログイン中に、このブラウザにゲストのときのいいね・お気に入り・コメントが残っていると、
 * 画面で「引き継ぎますか？」と聞く（共用のPCで、前の人のデータを勝手に自分のものにしないように）。
 * merge=true なら引き継ぎ、どちらでもゲストのクッキーは消す（もう聞かない）。
 */
import { ANON_PREFIX, anonIdOf, clearAnonCookie, json, writer, type AccessEnv } from '../../server/auth';

interface Env extends AccessEnv {
  DB: D1Database;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const w = await writer(request, env, { json: true });
  if ('error' in w) return w.error;
  const { merge } = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const anon = anonIdOf(request);
  if (anon && merge === true) {
    const guest = ANON_PREFIX + anon;
    await env.DB.batch([
      env.DB.prepare('UPDATE OR IGNORE reactions SET user = ? WHERE user = ?').bind(w.user, guest),
      env.DB.prepare('DELETE FROM reactions WHERE user = ?').bind(guest), // アカウント側にもう付いていた分
      env.DB.prepare('UPDATE comments SET author = ? WHERE author = ?').bind(w.user, guest),
    ]);
  }
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', clearAnonCookie());
  return res;
};
