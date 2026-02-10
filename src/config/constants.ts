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
  'レオ=ホワイトファング',
  '名残雪',
  'ジオヴァーナ',
  '闇慈',
  'イノ',
  'ゴールドルイス',
  'ジャック・オー',
  'ハッピーケイオス',
  '梅喧',
  'テスタメント',
  'ブリジット',
  'シン・キスク',
  'ベッドマン?',
  'アスカR#',
  'ジョニー',
  'エルフェルト',
  'A.B.A',
  'スレイヤー',
  'ディズィー',
  'ヴェノム',
  'ユニカ',
  'ルーシー'
] as const;

// 勝敗の選択肢
export const RESULT_CHOICES = [
  { name: '勝利', value: 'win' },
  { name: '敗北', value: 'loss' }
] as const;

// 優先度の選択肢
export const PRIORITY_CHOICES = [
  { name: '🔴 重要（絶対に覚える）', value: 'critical' },
  { name: '🟡 大事（できれば覚える）', value: 'important' },
  { name: '🟢 推奨（余裕があれば）', value: 'recommended' }
] as const;

// コンボの位置選択肢
export const LOCATION_CHOICES = [
  { name: '画面中央', value: 'center' },
  { name: '画面端', value: 'corner' }
] as const;

// テンションゲージの選択肢
export const TENSION_GAUGE_CHOICES = [
  { name: '0%', value: 0 },
  { name: '50%', value: 50 },
  { name: '100%', value: 100 }
] as const;

// 始動の選択肢
export const STARTER_CHOICES = [
  { name: '通常', value: 'normal' },
  { name: 'カウンター', value: 'counter' }
] as const;

// エクスポート形式の選択肢
export const EXPORT_FORMAT_CHOICES = [
  { name: 'Markdown', value: 'markdown' },
  { name: 'テキスト', value: 'text' }
] as const;

// コンボ表示範囲の選択肢
export const COMBO_SCOPE_CHOICES = [
  { name: '自分のコンボのみ', value: 'mine' },
  { name: 'みんなのコンボ', value: 'all' }
] as const;
