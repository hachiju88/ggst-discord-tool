/**
 * ログインの入口: GET /login?next=/combos/xxx/
 * このパスは Cloudflare Access で守る。ログインが済むとここに戻ってくる。
 * Access が付けた JWT を検証して、サイト全体で使える自前クッキー（__Host-bl_auth）に入れてから元のページへ返す。
 * next は同じサイト内のパスだけ受け付ける（外部サイトへの転送に使われないように）。
 */
import { AUTH_COOKIE, verifyToken, type AccessEnv } from '../server/auth';

export const onRequestGet: PagesFunction<AccessEnv> = async ({ request, env }) => {
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
  }
  return new Response(null, { status: 302, headers });
};
