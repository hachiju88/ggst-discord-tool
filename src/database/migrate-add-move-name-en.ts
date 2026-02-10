import 'dotenv/config';
import { createClient } from '@libsql/client';

async function migrate() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
    process.exit(1);
  }

  const db = createClient({ url, authToken });
  console.log('🔄 Starting migration: Add move_name_en to character_moves');

  try {
    // move_name_en カラムを追加
    console.log('📝 Adding move_name_en column to character_moves...');
    await db.execute(`
      ALTER TABLE character_moves
      ADD COLUMN move_name_en TEXT
    `);
    console.log('✅ move_name_en column added successfully\n');

    console.log('✅ Migration completed successfully');
  } catch (error: any) {
    // カラムが既に存在する場合のエラーは無視
    if (error.message && error.message.includes('duplicate column name')) {
      console.log('ℹ️  move_name_en column already exists, skipping...');
      console.log('✅ Migration completed (no changes needed)');
    } else {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  } finally {
    db.close();
  }
}

migrate();
