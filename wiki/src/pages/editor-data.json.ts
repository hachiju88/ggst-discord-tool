/** 記事作成フォーム用のデータ（既存記事の一覧・タグ候補など）。ビルド時に生成 */
import { getCollection } from 'astro:content';
import { CATEGORIES } from '../site.config';

export async function GET() {
  const cats = CATEGORIES.map((c) => c.id) as string[];
  const docs = (await getCollection('docs')).filter((d) => {
    const top = d.id.split('/')[0];
    return cats.includes(top) && d.id !== top;
  });
  const articles = docs.map((d) => ({
    id: d.id,
    title: d.data.title,
    description: d.data.description,
    data: {
      versions: d.data.versions,
      position: d.data.position,
      starter: d.data.starter,
      counterHit: d.data.counterHit,
      damage: d.data.damage,
      difficulty: d.data.difficulty,
      opponent: d.data.opponent,
      videos: d.data.videos,
      combos: d.data.combos,
      training: d.data.training,
      tags: d.data.tags,
    },
  }));
  const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter(Boolean))].sort() as string[];
  return new Response(
    JSON.stringify({
      articles,
      tags: uniq(docs.flatMap((d) => d.data.tags)),
      starters: uniq(docs.map((d) => d.data.starter)),
      opponents: uniq(docs.map((d) => d.data.opponent)),
    }),
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
}
