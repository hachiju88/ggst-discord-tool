import 'dotenv/config';
import { createClient } from '@libsql/client';

async function checkCommonStrategies() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
    process.exit(1);
  }

  const db = createClient({ url, authToken });

  try {
    const result = await db.execute(`
      SELECT
        c.name as character_name,
        COUNT(*) as strategy_count
      FROM common_strategies cs
      JOIN characters c ON cs.target_character_id = c.id
      GROUP BY c.name
      ORDER BY c.display_order
    `);

    console.log('📊 キャラクター別 共通対策数\n');
    console.log('キャラクター | 対策数');
    console.log('------------|-------');
    result.rows.forEach(row => {
      console.log(`${String(row.character_name).padEnd(20)} | ${row.strategy_count}`);
    });

    const total = await db.execute('SELECT COUNT(*) as total FROM common_strategies');
    console.log(`\n合計: ${total.rows[0].total}件`);

    // サンプル表示
    console.log('\n📝 サンプル表示（ソル=バッドガイ）:\n');
    const sample = await db.execute({
      sql: `
        SELECT strategy_content
        FROM common_strategies cs
        JOIN characters c ON cs.target_character_id = c.id
        WHERE c.name = ?
        ORDER BY cs.id
      `,
      args: ['ソル=バッドガイ']
    });

    sample.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.strategy_content}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    db.close();
  }
}

checkCommonStrategies();
