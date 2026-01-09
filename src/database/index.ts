import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: Database.Database | null = null;

export function initDatabase(): Database.Database {
  const dbPath = process.env.DATABASE_PATH || './data/ggst.db';

  // データディレクトリが存在しない場合は作成
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // データベース接続
  db = new Database(dbPath);

  // WALモードを有効化（パフォーマンス向上）
  db.pragma('journal_mode = WAL');

  // スキーマの適用
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  console.log('Database initialized successfully');

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('Database connection closed');
  }
}
