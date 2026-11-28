/**
 * ログインの入口: GET /login?next=/combos/xxx/
 * このパスは Cloudflare Access で守る。ログインが済むとここに戻ってくる。
 * Access が付けた JWT を検証して、サイト全体で使える自前クッキー（__Host-bl_auth）に入れてから元のページへ返す。
 * next は同じサイト内のパスだけ受け付ける（外部サイトへの転送に使われないように）。
 * ゲストとして付けたいいね・お気に入り・コメントがあれば、ログインしたアカウントへ引き継ぐ。
 */
import { ANON_PREFIX, AUTH_COOKIE, anonIdOf, clearAnonCookie, verifyToken, type AccessEnv } from '../server/auth';

interface Env extends AccessEnv {
  DB?: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  let dest = new URL('/', url.origin);
  try {
    // "//evil.com" や "/\t/evil.com" も URL として解釈してから、同じオリジンか確かめる
    const next = new URL(url.searchParams.get('next') ?? '/', url.origin);
    if (next.origin === url.origin && !/^\/log(in|out)\/?$/.test(next.pathname)) dest = next;
  } catch {}

  const headers = new Headers({ Location: dest.toString(), 'Cache-Control': 'no-store' });
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  const v = token ? await verifyToken(token, env) : null;
  if (token && v) {
    const maxAge = Math.max(0, v.exp - Math.floor(Date.now() / 1000));
    headers.append('Set-Cookie', `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`);
    const anon = anonIdOf(request);
    if (anon && env.DB) {
      const guest = ANON_PREFIX + anon;
      try {
        await env.DB.batch([
          env.DB.prepare('UPDATE OR IGNORE reactions SET user = ? WHERE user = ?').bind(v.email, guest),
          env.DB.prepare('DELETE FROM reactions WHERE user = ?').bind(guest), // アカウント側にもう付いていた分
          env.DB.prepare('UPDATE comments SET author = ? WHERE author = ?').bind(v.email, guest),
        ]);
        headers.append('Set-Cookie', clearAnonCookie());
      } catch (e) {
        console.error('guest data merge failed', e); // 引き継げなくてもログインは続ける（次のログインでまた試す）
      }
    }
  }
  return new Response(null, { status: 302, headers });
};
