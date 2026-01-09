// ギルティギア・ストライブ 全キャラクター名
export const GGST_CHARACTERS = [
  'ソル=バッドガイ',
  'カイ=キスク',
  'メイ',
  'アクセル・ロウ',
  'チップ・ザナフ',
  'ポチョムキン',
  'ファウスト',
  'ミリア・レイジ',
  'ザトー=ONE',
  'ラムレザル=ヴァレンタイン',
  'レオ・ホワイトファング',
  'ナゴリユキ',
  'ジオヴァーナ',
  'アンジー',
  'イノ',
  'ゴールドルイス',
  'ジャック・オー',
  'ハッピーカオス',
  'バイケン',
  'テスタメント',
  'ブリジット',
  'シン・キスク',
  'ベッドマン?',
  'アスカR#',
  'ジョニー',
  'エルフェルト',
  'スレイヤー',
  'ディズィー',
  'ルーシー'
] as const;

// 勝敗の選択肢
export const RESULT_CHOICES = [
  { name: '勝利', value: 'win' },
  { name: '敗北', value: 'loss' }
] as const;

// エクスポート形式の選択肢
export const EXPORT_FORMAT_CHOICES = [
  { name: 'Markdown', value: 'markdown' },
  { name: 'テキスト', value: 'text' }
] as const;
