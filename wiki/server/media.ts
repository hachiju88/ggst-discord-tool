/**
 * アップロード動画の管理。
 *  - media:      アップロードされた動画（誰が・いつ）
 *  - media_refs: どの記事がどの動画を使っているか
 * どの記事からも使われていない動画だけを R2 から消す（共有している動画は消さない）。
 * 保存されないまま放置されたアップロードは、一定時間後にまとめて消す。
 */
export interface MediaEnv {
  DB: D1Database;
  MEDIA?: R2Bucket;
}

/** 保存されずに残ったアップロードを消すまでの猶予 */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export async function recordUpload(env: MediaEnv, key: string, user: string, size: number) {
  await env.DB.prepare('INSERT INTO media (key, user, size, created_at) VALUES (?, ?, ?, ?)')
    .bind(key, user, size, new Date().toISOString())
    .run();
}

/** 記事が使っている動画を登録し直す（oldPage は URL 変更前の記事ID） */
export async function setRefs(env: MediaEnv, page: string, keys: string[], oldPage?: string) {
  const stmts = [env.DB.prepare('DELETE FROM media_refs WHERE page = ? OR page = ?').bind(page, oldPage ?? page)];
  for (const k of new Set(keys)) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO media_refs (key, page) VALUES (?, ?)').bind(k, page));
  await env.DB.batch(stmts);
}

/** 指定した動画のうち、どの記事からも使われていないものを削除する */
export async function releaseUnreferenced(env: MediaEnv, keys: string[]) {
  if (!keys.length) return;
  const marks = keys.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT m.key FROM media m WHERE m.key IN (${marks}) AND NOT EXISTS (SELECT 1 FROM media_refs r WHERE r.key = m.key)`,
  )
    .bind(...keys)
    .all<{ key: string }>();
  await remove(env, results.map((r) => r.key));
}

/** 保存されないまま猶予を過ぎたアップロードを削除する */
export async function sweepOrphans(env: MediaEnv) {
  const cutoff = new Date(Date.now() - ORPHAN_GRACE_MS).toISOString();
  const { results } = await env.DB.prepare(
    'SELECT m.key FROM media m WHERE m.created_at < ? AND NOT EXISTS (SELECT 1 FROM media_refs r WHERE r.key = m.key) LIMIT 100',
  )
    .bind(cutoff)
    .all<{ key: string }>();
  await remove(env, results.map((r) => r.key));
}

/** 自分がアップロードして、まだどの記事にも使われていない動画なら削除できる（フォームで × を押したとき） */
export async function discardOwnUpload(env: MediaEnv, key: string, user: string): Promise<boolean> {
  const row = await env.DB.prepare(
    'SELECT key FROM media m WHERE key = ? AND user = ? AND NOT EXISTS (SELECT 1 FROM media_refs r WHERE r.key = m.key)',
  )
    .bind(key, user)
    .first();
  if (!row) return false;
  await remove(env, [key]);
  return true;
}

async function remove(env: MediaEnv, keys: string[]) {
  if (!keys.length) return;
  if (env.MEDIA) await env.MEDIA.delete(keys);
  await env.DB.batch(keys.map((k) => env.DB.prepare('DELETE FROM media WHERE key = ?').bind(k)));
}
