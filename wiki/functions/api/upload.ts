/**
 * Cloudflare Pages Functions: 動画アップロード（R2 に保存）
 *   POST /api/upload   本体=動画ファイル, ヘッダー x-filename  → { url, size }
 *   GET  /api/upload   → 使用量 { bytes, count, limit }
 */
import { json, userOf } from '../../server/auth';

interface Env {
  MEDIA: R2Bucket;
}

export const MAX_BYTES = 10 * 1024 * 1024; // 1ファイル 10MB まで
const FREE_BYTES = 10 * 1024 ** 3; // R2 無料枠 10GB
const TYPES: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!userOf(request)) return json({ error: 'ログインが必要です' }, 401);
  if (!env.MEDIA) return json({ error: '動画の保存先（R2）が設定されていません' }, 500);
  const type = (request.headers.get('content-type') ?? '').split(';')[0].trim();
  const ext = TYPES[type];
  if (!ext) return json({ error: 'mp4 / webm / mov の動画ファイルを選んでください' }, 400);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) return json({ error: '動画は10MBまでです。長い動画はYouTubeに上げてURLを貼ってください' }, 413);

  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0) return json({ error: 'ファイルが空です' }, 400);
  if (buf.byteLength > MAX_BYTES) return json({ error: '動画は10MBまでです。長い動画はYouTubeに上げてURLを貼ってください' }, 413);

  const now = new Date();
  const key = `videos/${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;
  const name = decodeURIComponent(request.headers.get('x-filename') ?? '').slice(0, 200);
  await env.MEDIA.put(key, buf, {
    httpMetadata: { contentType: type },
    customMetadata: { name, uploadedAt: now.toISOString() },
  });
  return json({ url: `/media/${key}`, size: buf.byteLength }, 201);
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (!env.MEDIA) return json({ bytes: 0, count: 0, limit: FREE_BYTES, maxFile: MAX_BYTES, configured: false });
  let bytes = 0;
  let count = 0;
  let cursor: string | undefined;
  do {
    const page = await env.MEDIA.list({ cursor, limit: 1000 });
    for (const o of page.objects) {
      bytes += o.size;
      count++;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return json({ bytes, count, limit: FREE_BYTES, maxFile: MAX_BYTES, configured: true });
};
