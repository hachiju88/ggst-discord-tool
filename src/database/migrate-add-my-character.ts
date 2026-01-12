import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

// 環境変数の読み込み
dotenv.config();

async function migrate() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
  }

  console.log('Connecting to Turso...');
  const db = createClient({ url, authToken });

  try {
    // カラムが既に存在するかチェック
    console.log('Checking if my_character column exists...');
    const checkResult = await db.execute(`
      SELECT COUNT(*) as count
      FROM pragma_table_info('matches')
      WHERE name = 'my_character'
    `);

    const count = (checkResult.rows[0] as any).count;

    if (count > 0) {
      console.log('✅ my_character column already exists. No migration needed.');
      return;
    }

    // カラムを追加
    console.log('Adding my_character column to matches table...');
    await db.execute(`
      ALTER TABLE matches ADD COLUMN my_character TEXT
    `);

    console.log('✅ Migration completed successfully!');
    console.log('📝 Note: Existing matches will have NULL for my_character.');
    console.log('   These will default to the user\'s main_character when displayed.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    db.close();
  }
}

migrate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
