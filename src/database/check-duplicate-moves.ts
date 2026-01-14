import 'dotenv/config';
import { createClient } from '@libsql/client';

async function checkDuplicateMoves() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
    process.exit(1);
  }

  const db = createClient({ url, authToken });

  try {
    console.log('🔍 Checking for 2H and 5H in character_moves...\n');

    // 2Hと5Hのデータを確認
    const result = await db.execute(`
      SELECT
        cm.id,
        c.name as character_name,
        cm.move_name,
        cm.move_notation
      FROM character_moves cm
      JOIN characters c ON cm.character_id = c.id
      WHERE cm.move_notation IN ('2H', '5H')
      ORDER BY c.name, cm.move_notation
    `);

    if (result.rows.length === 0) {
      console.log('✅ No duplicate 2H or 5H found in character_moves');
    } else {
      console.log(`⚠️  Found ${result.rows.length} entries to delete:\n`);

      const grouped: { [key: string]: number } = {};
      result.rows.forEach(row => {
        const notation = String(row.move_notation);
        grouped[notation] = (grouped[notation] || 0) + 1;
        console.log(`  ID: ${row.id} | ${row.character_name} | ${row.move_name} (${row.move_notation})`);
      });

      console.log(`\n📊 Summary:`);
      Object.entries(grouped).forEach(([notation, count]) => {
        console.log(`  ${notation}: ${count} entries`);
      });
    }

    // 共通技の確認
    console.log('\n🔍 Checking common_moves for 2HS and 5HS...\n');
    const commonResult = await db.execute(`
      SELECT move_name, move_name_en, move_notation
      FROM common_moves
      WHERE move_notation IN ('2HS', '5HS')
      ORDER BY move_notation
    `);

    if (commonResult.rows.length > 0) {
      console.log('✅ Common moves (替わりにこれらを使用):');
      commonResult.rows.forEach(row => {
        console.log(`  ${row.move_name} / ${row.move_name_en} (${row.move_notation})`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    db.close();
  }
}

checkDuplicateMoves();
