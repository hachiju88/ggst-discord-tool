/**
 * サイト全体の設定。
 * CURRENT_VERSION を新しいパッチに合わせて書き換えると、
 * 「現行バージョン」の判定がサイト全体で切り替わります。
 */
export const CURRENT_VERSION = '2.00';

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

/** 記事が現行バージョンで使えないかどうか */
export function isOld(data: { version?: string; brokenIn?: string }) {
  return data.version === 'old' || !!data.brokenIn;
}
