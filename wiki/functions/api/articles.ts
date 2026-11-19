/**
 * Cloudflare Pages Functions: 記事の作成・編集・削除（GitHub に保存）
 *   GET    /api/articles?id=<記事ID>          → { id, sha, data, body }
 *   POST   /api/articles   { article, newTraining? }            → 作成
 *   PUT    /api/articles?id=<記事ID>  { article, sha, newTraining? } → 更新（URL変更も可）
 *   DELETE /api/articles?id=<記事ID>&sha=<sha>                  → 削除
 * 保存すると GitHub にコミットされ、Cloudflare Pages が自動で再ビルドする（1〜2分で反映）。
 */
import { json, userOf } from '../../server/auth';
import { setRefs, releaseUnreferenced } from '../../server/media';
import { commit, getFile, blobSha, ConflictError, type Change, type GitHubEnv } from '../../server/github';
import {
  validate, toFile, parseFile, articleId, pathOf, isValidId, trainingInput, mediaKeys, InputError, type ArticleInput,
} from '../../server/article';

interface Env extends GitHubEnv {
  DB: D1Database;
  MEDIA?: R2Bucket;
}

const fail = (e: unknown) => {
  if (e instanceof InputError) return json({ error: e.message }, 400);
  if (e instanceof ConflictError) return json({ error: e.message }, 409);
  console.error(e);
  return json({ error: (e as Error).message || '保存に失敗しました' }, 500);
};

async function log(env: Env, page: string, action: string, user: string) {
  try {
    await env.DB.prepare('INSERT INTO article_log (page, action, user, at) VALUES (?, ?, ?, ?)')
      .bind(page, action, user, new Date().toISOString())
      .run();
  } catch {}
}

/** 紐づける練習方法が実在するか（同時作成するものは除く） */
async function checkTraining(env: Env, a: ArticleInput, creating?: string) {
  for (const t of a.training) {
    if (t === creating) continue;
    if (!(await getFile(env, pathOf(`training/${t}`)))) throw new InputError(`練習方法「${t}」が見つかりません`);
  }
}

/** 同時作成する練習方法 */
function newTrainingChange(raw: any, a: ArticleInput): { change: Change; slug: string } | undefined {
  if (!raw) return;
  const t = trainingInput(raw, a.versions);
  if (!a.training.includes(t.slug)) a.training.push(t.slug);
  return { change: { path: pathOf(`training/${t.slug}`), content: toFile(t), expectSha: null }, slug: t.slug };
}

const requireUser = (req: Request) => {
  const u = userOf(req);
  if (!u) throw new InputError('ログインが必要です');
  return u;
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!isValidId(id)) return json({ error: '記事が見つかりません' }, 404);
  try {
    const f = await getFile(env, pathOf(id));
    if (!f) return json({ error: '記事が見つかりません（フォーム以外で作った .mdx の記事は編集できません）' }, 404);
    const { data, body } = parseFile(f.text);
    return json({ id, sha: f.sha, data, body });
  } catch (e) {
    return fail(e);
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = requireUser(request);
    const req = (await request.json().catch(() => ({}))) as any;
    const a = validate(req.article);
    const id = articleId(a);
    const nt = newTrainingChange(req.newTraining, a);
    await checkTraining(env, a, nt?.slug);
    const content = toFile(a);
    const changes: Change[] = [...(nt ? [nt.change] : []), { path: pathOf(id), content, expectSha: null }];
    await commit(env, changes, `wiki: 記事を作成「${a.title}」${nt ? '＋練習方法' : ''}`);
    await setRefs(env, id, mediaKeys(a));
    await log(env, id, 'create', user);
    if (nt) await log(env, `training/${nt.slug}`, 'create', user);
    return json({ ok: true, id, sha: await blobSha(content), training: nt?.slug }, 201);
  } catch (e) {
    return fail(e);
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = requireUser(request);
    const oldId = new URL(request.url).searchParams.get('id') ?? '';
    if (!isValidId(oldId)) throw new InputError('記事が見つかりません');
    const req = (await request.json().catch(() => ({}))) as any;
    if (typeof req.sha !== 'string') throw new InputError('編集元の情報がありません。読み込み直してください');
    const a = validate(req.article);
    const id = articleId(a);
    if (oldId.startsWith('training/') && id !== oldId) {
      throw new InputError('練習方法の記事はカテゴリやURL名を変更できません（紐づけが外れてしまうため）');
    }
    const cur = await getFile(env, pathOf(oldId));
    if (!cur) throw new ConflictError('この記事はすでに削除されています');
    const old = parseFile(cur.text);

    const nt = newTrainingChange(req.newTraining, a);
    await checkTraining(env, a, nt?.slug);
    const content = toFile(a, old.data);
    const changes: Change[] = [...(nt ? [nt.change] : [])];
    if (id === oldId) changes.push({ path: pathOf(id), content, expectSha: req.sha });
    else changes.push({ path: pathOf(id), content, expectSha: null }, { path: pathOf(oldId), delete: true, expectSha: req.sha });

    await commit(env, changes, `wiki: 記事を更新「${a.title}」`);

    if (id !== oldId) {
      // コメント・いいね・お気に入りを新しいURLへ引き継ぐ
      await env.DB.batch([
        env.DB.prepare('UPDATE comments SET page = ? WHERE page = ?').bind(id, oldId),
        env.DB.prepare('UPDATE OR IGNORE reactions SET page = ? WHERE page = ?').bind(id, oldId),
        env.DB.prepare('DELETE FROM reactions WHERE page = ?').bind(oldId),
      ]);
    }
    // 記事から外したアップロード動画は、ほかの記事でも使われていなければ削除して容量を空ける
    const keep = new Set(mediaKeys(a));
    await setRefs(env, id, [...keep], oldId);
    await releaseUnreferenced(env, mediaKeys(old.data).filter((k) => !keep.has(k)));

    await log(env, id, id === oldId ? 'update' : `move:${oldId}`, user);
    if (nt) await log(env, `training/${nt.slug}`, 'create', user);
    return json({ ok: true, id, sha: await blobSha(content), training: nt?.slug });
  } catch (e) {
    return fail(e);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const user = requireUser(request);
    const q = new URL(request.url).searchParams;
    const id = q.get('id') ?? '';
    const sha = q.get('sha') ?? '';
    if (!isValidId(id) || !sha) throw new InputError('記事が見つかりません');
    const cur = await getFile(env, pathOf(id));
    if (!cur) throw new ConflictError('この記事はすでに削除されています');
    const title = parseFile(cur.text).data.title ?? id;
    await commit(env, [{ path: pathOf(id), delete: true, expectSha: sha }], `wiki: 記事を削除「${title}」`);

    await env.DB.batch([
      env.DB.prepare('DELETE FROM comments WHERE page = ?').bind(id),
      env.DB.prepare('DELETE FROM reactions WHERE page = ?').bind(id),
    ]);
    await setRefs(env, id, []);
    await releaseUnreferenced(env, mediaKeys(parseFile(cur.text).data));
    await log(env, id, 'delete', user);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
};
