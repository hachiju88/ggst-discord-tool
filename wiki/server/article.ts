/**
 * フォームから受け取った記事データの検証と、Markdownファイルへの変換。
 * サイト側の content.config.ts と同じルールで検証し、ビルドが壊れる記事を保存しないようにする。
 */
import { parse, stringify } from 'yaml';
import { bodyVideos } from '../src/lib/video';
import { CATEGORIES, POSITIONED, TRAINING_LINKABLE, VERSIONS, type CategoryId } from '../src/site.config';

export const CONTENT_DIR = 'wiki/src/content/docs';

export type VideoIn = { url: string; title?: string };
export type ComboIn = { route: string; damage?: number; tension?: number; note?: string };

export type ArticleInput = {
  category: CategoryId;
  position?: 'center' | 'corner';
  slug: string;
  title: string;
  description?: string;
  versions?: string[];
  starter?: string;
  counterHit?: boolean;
  damage?: number;
  difficulty?: number;
  opponent?: string;
  tags: string[];
  videos: VideoIn[];
  combos: ComboIn[];
  training: string[];
  body: string;
};

export class InputError extends Error {}

const CAT_IDS = CATEGORIES.map((c) => c.id) as string[];
const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;

const str = (v: unknown, max: number, label: string, required = false): string | undefined => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new InputError(`${label}を入力してください`);
    return undefined;
  }
  if (typeof v !== 'string') throw new InputError(`${label}の形式が正しくありません`);
  const t = v.trim();
  if (!t && required) throw new InputError(`${label}を入力してください`);
  if (t.length > max) throw new InputError(`${label}は${max}文字までです`);
  return t || undefined;
};
const num = (v: unknown, label: string, min: number, max: number): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new InputError(`${label}は${min}〜${max}の数値にしてください`);
  return Math.round(n);
};

/** 記事ID（パス）。例: combos/center/2k-basic, matchups/sol */
export function articleId(a: { category: string; position?: string; slug: string }) {
  return POSITIONED.includes(a.category as CategoryId) ? `${a.category}/${a.position}/${a.slug}` : `${a.category}/${a.slug}`;
}
export const pathOf = (id: string) => `${CONTENT_DIR}/${id}.md`;

/** 記事IDとして正しい形か（パストラバーサル防止も兼ねる） */
export function isValidId(id: string) {
  const parts = id.split('/');
  if (!CAT_IDS.includes(parts[0])) return false;
  if (POSITIONED.includes(parts[0] as CategoryId)) {
    return parts.length === 3 && (parts[1] === 'center' || parts[1] === 'corner') && SLUG.test(parts[2]);
  }
  return parts.length === 2 && SLUG.test(parts[1]);
}

export function validate(raw: any): ArticleInput {
  if (!raw || typeof raw !== 'object') throw new InputError('データが空です');
  const category = raw.category;
  if (!CAT_IDS.includes(category)) throw new InputError('カテゴリを選んでください');
  const positioned = POSITIONED.includes(category);
  const position = positioned ? raw.position : undefined;
  if (positioned && position !== 'center' && position !== 'corner') throw new InputError('立ち位置を選んでください');

  const slug = String(raw.slug ?? '').trim();
  if (!SLUG.test(slug)) throw new InputError('URL名は半角英小文字・数字・ハイフンで60文字以内にしてください');

  let versions: string[] | undefined;
  if (raw.versions !== undefined && raw.versions !== null) {
    if (!Array.isArray(raw.versions)) throw new InputError('バージョンの形式が正しくありません');
    versions = VERSIONS.filter((v) => raw.versions.includes(v));
    const unknown = raw.versions.filter((v: string) => !(VERSIONS as readonly string[]).includes(v));
    if (unknown.length) throw new InputError(`不明なバージョンです: ${unknown.join(', ')}`);
  }

  const tags = Array.isArray(raw.tags)
    ? [...new Set(raw.tags.map((t: unknown) => str(t, 30, 'タグ')).filter(Boolean) as string[])].slice(0, 20)
    : [];

  const videos: VideoIn[] = (Array.isArray(raw.videos) ? raw.videos : []).slice(0, 10).map((v: any) => {
    const url = str(v?.url, 500, '動画URL', true)!;
    if (!/^(https:\/\/|\/media\/|\/samples\/)/.test(url)) throw new InputError('動画URLは https:// で始まるURLにしてください');
    return { url, title: str(v?.title, 100, '動画タイトル') };
  });

  const combos: ComboIn[] = (Array.isArray(raw.combos) ? raw.combos : []).slice(0, 20).map((c: any) => ({
    route: str(c?.route, 300, 'コンボパーツ', true)!,
    damage: num(c?.damage, 'コンボのダメージ', 0, 9999),
    tension: num(c?.tension, 'テンション', 0, 100),
    note: str(c?.note, 200, 'コンボの補足'),
  }));

  const training = Array.isArray(raw.training) ? [...new Set(raw.training.map(String))] as string[] : [];
  if (training.length && !TRAINING_LINKABLE.includes(category)) throw new InputError('このカテゴリは練習方法と紐づけられません');
  for (const t of training) if (!SLUG.test(t)) throw new InputError('練習方法の指定が正しくありません');

  const body = typeof raw.body === 'string' ? raw.body.replace(/\r\n/g, '\n') : '';
  if (body.length > 50000) throw new InputError('本文は50000文字までです');

  return {
    category,
    position,
    slug,
    title: str(raw.title, 100, 'タイトル', true)!,
    description: str(raw.description, 200, '説明'),
    versions,
    starter: str(raw.starter, 20, '始動技'),
    counterHit: typeof raw.counterHit === 'boolean' ? raw.counterHit : undefined,
    damage: num(raw.damage, 'ダメージ', 0, 9999),
    difficulty: num(raw.difficulty, '難易度', 1, 5),
    opponent: category === 'matchups' ? str(raw.opponent, 30, '相手キャラ') : undefined,
    tags,
    videos,
    combos,
    training,
    body,
  };
}

/** Markdownファイル → frontmatter と本文 */
export function parseFile(text: string): { data: Record<string, any>; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text };
  return { data: (parse(m[1]) as Record<string, any>) ?? {}, body: m[2].replace(/^\n/, '') };
}

/** フォームの項目（既存ファイルにしかない項目は残す） */
const FORM_KEYS = [
  'title', 'description', 'versions', 'position', 'starter', 'counterHit', 'damage',
  'difficulty', 'opponent', 'videos', 'combos', 'training', 'tags',
] as const;

export function toFile(a: ArticleInput, existing: Record<string, any> = {}): string {
  const data: Record<string, any> = { ...existing };
  for (const k of FORM_KEYS) delete data[k];
  const set = (k: string, v: unknown) => {
    if (v === undefined || (Array.isArray(v) && v.length === 0 && k !== 'versions')) return;
    data[k] = v;
  };
  set('title', a.title);
  set('description', a.description);
  set('versions', a.versions);
  set('position', a.position);
  set('starter', a.starter);
  set('counterHit', a.counterHit);
  set('damage', a.damage);
  set('difficulty', a.difficulty);
  set('opponent', a.opponent);
  set('videos', a.videos.map((v) => (v.title ? v : v.url)));
  set('combos', a.combos.map((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined))));
  set('training', a.training);
  set('tags', a.tags);
  const order = ['title', 'description', ...Object.keys(data).filter((k) => k !== 'title' && k !== 'description')];
  const sorted = Object.fromEntries(order.filter((k) => k in data).map((k) => [k, data[k]]));
  return `---\n${stringify(sorted, { lineWidth: 0 }).trimEnd()}\n---\n\n${a.body.trim()}\n`;
}

/** 新しい練習方法の記事（同時作成用） */
export function trainingInput(raw: any, versions: string[] | undefined): ArticleInput {
  return validate({ ...raw, category: 'training', versions, tags: raw?.tags ?? [], videos: [], combos: [], training: [] });
}

/** 記事から参照している、このサイトにアップロードした動画のキー（本文の ![タイトル](URL) も含む） */
export function mediaKeys(data: { videos?: (string | { url: string })[] }, body?: string): string[] {
  return [...(data.videos ?? []).map((v) => (typeof v === 'string' ? v : v?.url)), ...bodyVideos(body).map((v) => v.url)]
    .filter((u): u is string => typeof u === 'string' && u.startsWith('/media/'))
    .map((u) => u.slice('/media/'.length));
}
