import dotenv from 'dotenv';
dotenv.config();

import { initDatabase, closeDatabase, getDatabase } from './index';

async function migrate() {
  await initDatabase();
  const db = getDatabase();

  console.log('Creating system_settings table...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('System settings table created successfully');
  await closeDatabase();
}

migrate().catch(console.error);
