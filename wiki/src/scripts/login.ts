/** ログインして今のページに戻ってくるためのURL（/login は Cloudflare Access で守られている） */
export const loginUrl = () =>
  `/login?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
