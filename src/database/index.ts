import { createClient, Client } from '@libsql/client';
import fs from 'fs';
import path from 'path';

let db: Client | null = null;

export async function initDatabase(): Promise<Client> {
  // Turso接続設定
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in environment variables');
  }

  console.log('Initializing database...');

  // Tursoクライアントを作成
  db = createClient({
    url,
    authToken,
  });

  // スキーマの適用
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // スキーマを個別のステートメントに分割して実行
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    await db.execute(statement);
  }

  console.log('Database initialized successfully');

  return db;
}

export function getDatabase(): Client {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    db.close();
    db = null;
    console.log('Database connection closed');
  }
}
