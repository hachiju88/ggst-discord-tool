/**
 * アップロードした動画の配信（R2 から読み出す）。
 * シーク再生のため Range リクエストに対応する。
 */
interface Env {
  MEDIA: R2Bucket;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const key = (Array.isArray(params.path) ? params.path : [params.path]).join('/');
  if (!key.startsWith('videos/') || !env.MEDIA) return new Response('Not found', { status: 404 });

  const obj = await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers });
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'private, max-age=31536000, immutable');

  if (!('body' in obj)) return new Response(null, { status: 304, headers });

  const r = obj.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (r && request.headers.has('range')) {
    const offset = r.suffix !== undefined ? obj.size - r.suffix : (r.offset ?? 0);
    const length = r.suffix !== undefined ? r.suffix : (r.length ?? obj.size - offset);
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set('content-length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('content-length', String(obj.size));
  return new Response(obj.body, { headers });
};
