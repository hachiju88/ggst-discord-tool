/**
 * アップロードした動画の配信（R2 から読み出す）。
 * シーク再生のため Range リクエストに対応する。Range は自前で検証し、
 * 不正・範囲外なら 416 を返す（R2 の実装差に依存しない）。
 */
interface Env {
  MEDIA: R2Bucket;
}

/** "bytes=100-199" / "bytes=100-" / "bytes=-500" → { offset, length }。不正・範囲外なら null */
function parseRange(header: string, size: number): { offset: number; length: number } | null {
  const m = header.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') {
    const suffix = Math.min(Number(m[2]), size);
    return suffix > 0 ? { offset: size - suffix, length: suffix } : null;
  }
  const start = Number(m[1]);
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  if (start >= size || end < start) return null;
  return { offset: start, length: end - start + 1 };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const key = (Array.isArray(params.path) ? params.path : [params.path]).join('/');
  if (!key.startsWith('videos/') || !env.MEDIA) return new Response('Not found', { status: 404 });

  const head = await env.MEDIA.head(key);
  if (!head) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  head.writeHttpMetadata(headers);
  headers.set('etag', head.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'private, max-age=31536000, immutable');

  if (request.headers.get('if-none-match') === head.httpEtag) return new Response(null, { status: 304, headers });

  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    const range = parseRange(rangeHeader, head.size);
    if (!range) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${head.size}` } });
    const obj = await env.MEDIA.get(key, { range });
    if (!obj) return new Response('Not found', { status: 404 });
    headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
    headers.set('content-length', String(range.length));
    return new Response(obj.body, { status: 206, headers });
  }

  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  headers.set('content-length', String(head.size));
  return new Response(obj.body, { headers });
};
