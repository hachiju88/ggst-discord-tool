import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

/**
 * 共通技テーブルを追加するマイグレーション
 * 全キャラ共通の技（5P、5K、投げ、RCなど）を管理
 */
async function migrateAddCommonMoves() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
  }

  console.log('🔄 共通技テーブルのマイグレーションを開始します...');
  const db = createClient({ url, authToken });

  try {
    // common_movesテーブルを作成
    await db.execute(`
      CREATE TABLE IF NOT EXISTS common_moves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        move_name TEXT NOT NULL,
        move_name_en TEXT,
        move_notation TEXT NOT NULL UNIQUE,
        move_type TEXT,
        display_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ common_movesテーブルを作成しました');

    // インデックスを作成
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_common_moves_notation ON common_moves(move_notation)
    `);

    console.log('✅ インデックスを作成しました');

    console.log('');
    console.log('✅ マイグレーション完了！');
    console.log('');
    console.log('次のステップ:');
    console.log('1. npm run seed:common-moves で共通技データを登録');
    console.log('2. npm run clean:common-moves で各キャラから共通技を削除（オプション）');

  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    throw error;
  }
}

// 実行
migrateAddCommonMoves()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
