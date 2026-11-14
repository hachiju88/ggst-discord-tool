// puddle.farm のキャラクター略称コード → 正式名。
// コード一覧は nemasu/puddle-farm の CHAR_NAMES (src/main.rs) と同じ並び。
// API にアクセスできない状況でもキャラ名を表示できるよう手元に持つ。
export const PUDDLE_CHARACTERS: Record<string, { en: string; ja: string }> = {
  SO: { en: 'Sol', ja: 'ソル・バッドガイ' },
  KY: { en: 'Ky', ja: 'カイ・キスク' },
  MA: { en: 'May', ja: 'メイ' },
  AX: { en: 'Axl', ja: 'アクセル・ロウ' },
  CH: { en: 'Chipp', ja: 'チップ・ザナフ' },
  PO: { en: 'Potemkin', ja: 'ポチョムキン' },
  FA: { en: 'Faust', ja: 'ファウスト' },
  MI: { en: 'Millia', ja: 'ミリア・レイジ' },
  ZA: { en: 'Zato-1', ja: 'ザトー=ONE' },
  RA: { en: 'Ramlethal', ja: 'ラムレザル・ヴァレンタイン' },
  LE: { en: 'Leo', ja: 'レオ・ホワイトファング' },
  NA: { en: 'Nagoriyuki', ja: '名残雪' },
  GI: { en: 'Giovanna', ja: 'ジョヴァンナ' },
  AN: { en: 'Anji', ja: '御津闇慈' },
  IN: { en: 'I-No', ja: 'イノ' },
  GO: { en: 'Goldlewis', ja: 'ゴールドルイス・ディキンソン' },
  JC: { en: "Jack-O'", ja: 'ジャック・オー・ヴァレンタイン' },
  HA: { en: 'Happy Chaos', ja: 'ハッピーケイオス' },
  BA: { en: 'Baiken', ja: '梅喧' },
  TE: { en: 'Testament', ja: 'テスタメント' },
  BI: { en: 'Bridget', ja: 'ブリジット' },
  SI: { en: 'Sin', ja: 'シン・キスク' },
  BE: { en: 'Bedman?', ja: 'ベッドマン?' },
  AS: { en: 'Asuka', ja: '飛鳥=R=クロイツ' },
  JN: { en: 'Johnny', ja: 'ジョニー' },
  EL: { en: 'Elphelt', ja: 'エルフェルト・ヴァレンタイン' },
  AB: { en: 'A.B.A.', ja: 'A.B.A' },
  SL: { en: 'Slayer', ja: 'スレイヤー' },
  DI: { en: 'Dizzy', ja: 'クイーン・ディズィー' },
  VE: { en: 'Venom', ja: 'ヴェノム' },
  UN: { en: 'Unika', ja: 'ユニカ' },
  LU: { en: 'Lucy', ja: 'ルーシー' },
  JA: { en: 'Jam', ja: '蔵土縁紗夢' },
  RK: { en: 'Robo-Ky', ja: 'ロボカイ' },
};

export function isPuddleCharCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(PUDDLE_CHARACTERS, code.toUpperCase());
}

// 表示用のキャラ名(日本語の正式名)。未知コードは保存済みの名前 → コードの順で代替。
export function characterDisplayName(charShort: string, fallback?: string): string {
  return PUDDLE_CHARACTERS[charShort.toUpperCase()]?.ja || fallback || charShort;
}

// puddle.farm のプレイヤーページ URL から player ID / キャラコードを取り出す。
// 例: https://puddle.farm/player/210808125103331848/GI
//     puddle.farm/player/210808125103331848   (キャラ省略)
//     210808125103331848                        (ID のみ)
export function parsePuddlePlayerInput(input: string): { playerId: string; charShort?: string } | null {
  const s = input.trim();
  // ホストは puddle.farm 限定、ID・キャラコードの後ろは末尾の / やクエリ(? #)のみ許可
  // (長すぎる ID や 3文字以上のコードを途中で切って誤登録しないため)
  const m = s.match(
    /^(?:https?:\/\/)?(?:www\.)?puddle\.farm\/player\/(\d{5,25})(?:\/([A-Za-z]{2}))?\/?(?:[?#].*)?$/,
  );
  if (m) return { playerId: m[1], charShort: m[2]?.toUpperCase() };
  if (/^\d{5,25}$/.test(s)) return { playerId: s };
  return null;
}
