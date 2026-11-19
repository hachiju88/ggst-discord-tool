/**
 * ログイン中ユーザーのメールアドレスを取り出す（未ログインなら null）。
 *
 * サイトは「見るだけならログイン不要」。Cloudflare Access は /edit と /login だけを守り、
 * そこでログインすると CF_Authorization クッキー（JWT）がサイト全体に付く。
 * API はそのクッキー（または Cf-Access-Jwt-Assertion ヘッダー）の JWT を自分で検証する。
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
let certs: { team: string; at: number; keys: Jwk[] } | undefined;

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
  if (!force && certs && certs.team === team && Date.now() - certs.at < CERTS_TTL_MS) return certs.keys;
  const res = await fetch(`${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access の公開鍵を取得できません (${res.status})`);
  const { keys } = (await res.json()) as { keys?: Jwk[] };
  certs = { team, at: Date.now(), keys: keys ?? [] };
  return certs.keys;
}

function tokenOf(req: Request): string | null {
  const h = req.headers.get('Cf-Access-Jwt-Assertion');
  if (h) return h;
  const cookie = req.headers.get('Cookie') ?? '';
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function verify(token: string, env: AccessEnv): Promise<string | null> {
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
  return typeof payload.email === 'string' && payload.email ? payload.email : null;
}

/** ログイン中ユーザーのメールアドレス（未ログイン・検証できないときは null） */
export async function userOf(req: Request, env: AccessEnv): Promise<string | null> {
  const token = tokenOf(req);
  if (!token) return null;
  try {
    return await verify(token, env);
  } catch (e) {
    console.error('access token verify failed', e);
    return null;
  }
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
