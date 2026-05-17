export const RANKS = [
  '闘神 グラマス', '闘神 ハイマス', '闘神',
  'ダイヤ３', 'ダイヤ２', 'ダイヤ１',
  'プラチナ３', 'プラチナ２', 'プラチナ１',
  'ゴールド３', 'ゴールド２', 'ゴールド１',
  'シルバー３', 'シルバー２', 'シルバー１',
  'ブロンズ３', 'ブロンズ２', 'ブロンズ１',
  'アイアン３', 'アイアン２', 'アイアン１',
] as const

export type Rank = typeof RANKS[number]

export function getRankIndex(rank: string): number {
  return RANKS.indexOf(rank as Rank)
}

export function getRankDiff(rankA: string, rankB: string): number {
  const ia = getRankIndex(rankA)
  const ib = getRankIndex(rankB)
  if (ia === -1 || ib === -1) return 0
  return Math.abs(ia - ib)
}
