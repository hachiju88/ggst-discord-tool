/**
 * ログアウト: GET /logout
 * 自前クッキー（__Host-bl_auth）を消してから、Cloudflare Access のログアウト（CF_Authorization を消す）へ送る。
 */
import { AUTH_COOKIE } from '../server/auth';

export const onRequestGet: PagesFunction = async () =>
  new Response(null, {
    status: 302,
    headers: {
      Location: '/cdn-cgi/access/logout',
      'Cache-Control': 'no-store',
      'Set-Cookie': `${AUTH_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    },
  });
