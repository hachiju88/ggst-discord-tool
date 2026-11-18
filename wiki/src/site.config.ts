/**
 * 管理対象のバージョン一覧（古い順）。
 * 新しいパッチが出たら末尾に追加するだけで、最後のものが「現行」になります。
 * ※ 2.01 / 2.02 はプロトタイプ用のダミーです。実際のパッチ履歴に置き換えてください。
 */
export const VERSIONS = ['2.00', '2.01', '2.02'] as const;
export const CURRENT_VERSION = VERSIONS[VERSIONS.length - 1];

export const CATEGORIES = [
  { id: 'basics', label: '基本戦略', en: 'BASICS', desc: 'ブリジットの勝ち筋と全体の考え方' },
  { id: 'neutral', label: '立ち回り', en: 'NEUTRAL', desc: '牽制・差し返し・ヨーヨーの置き方' },
  { id: 'combos', label: 'コンボ', en: 'COMBOS', desc: '立ち位置・始動技・カウンター別のレシピ' },
  { id: 'okizeme', label: '起き攻め', en: 'OKIZEME', desc: 'ダウンを取った後の択と詐欺重ね' },
  { id: 'setplay', label: 'セットプレイ', en: 'SET PLAY', desc: 'ヨーヨーを絡めた固め・連携' },
  { id: 'matchups', label: 'キャラ対策', en: 'MATCHUPS', desc: '相手キャラごとの注意点' },
  { id: 'training', label: '練習方法', en: 'TRAINING', desc: 'トレモ設定と練習メニュー' },
  { id: 'faq', label: 'Q&A', en: 'Q&A', desc: 'よくある疑問とその答え' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

/** 立ち位置で分けるカテゴリ */
export const POSITIONED: CategoryId[] = ['combos', 'okizeme', 'setplay'];

export const POSITION_LABEL = { center: '画面中央', corner: '画面端' } as const;

type VersionData = { versions?: readonly string[] };

/**
 * 記事が使えるバージョン一覧（frontmatter の versions をそのまま使う）。
 * versions を書いていない記事はバージョンに関係しないもの（undefined を返す）。
 */
export function validVersions(data: VersionData): readonly string[] | undefined {
  return data.versions;
}

/** 現行バージョンで使えない記事（versions に現行が入っていない） */
export function isOld(data: VersionData) {
  return !!data.versions && !data.versions.includes(CURRENT_VERSION);
}

/** 「Ver.2.00 / 2.02」のような表記（VERSIONS の順に並べる） */
export function versionLabel(data: VersionData) {
  if (!data.versions) return '';
  const vs = VERSIONS.filter((v) => data.versions!.includes(v));
  return vs.length ? `Ver.${vs.join(' / ')}` : '';
}
