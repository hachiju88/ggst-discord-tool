/**
 * ログイン中ユーザーのメールアドレスを取り出す（未ログインなら null）。
 *
 * サイトは「見るだけならログイン不要」。Cloudflare Access は /edit と /login だけを守る。
 * /login に来たとき Access が付ける JWT（Cf-Access-Jwt-Assertion）を検証し、
 * サイト全体で使える自前のクッキー（__Host-bl_auth、SameSite=Lax）にその JWT を入れる。
 * （Access の CF_Authorization クッキーがどのパスに送られるかに頼らないため）
 * API は Cf-Access-Jwt-Assertion ヘッダー → 自前クッキー → CF_Authorization の順に JWT を検証する。
 * Cf-Access-Authenticated-User-Email ヘッダーは、Access を通らないパスでは誰でも偽装できるので使わない。
 *
 * 必要な環境変数（Pages の「変数とシークレット」）:
 *   ACCESS_TEAM_DOMAIN  例: myteam.cloudflareaccess.com（Zero Trust のチーム名）
 *   ACCESS_AUD          Access アプリケーションの「アプリケーション オーディエンス (AUD) タグ」。複数ならカンマ区切り
 * どちらかが無いときは、誰もログインしていない扱いになる（書き込みはすべて断る）。
 */
export interface AccessEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}

type Jwk = JsonWebKey & { kid?: string };
type JwtHeader = { alg?: string; kid?: string };
type JwtPayload = { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string };

const CERTS_TTL_MS = 60 * 60 * 1000;
/** 知らない kid で取り直すのは1分に1回まで（偽トークンで外部に取りに行かされ続けないように） */
const FORCE_REFRESH_MS = 60 * 1000;
/** 取得に失敗したら30秒は取りに行かない */
const FAIL_BACKOFF_MS = 30 * 1000;
let certs: { team: string; at: number; keys: Jwk[] } | undefined;
let lastFailAt = 0;

/** ログイン後に /login が付ける自前クッキー */
export const AUTH_COOKIE = '__Host-bl_auth';

const teamOrigin = (raw: string) => {
  const host = raw.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return `https://${host.includes('.') ? host : `${host}.cloudflareaccess.com`}`;
};

const b64urlBytes = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const b64urlJson = <T>(s: string): T => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

async function keysOf(team: string, force = false): Promise<Jwk[]> {
  const now = Date.now();
  const cached = certs && certs.team === team ? certs : undefined;
  const fresh = cached && now - cached.at < CERTS_TTL_MS;
  if (cached && (fresh || force) && (!force || now - cached.at < FORCE_REFRESH_MS)) return cached.keys;
  if (now - lastFailAt < FAIL_BACKOFF_MS) {
    if (cached) return cached.keys;
    throw new Error('Access の公開鍵の取得に失敗したばかりです');
  }
  try {
    const res = await fetch(`${team}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`Access の公開鍵を取得できません (${res.status})`);
    const { keys } = (await res.json()) as { keys?: Jwk[] };
    certs = { team, at: now, keys: keys ?? [] };
    return certs.keys;
  } catch (e) {
    lastFailAt = now;
    if (cached) return cached.keys;
    throw e;
  }
}

const cookieOf = (req: Request, name: string) => {
  const cookie = req.headers.get('Cookie') ?? '';
  for (const part of cookie.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
};

/** 候補の JWT（ヘッダー → 自前クッキー → Access のクッキー） */
function tokensOf(req: Request): string[] {
  return [req.headers.get('Cf-Access-Jwt-Assertion'), cookieOf(req, AUTH_COOKIE), cookieOf(req, 'CF_Authorization')].filter(
    (t): t is string => !!t,
  );
}

/** 検証済みの JWT の中身（メールアドレスと有効期限） */
export async function verifyToken(token: string, env: AccessEnv): Promise<{ email: string; exp: number } | null> {
  try {
    return await verify(token, env);
  } catch (e) {
    console.error('access token verify failed', e);
    return null;
  }
}

async function verify(token: string, env: AccessEnv): Promise<{ email: string; exp: number } | null> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const header = b64urlJson<JwtHeader>(h);
  if (header.alg !== 'RS256' || !header.kid) return null;

  const team = teamOrigin(env.ACCESS_TEAM_DOMAIN);
  let jwk = (await keysOf(team)).find((k) => k.kid === header.kid);
  // 鍵の入れ替え直後は一度だけ取り直す
  if (!jwk) jwk = (await keysOf(team, true)).find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;

  const payload = b64urlJson<JwtPayload>(p);
  const now = Math.floor(Date.now() / 1000);
  const auds = env.ACCESS_AUD.split(',').map((s) => s.trim()).filter(Boolean);
  const tokenAuds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (payload.iss !== team) return null;
  if (!tokenAuds.some((a) => a && auds.includes(a))) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;
  return typeof payload.email === 'string' && payload.email ? { email: payload.email, exp: payload.exp } : null;
}

/** ログイン中ユーザーのメールアドレス（未ログイン・検証できないときは null） */
export async function userOf(req: Request, env: AccessEnv): Promise<string | null> {
  for (const t of tokensOf(req)) {
    const v = await verifyToken(t, env);
    if (v) return v.email;
  }
  return null;
}

/**
 * 別サイトから送らせた書き込み（CSRF）を断る。
 * Origin が自分のサイトと同じか、Origin が無くても Sec-Fetch-Site が same-origin なら通す。
 * JSON を受け取る API では、Content-Type が application/json であることも確かめる（json=true）。
 */
export function sameOrigin(req: Request, opts: { json?: boolean } = {}): boolean {
  const self = new URL(req.url).origin;
  const origin = req.headers.get('Origin');
  const ok = origin ? origin === self : req.headers.get('Sec-Fetch-Site') === 'same-origin';
  if (!ok) return false;
  if (opts.json) {
    const type = (req.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
    if (req.method !== 'DELETE' && type !== 'application/json') return false;
  }
  return true;
}

/**
 * 書き込みAPIの入口：同じサイトからの送信で、ログインしていればメールアドレスを返す。
 * だめなときは返すべきエラーレスポンスを返す。
 */
export async function writer(
  req: Request,
  env: AccessEnv,
  opts: { json?: boolean; loginMessage?: string } = {},
): Promise<{ user: string } | { error: Response }> {
  if (!sameOrigin(req, opts)) return { error: json({ error: '不正なリクエストです' }, 403) };
  const user = await userOf(req, env);
  if (!user) return { error: json({ error: opts.loginMessage ?? 'ログインが必要です' }, 401) };
  return { user };
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

// ---------- ログインしていない人（ゲスト） ----------
/**
 * ゲストを区別するクッキー（ブラウザごとのランダムID）。いいね・お気に入り・コメントに使う。
 * 中身はただの乱数で、知っている人＝その本人として扱う（推測できない長さにしてある）。
 * データベースには `anon:<ID>` の形で入れる（メールアドレスとは @ の有無で重ならない）。
 */
export const ANON_COOKIE = '__Host-bl_anon';
const ANON_MAX_AGE = 400 * 24 * 60 * 60; // ブラウザが許す上限（約400日）
const ANON_ID = /^[0-9a-f]{32}$/;
export const ANON_PREFIX = 'anon:';

/** ゲストのクッキーの ID（無い・形が違うときは null） */
export const anonIdOf = (req: Request) => {
  const v = cookieOf(req, ANON_COOKIE);
  return v && ANON_ID.test(v) ? v : null;
};

/** ログインしていればメールアドレス、ゲストなら `anon:<ID>`、どちらも無ければ null（読むときに使う） */
export async function viewerOf(req: Request, env: AccessEnv): Promise<{ id: string | null; email: string | null }> {
  const email = await userOf(req, env);
  if (email) return { id: email, email };
  const anon = anonIdOf(req);
  return { id: anon ? ANON_PREFIX + anon : null, email: null };
}

export const clearAnonCookie = () => `${ANON_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

/**
 * ゲストも書き込める API の入口：同じサイトからの送信なら、書き込む人の ID を返す。
 * ゲストでクッキーがまだ無ければ新しく作り、setCookie にレスポンスへ付ける値を入れる（withCookie で付ける）。
 */
export async function actor(
  req: Request,
  env: AccessEnv,
  opts: { json?: boolean } = {},
): Promise<{ user: string; email: string | null; setCookie?: string } | { error: Response }> {
  if (!sameOrigin(req, opts)) return { error: json({ error: '不正なリクエストです' }, 403) };
  const v = await viewerOf(req, env);
  if (v.id) return { user: v.id, email: v.email };
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return {
    user: ANON_PREFIX + id,
    email: null,
    setCookie: `${ANON_COOKIE}=${id}; Path=/; Max-Age=${ANON_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
  };
}

export const withCookie = (res: Response, setCookie?: string) => {
  if (setCookie) res.headers.append('Set-Cookie', setCookie);
  return res;
};

/** 管理者（ADMIN_EMAILS にカンマ区切りで書いたメールアドレス）か */
export const isAdmin = (email: string | null, env: { ADMIN_EMAILS?: string }) =>
  !!email &&
  (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
