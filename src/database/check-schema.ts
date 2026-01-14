import 'dotenv/config';
import { createClient } from '@libsql/client';

async function checkSchema() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
    process.exit(1);
  }

  const db = createClient({ url, authToken });

  try {
    console.log('🔍 Checking character_moves table schema...\n');

    // テーブル定義を取得
    const result = await db.execute(`
      SELECT sql FROM sqlite_master
      WHERE type='table' AND name='character_moves'
    `);

    if (result.rows.length > 0) {
      console.log('📋 Current table definition:');
      console.log(result.rows[0].sql);
      console.log('');

      // UNIQUE制約があるかチェック
      const tableDef = String(result.rows[0].sql);
      if (tableDef.includes('UNIQUE')) {
        console.log('⚠️  UNIQUE constraint still exists');
      } else {
        console.log('✅ UNIQUE constraint has been removed');
      }
    } else {
      console.log('❌ character_moves table not found');
    }

    // インデックスを確認
    const indexResult = await db.execute(`
      SELECT sql FROM sqlite_master
      WHERE type='index' AND tbl_name='character_moves'
    `);

    if (indexResult.rows.length > 0) {
      console.log('\n📊 Indexes:');
      indexResult.rows.forEach(row => {
        console.log(row.sql);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    db.close();
  }
}

checkSchema();
