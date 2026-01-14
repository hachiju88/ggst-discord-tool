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
  console.log('🔄 Starting migration: Remove UNIQUE constraint from character_moves');

  try {
    // トランザクション開始
    await db.execute('BEGIN TRANSACTION');

    // 1. 新しいテーブルを作成（UNIQUE制約なし）
    console.log('📝 Creating new character_moves table without UNIQUE constraint...');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS character_moves_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL,
        move_name TEXT NOT NULL,
        move_name_en TEXT,
        move_notation TEXT NOT NULL,
        move_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (character_id) REFERENCES characters(id)
      )
    `);

    // 2. 既存データをコピー
    console.log('📦 Copying existing data...');
    await db.execute(`
      INSERT INTO character_moves_new (id, character_id, move_name, move_name_en, move_notation, move_type, created_at)
      SELECT id, character_id, move_name, move_name_en, move_notation, move_type, created_at
      FROM character_moves
    `);

    // 3. 古いテーブルを削除
    console.log('🗑️  Dropping old table...');
    await db.execute('DROP TABLE character_moves');

    // 4. 新しいテーブルをリネーム
    console.log('✏️  Renaming new table...');
    await db.execute('ALTER TABLE character_moves_new RENAME TO character_moves');

    // 5. インデックスを再作成
    console.log('🔍 Recreating index...');
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_character_moves_char
      ON character_moves(character_id)
    `);

    // トランザクションコミット
    await db.execute('COMMIT');

    console.log('✅ Migration completed successfully');
    console.log('ℹ️  character_moves table now allows duplicate move_notation per character');
  } catch (error: any) {
    // ロールバック
    await db.execute('ROLLBACK');
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

migrate();
