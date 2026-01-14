import 'dotenv/config';
import { createClient } from '@libsql/client';

interface MoveUpdate {
  id: number;
  move_name: string;
  move_name_en: string;
  move_notation: string;
}

async function updateCommonMoves() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
    process.exit(1);
  }

  const db = createClient({ url, authToken });
  console.log('🔄 共通技の名前を一括更新\n');

  const updates: MoveUpdate[] = [
    { id: 13, move_name: '2D', move_name_en: '2D', move_notation: '2D' },
    { id: 9, move_name: '2HS', move_name_en: '2HS', move_notation: '2HS' },
    { id: 7, move_name: '2K', move_name_en: '2K', move_notation: '2K' },
    { id: 6, move_name: '2P', move_name_en: '2P', move_notation: '2P' },
    { id: 8, move_name: '2S', move_name_en: '2S', move_notation: '2S' },
    { id: 22, move_name: '後ろ投げ', move_name_en: 'back throw', move_notation: '4D' },
    { id: 14, move_name: 'ダスト', move_name_en: 'Dust', move_notation: '5D' },
    { id: 5, move_name: '5HS', move_name_en: '5HS', move_notation: '5HS' },
    { id: 2, move_name: '5K', move_name_en: '5K', move_notation: '5K' },
    { id: 1, move_name: '5P', move_name_en: '5P', move_notation: '5P' },
    { id: 21, move_name: '前投げ', move_name_en: 'Forward Throw', move_notation: '6D' },
    { id: 12, move_name: '6HS', move_name_en: '6HS', move_notation: '6HS' },
    { id: 11, move_name: '6K', move_name_en: '6K', move_notation: '6K' },
    { id: 10, move_name: '6P', move_name_en: '6P', move_notation: '6P' },
    { id: 36, move_name: '空中ダッシュ', move_name_en: 'Air Dash', move_notation: 'IAD' },
    { id: 29, move_name: 'ワイルドアサルト', move_name_en: 'Wild Assault', move_notation: 'WA' },
    { id: 32, move_name: 'バックステップ', move_name_en: 'Backstep', move_notation: 'bs' },
    { id: 31, move_name: 'ダッシュ', move_name_en: 'Dash', move_notation: 'd' },
    { id: 35, move_name: 'ハイジャン', move_name_en: 'High Jump', move_notation: 'hj' },
    { id: 33, move_name: 'ジャンプ', move_name_en: 'Jump', move_notation: 'j' },
    { id: 20, move_name: '空中ダスト', move_name_en: 'Jump Dust', move_notation: 'j.D' },
    { id: 19, move_name: 'ジャンHS', move_name_en: 'Jump HS', move_notation: 'j.HS' },
    { id: 17, move_name: 'ジャンK', move_name_en: 'Jump Kick', move_notation: 'j.K' },
    { id: 16, move_name: 'ジャンP', move_name_en: 'Jump Punch', move_notation: 'j.P' },
    { id: 18, move_name: 'ジャンS', move_name_en: 'Jump Slash', move_notation: 'j.S' },
    { id: 34, move_name: '2段ジャンプ', move_name_en: 'Double Jump', move_notation: 'jj' },
    { id: 28, move_name: 'ダッシュ紫ロマ', move_name_en: 'Dash Purple RC', move_notation: 'd.紫RC' },
    { id: 25, move_name: 'ダッシュ赤ロマ', move_name_en: 'Dash Red RC', move_notation: 'd.赤RC' },
    { id: 15, move_name: '溜めダスト', move_name_en: 'Charged Dust', move_notation: '溜め5D' },
    { id: 30, move_name: '溜めワイルドアサルト', move_name_en: 'Charged Wild Assault', move_notation: '溜めWA' },
    { id: 23, move_name: '空投げ', move_name_en: 'Air Throw', move_notation: 'j.6D' },
    { id: 27, move_name: '紫ロマ', move_name_en: 'Purple Roman Cancel', move_notation: '紫RC' },
    { id: 24, move_name: '赤ロマ', move_name_en: 'Red Roman Cancel', move_notation: '赤RC' },
    { id: 3, move_name: '近S', move_name_en: 'Close Slash', move_notation: '近S' },
    { id: 4, move_name: '遠S', move_name_en: 'Far Slash', move_notation: '遠S' },
    { id: 26, move_name: '黄ロマ', move_name_en: 'Yellow Roman Cancel', move_notation: '黄RC' },
  ];

  try {
    let updatedCount = 0;

    for (const update of updates) {
      const result = await db.execute({
        sql: `
          UPDATE common_moves
          SET move_name = ?, move_name_en = ?, move_notation = ?
          WHERE id = ?
        `,
        args: [update.move_name, update.move_name_en, update.move_notation, update.id]
      });

      if (result.rowsAffected > 0) {
        updatedCount++;
        console.log(`✅ ID ${update.id}: ${update.move_name} (${update.move_notation})`);
      }
    }

    console.log(`\n✅ 更新完了: ${updatedCount}/${updates.length} 件`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

updateCommonMoves();
