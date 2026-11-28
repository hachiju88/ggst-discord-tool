/**
 * 動画URLの種類を判定する。YouTube / X(Twitter) / 動画ファイル(mp4 など) に対応。
 */
export type Video =
  | { type: 'youtube'; id: string; start: number; url: string; title?: string }
  | { type: 'x'; url: string; title?: string }
  | { type: 'file'; url: string; title?: string }
  | { type: 'link'; url: string; title?: string };

export type VideoInput = string | { url: string; title?: string };

/** "1m30s" / "90" / "90s" → 秒 */
function parseTime(t: string | null): number {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

export function parseVideo(input: VideoInput): Video {
  const { url, title } = typeof input === 'string' ? { url: input, title: undefined } : input;
  let u: URL;
  try {
    u = new URL(url, 'https://local.invalid');
  } catch {
    return { type: 'link', url, title };
  }
  const host = u.hostname.replace(/^(www|m|mobile)\./, '');

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1);
    else if (u.pathname === '/watch') id = u.searchParams.get('v') ?? '';
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/);
      if (m) id = m[1];
    }
    if (/^[\w-]{6,}$/.test(id)) {
      return { type: 'youtube', id, start: parseTime(u.searchParams.get('t') ?? u.searchParams.get('start')), url, title };
    }
  }
  if ((host === 'x.com' || host === 'twitter.com') && /\/status\/\d+/.test(u.pathname)) {
    // 埋め込みは twitter.com ドメインの方が安定
    return { type: 'x', url: `https://twitter.com${u.pathname.match(/^\/[^/]+\/status\/\d+/)![0]}`, title };
  }
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { type: 'file', url, title };
  return { type: 'link', url, title };
}

export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/**
 * 本文に書いた動画 `![タイトル](URL)` を取り出す。URL が動画（YouTube・X・動画ファイル）のものだけ。
 * 本文の好きな位置に動画を置くための記法。
 */
const BODY_VIDEO = /!\[([^\]\n]*)\]\(\s*<?([^\s()<>]+)>?(?:\s+"[^"\n]*")?\s*\)/g;
export const BODY_VIDEO_URL = /^(https:\/\/|\/media\/|\/samples\/)/;

export function bodyVideos(body: string | undefined): { url: string; title?: string }[] {
  if (!body) return [];
  return [...body.matchAll(BODY_VIDEO)]
    .map((m) => ({ url: m[2], title: m[1].trim() || undefined }))
    .filter((v) => BODY_VIDEO_URL.test(v.url) && parseVideo(v).type !== 'link');
}
