import dotenv from 'dotenv';
dotenv.config();

import { initDatabase, closeDatabase, getDatabase } from './index';

async function migrate() {
  await initDatabase();
  const db = getDatabase();

  console.log('Creating rank tracking tables...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tracked_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      puddle_player_id INTEGER NOT NULL,
      display_name TEXT NOT NULL,
      char_short TEXT NOT NULL,
      char_long TEXT NOT NULL DEFAULT '',
      added_by_discord_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(guild_id, puddle_player_id, char_short)
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_tracked_guild ON tracked_players(guild_id)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS rating_observations (
      puddle_player_id INTEGER NOT NULL,
      char_short TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      rating REAL NOT NULL,
      PRIMARY KEY (puddle_player_id, char_short, observed_at)
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_obs_player_char ON rating_observations(puddle_player_id, char_short)`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS rank_post_config (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Rank tracking tables created successfully');
  await closeDatabase();
}

migrate().catch(console.error);
