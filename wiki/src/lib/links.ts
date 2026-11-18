import { getCollection, type CollectionEntry } from 'astro:content';
import { TRAINING_LINKABLE, type CategoryId } from '../site.config';

type Doc = CollectionEntry<'docs'>;

const categoryOf = (id: string) => id.split('/')[0];
const normalize = (ref: string) => (ref.startsWith('training/') ? ref : `training/${ref}`).replace(/\/$/, '');

let cache: Promise<Doc[]> | undefined;
const docs = () => (cache ??= getCollection('docs'));

/** 記事に紐づいた練習方法の記事。存在しない・紐づけ不可のカテゴリならビルドエラーにする */
export async function trainingFor(entry: { id: string; data: { training?: string[] } }): Promise<Doc[]> {
  const refs = entry.data.training ?? [];
  if (!refs.length) return [];
  if (!TRAINING_LINKABLE.includes(categoryOf(entry.id) as CategoryId)) {
    throw new Error(`[${entry.id}] このカテゴリの記事は練習方法と紐づけられません`);
  }
  const all = await docs();
  return refs.map((r) => {
    const found = all.find((d) => d.id === normalize(r));
    if (!found) throw new Error(`[${entry.id}] training に指定した記事 "${r}" が見つかりません`);
    return found;
  });
}

/** 練習方法の記事を紐づけている記事の一覧（逆引き） */
export async function linkedFrom(trainingId: string): Promise<Doc[]> {
  const all = await docs();
  return all.filter((d) => (d.data.training ?? []).some((r) => normalize(r) === trainingId));
}
