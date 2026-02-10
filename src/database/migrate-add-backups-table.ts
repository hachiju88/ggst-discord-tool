import { initDatabase, closeDatabase, getDatabase } from './index';

async function migrate() {
  const db = await getDatabase();

  console.log('Creating backups table...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('Backups table created successfully');
}

migrate().catch(console.error);
