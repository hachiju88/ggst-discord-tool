import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

/**
 * 各キャラクターの技データから共通技を削除するクリーンアップスクリプト
 * common_movesに登録されている技を、character_movesから削除
 */

const commonNotations = [
  // 地上通常技
  '5P', '5K', '近S', '遠S', '5HS',
  // しゃがみ通常技
  '2P', '2K', '2S', '2HS',
  // 前入れ技
  '6P', '6K', '6HS',
  // 特殊技
  '2D', '5D', '溜め5D',
  // 空中通常技
  'j.P', 'j.K', 'j.S', 'j.HS', 'j.D',
  // 投げ
  '4D', '6D', '空中投げ',
  // ロマンキャンセル
  '赤RC', 'ダッシュ赤RC', '黄RC', '紫RC', 'ダッシュ紫RC',
  // ワイルドアサルト
  'WA', '溜めWA',
  // 移動
  'd', 'bs', 'j', 'jj', 'hj', 'IAD'
];

async function cleanCommonMoves() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
  }

  console.log('🧹 各キャラから共通技を削除します...');
  console.log('');
  const db = createClient({ url, authToken });

  try {
    let totalDeleted = 0;

    for (const notation of commonNotations) {
      const result = await db.execute({
        sql: 'DELETE FROM character_moves WHERE move_notation = ?',
        args: [notation]
      });

      if (result.rowsAffected > 0) {
        console.log(`  ✅ ${notation}: ${result.rowsAffected}件削除`);
        totalDeleted += result.rowsAffected;
      }
    }

    console.log('');
    console.log(`✅ 合計 ${totalDeleted} 件の共通技を削除しました`);
    console.log('');
    console.log('💡 共通技は common_moves テーブルで管理され、/gc コマンドで利用できます');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  }
}

// 実行
cleanCommonMoves()
  .then(() => {
    console.log('');
    console.log('✅ クリーンアップ完了！');
    process.exit(0);
  })
  .catch(() => process.exit(1));
