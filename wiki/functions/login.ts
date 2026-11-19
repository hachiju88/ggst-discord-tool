/**
 * ログインの入口: GET /login?next=/combos/xxx/
 * このパスは Cloudflare Access で守る。ログインが済むとここに戻ってくるので、元のページへ返す。
 * next は同じサイト内のパスだけ受け付ける（外部サイトへの転送に使われないように）。
 */
export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  let dest = new URL('/', url.origin);
  try {
    // "//evil.com" や "/\t/evil.com" も URL として解釈してから、同じオリジンか確かめる
    const next = new URL(url.searchParams.get('next') ?? '/', url.origin);
    if (next.origin === url.origin && !next.pathname.startsWith('/login')) dest = next;
  } catch {}
  return new Response(null, { status: 302, headers: { Location: dest.toString(), 'Cache-Control': 'no-store' } });
};
