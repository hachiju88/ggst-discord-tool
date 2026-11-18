/** Cloudflare Access がつけるログイン中ユーザーのメールアドレス（未ログインなら null） */
export const userOf = (req: Request): string | null =>
  req.headers.get('Cf-Access-Authenticated-User-Email');

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
