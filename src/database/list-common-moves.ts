import 'dotenv/config';
import { createClient } from '@libsql/client';

async function listCommonMoves() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
    process.exit(1);
  }

  const db = createClient({ url, authToken });
  console.log('📋 共通技（common_moves）一覧\n');

  try {
    const result = await db.execute(`
      SELECT id, move_name, move_name_en, move_notation, move_type
      FROM common_moves
      ORDER BY move_notation
    `);

    if (result.rows.length === 0) {
      console.log('❌ 共通技が登録されていません');
      return;
    }

    console.log(`全 ${result.rows.length} 件\n`);
    console.log('ID | 技名 | 英語名 | コマンド | タイプ');
    console.log('---|------|--------|----------|--------');

    result.rows.forEach(row => {
      const id = String(row.id).padEnd(3);
      const name = String(row.move_name).padEnd(30);
      const nameEn = String(row.move_name_en || '').padEnd(35);
      const notation = String(row.move_notation).padEnd(10);
      const type = String(row.move_type || '');
      console.log(`${id} | ${name} | ${nameEn} | ${notation} | ${type}`);
    });

    console.log('\n\n📝 修正用テンプレート（コピーして使用）:\n');
    result.rows.forEach(row => {
      console.log(`ID: ${row.id}`);
      console.log(`  技名: ${row.move_name}`);
      console.log(`  英語名: ${row.move_name_en || ''}`);
      console.log(`  コマンド: ${row.move_notation}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    db.close();
  }
}

listCommonMoves();
