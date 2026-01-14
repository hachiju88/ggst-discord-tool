import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

/**
 * 全キャラ共通の技データを登録
 */

const commonMoves = [
  // 地上通常技
  { name: '立ちパンチ', name_en: 'Standing Punch', notation: '5P', type: '通常技', order: 1 },
  { name: '立ちキック', name_en: 'Standing Kick', notation: '5K', type: '通常技', order: 2 },
  { name: '近スラッシュ', name_en: 'Close Slash', notation: '近S', type: '通常技', order: 3 },
  { name: '遠スラッシュ', name_en: 'Far Slash', notation: '遠S', type: '通常技', order: 4 },
  { name: '立ちヘビースラッシュ', name_en: 'Standing Heavy Slash', notation: '5HS', type: '通常技', order: 5 },

  // しゃがみ通常技
  { name: 'しゃがみパンチ', name_en: 'Crouching Punch', notation: '2P', type: '通常技', order: 6 },
  { name: 'しゃがみキック', name_en: 'Crouching Kick', notation: '2K', type: '通常技', order: 7 },
  { name: 'しゃがみスラッシュ', name_en: 'Crouching Slash', notation: '2S', type: '通常技', order: 8 },
  { name: 'しゃがみヘビースラッシュ', name_en: 'Crouching Heavy Slash', notation: '2HS', type: '通常技', order: 9 },

  // 前入れ技
  { name: '前パンチ', name_en: 'Forward Punch', notation: '6P', type: '通常技', order: 10 },
  { name: '前キック', name_en: 'Forward Kick', notation: '6K', type: '通常技', order: 11 },
  { name: '前ヘビースラッシュ', name_en: 'Forward Heavy Slash', notation: '6HS', type: '通常技', order: 12 },

  // 特殊技
  { name: '足払い', name_en: 'Sweep', notation: '2D', type: '特殊技', order: 13 },
  { name: 'ダスト', name_en: 'Dust', notation: '5D', type: '特殊技', order: 14 },
  { name: '溜めダスト', name_en: 'Charged Dust', notation: '溜め5D', type: '特殊技', order: 15 },

  // 空中通常技
  { name: '空中パンチ', name_en: 'Jump Punch', notation: 'j.P', type: '空中技', order: 16 },
  { name: '空中キック', name_en: 'Jump Kick', notation: 'j.K', type: '空中技', order: 17 },
  { name: '空中スラッシュ', name_en: 'Jump Slash', notation: 'j.S', type: '空中技', order: 18 },
  { name: '空中ヘビースラッシュ', name_en: 'Jump Heavy Slash', notation: 'j.HS', type: '空中技', order: 19 },
  { name: '空中ダスト', name_en: 'Jump Dust', notation: 'j.D', type: '空中技', order: 20 },

  // 投げ
  { name: '前投げ', name_en: 'Forward Throw', notation: '6D', type: '投げ', order: 21 },
  { name: '後ろ投げ', name_en: 'Back Throw', notation: '4D', type: '投げ', order: 22 },
  { name: '空中投げ', name_en: 'Air Throw', notation: '空中投げ', type: '投げ', order: 23 },

  // ロマンキャンセル
  { name: '赤ロマキャン', name_en: 'Red Roman Cancel', notation: '赤RC', type: 'RC', order: 24 },
  { name: 'ダッシュ赤ロマキャン', name_en: 'Dash Red RC', notation: 'ダッシュ赤RC', type: 'RC', order: 25 },
  { name: '黄ロマキャン', name_en: 'Yellow Roman Cancel', notation: '黄RC', type: 'RC', order: 26 },
  { name: '紫ロマキャン', name_en: 'Purple Roman Cancel', notation: '紫RC', type: 'RC', order: 27 },
  { name: 'ダッシュ紫ロマキャン', name_en: 'Dash Purple RC', notation: 'ダッシュ紫RC', type: 'RC', order: 28 },

  // ワイルドアサルト
  { name: 'ワイルドアサルト', name_en: 'Wild Assault', notation: 'WA', type: 'システム', order: 29 },
  { name: '溜めワイルドアサルト', name_en: 'Charged Wild Assault', notation: '溜めWA', type: 'システム', order: 30 },

  // 移動
  { name: 'ダッシュ', name_en: 'Dash', notation: 'd', type: '移動', order: 31 },
  { name: 'バックステップ', name_en: 'Backstep', notation: 'bs', type: '移動', order: 32 },
  { name: 'ジャンプ', name_en: 'Jump', notation: 'j', type: '移動', order: 33 },
  { name: '2段ジャンプ', name_en: 'Double Jump', notation: 'jj', type: '移動', order: 34 },
  { name: 'ハイジャンプ', name_en: 'High Jump', notation: 'hj', type: '移動', order: 35 },
  { name: '空中ダッシュ', name_en: 'Air Dash', notation: 'IAD', type: '移動', order: 36 },
];

async function seedCommonMoves() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
  }

  console.log('🌱 共通技データの登録を開始します...');
  const db = createClient({ url, authToken });

  try {
    // 既存の共通技を削除（冪等性のため）
    await db.execute('DELETE FROM common_moves');
    console.log('✅ 既存の共通技データを削除しました');

    // 共通技を登録
    for (const move of commonMoves) {
      await db.execute({
        sql: `INSERT INTO common_moves (move_name, move_name_en, move_notation, move_type, display_order)
              VALUES (?, ?, ?, ?, ?)`,
        args: [move.name, move.name_en, move.notation, move.type, move.order]
      });
    }

    console.log(`✅ ${commonMoves.length}件の共通技を登録しました`);
    console.log('');
    console.log('登録された共通技:');
    commonMoves.forEach(move => {
      console.log(`  - ${move.notation}: ${move.name} / ${move.name_en}`);
    });

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// 実行
seedCommonMoves()
  .then(() => {
    console.log('');
    console.log('✅ 共通技データの登録が完了しました！');
    console.log('');
    console.log('次のステップ:');
    console.log('- /gc コマンドのオートコンプリートで共通技が表示されます');
    console.log('- 各キャラから重複する共通技を削除する場合は npm run clean:common-moves を実行');
    process.exit(0);
  })
  .catch(() => process.exit(1));
