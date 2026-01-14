import 'dotenv/config';
import { createClient } from '@libsql/client';

async function removeDuplicateMoves() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
    process.exit(1);
  }

  const db = createClient({ url, authToken });
  console.log('🔄 Starting: Remove duplicate 2H and 5H from character_moves\n');

  try {
    // 削除前の件数を確認
    const beforeCount = await db.execute(`
      SELECT COUNT(*) as count
      FROM character_moves
      WHERE move_notation IN ('2H', '5H')
    `);

    const count = Number(beforeCount.rows[0].count);
    console.log(`📊 Found ${count} entries to delete\n`);

    if (count === 0) {
      console.log('✅ No entries to delete');
      return;
    }

    // 削除実行
    console.log('🗑️  Deleting 2H and 5H from character_moves...');
    const result = await db.execute(`
      DELETE FROM character_moves
      WHERE move_notation IN ('2H', '5H')
    `);

    console.log(`✅ Deleted ${result.rowsAffected} entries\n`);

    // 削除後の確認
    const afterCount = await db.execute(`
      SELECT COUNT(*) as count
      FROM character_moves
      WHERE move_notation IN ('2H', '5H')
    `);

    const remaining = Number(afterCount.rows[0].count);

    if (remaining === 0) {
      console.log('✅ All duplicate 2H and 5H have been removed');
      console.log('ℹ️  Users should now use common moves: 2HS (しゃがみヘビースラッシュ) and 5HS (立ちヘビースラッシュ)');
    } else {
      console.log(`⚠️  ${remaining} entries still remaining`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

removeDuplicateMoves();
