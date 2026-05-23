// 闘神(DR)関連の定数とデコーダ。
//
// puddle.farm は単一の `rating` フィールドで RP と DR の両方を符号化している:
//   - rating > DR_OFFSET → DR (実値 = rating - DR_OFFSET, 概ね 1500〜1800台)
//   - それ以下          → RP (Tower R-Code 値、数千〜数万)
// 出典: nemasu/puddle-farm の `src/handlers/rating_sync.rs` で
// `{Char}_MasterRatingPt` (DR) に `+10_000_000` を足して保存している規約。
export const DR_OFFSET = 10_000_000;

export type RatingKind = 'RP' | 'DR';
export type DecodedRating = { kind: RatingKind; value: number };

export function decodeRating(raw: number): DecodedRating {
  return raw > DR_OFFSET
    ? { kind: 'DR', value: raw - DR_OFFSET }
    : { kind: 'RP', value: raw };
}

// DR のサブティア境界。グラフ上のオーバーレイ帯として使用する。
// プレイヤー行へのラベル表示には(現状の仕様では)使わない。
export const DR_RANK_TIERS: { name: string; min: number; color: string }[] = [
  { name: '闘神 III ヴィンデクス', min: 1800, color: '#ff8a4d' },
  { name: '闘神 II ヴィルタス',   min: 1700, color: '#ffc04d' },
  { name: '闘神 I イグニス',     min: 1600, color: '#ffe066' },
];
