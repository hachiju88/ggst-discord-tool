import { getDatabase } from './index';

/**
 * 起動時に自動的に必要なマイグレーションを実行
 */
export async function autoMigrate() {
  const db = getDatabase();

  try {
    console.log('Checking database schema...');

    // defeat_reason_typeカラムの存在確認
    const tableInfo = await db.execute({
      sql: "PRAGMA table_info(matches)"
    });

    const hasDefeatReasonType = tableInfo.rows.some(
      (row: any) => row.name === 'defeat_reason_type'
    );

    if (!hasDefeatReasonType) {
      console.log('Adding defeat_reason_type column...');

      // カラムを追加
      await db.execute({
        sql: `
          ALTER TABLE matches
          ADD COLUMN defeat_reason_type TEXT CHECK(defeat_reason_type IN ('common', 'user'))
        `
      });

      // 既存データを更新
      await db.execute({
        sql: `
          UPDATE matches
          SET defeat_reason_type = 'common'
          WHERE defeat_reason_id IS NOT NULL
        `
      });

      console.log('✅ defeat_reason_type column added');
    } else {
      console.log('✅ defeat_reason_type column already exists');
    }

    // 共通敗因に「コンボミス」が存在するか確認
    const comboMissCheck = await db.execute({
      sql: "SELECT * FROM common_defeat_reasons WHERE reason = 'コンボミス'"
    });

    if (comboMissCheck.rows.length === 0) {
      console.log('Adding "コンボミス" to common defeat reasons...');

      const maxOrderResult = await db.execute({
        sql: 'SELECT MAX(display_order) as max_order FROM common_defeat_reasons'
      });
      const maxOrder = (maxOrderResult.rows[0]?.max_order as number) || 0;

      await db.execute({
        sql: `
          INSERT INTO common_defeat_reasons (reason, display_order)
          VALUES (?, ?)
        `,
        args: ['コンボミス', maxOrder + 1]
      });

      console.log('✅ "コンボミス" added to common defeat reasons');
    } else {
      console.log('✅ "コンボミス" already exists');
    }

    // tournament_matches のゲーム数カラム確認
    const matchInfo = await db.execute({ sql: 'PRAGMA table_info(tournament_matches)' })
    const hasP1Games = matchInfo.rows.some((row: any) => row.name === 'p1_games_won')
    if (!hasP1Games) {
      await db.execute({ sql: 'ALTER TABLE tournament_matches ADD COLUMN p1_games_won INTEGER NOT NULL DEFAULT 0' })
      await db.execute({ sql: 'ALTER TABLE tournament_matches ADD COLUMN p2_games_won INTEGER NOT NULL DEFAULT 0' })
      console.log('✅ p1_games_won, p2_games_won added to tournament_matches')
    } else {
      console.log('✅ tournament_matches.p1/p2_games_won already exists')
    }

    // tournament_participants.character カラムの存在確認
    const participantInfo = await db.execute({
      sql: 'PRAGMA table_info(tournament_participants)',
    })
    const hasCharacter = participantInfo.rows.some((row: any) => row.name === 'character')
    if (!hasCharacter) {
      await db.execute({ sql: 'ALTER TABLE tournament_participants ADD COLUMN character TEXT' })
      console.log('✅ character column added to tournament_participants')
    } else {
      console.log('✅ tournament_participants.character already exists')
    }

    // 団体戦テーブル作成
    const tables = await db.execute({ sql: "SELECT name FROM sqlite_master WHERE type='table'" })
    const tableNames = tables.rows.map((r: any) => r.name as string)

    if (!tableNames.includes('tournament_teams')) {
      await db.execute({ sql: `CREATE TABLE IF NOT EXISTS tournament_teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        team_order INTEGER NOT NULL DEFAULT 0,
        announcement_message_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )` })
      await db.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_teams_tournament ON tournament_teams(tournament_id)' })
      console.log('✅ tournament_teams table created')
    }

    if (!tableNames.includes('tournament_team_members')) {
      await db.execute({ sql: `CREATE TABLE IF NOT EXISTS tournament_team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
        discord_id TEXT NOT NULL,
        discord_name TEXT NOT NULL,
        rank TEXT,
        character TEXT,
        position INTEGER,
        is_captain INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(team_id, discord_id)
      )` })
      await db.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_team_members_team ON tournament_team_members(team_id)' })
      console.log('✅ tournament_team_members table created')
    }

    if (!tableNames.includes('tournament_team_battles')) {
      await db.execute({ sql: `CREATE TABLE IF NOT EXISTS tournament_team_battles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
        battle_order INTEGER NOT NULL,
        match_code TEXT,
        team1_member_id INTEGER REFERENCES tournament_team_members(id),
        team2_member_id INTEGER REFERENCES tournament_team_members(id),
        winner_member_id INTEGER REFERENCES tournament_team_members(id),
        winner_team_id INTEGER REFERENCES tournament_teams(id),
        team1_games_won INTEGER NOT NULL DEFAULT 0,
        team2_games_won INTEGER NOT NULL DEFAULT 0,
        handicap_member_id INTEGER REFERENCES tournament_team_members(id),
        handicap_rounds INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        message_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )` })
      await db.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_team_battles_match ON tournament_team_battles(match_id)' })
      console.log('✅ tournament_team_battles table created')
    }

    // ランク追跡テーブル
    if (!tableNames.includes('tracked_players')) {
      await db.execute({ sql: `CREATE TABLE IF NOT EXISTS tracked_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        puddle_player_id INTEGER NOT NULL,
        display_name TEXT NOT NULL,
        char_short TEXT NOT NULL,
        char_long TEXT NOT NULL DEFAULT '',
        added_by_discord_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(guild_id, puddle_player_id, char_short)
      )` })
      await db.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_tracked_guild ON tracked_players(guild_id)' })
      console.log('✅ tracked_players table created')
    }

    if (!tableNames.includes('rating_observations')) {
      await db.execute({ sql: `CREATE TABLE IF NOT EXISTS rating_observations (
        puddle_player_id INTEGER NOT NULL,
        char_short TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        rating REAL NOT NULL,
        PRIMARY KEY (puddle_player_id, char_short, observed_at)
      )` })
      await db.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_obs_player_char ON rating_observations(puddle_player_id, char_short)' })
      console.log('✅ rating_observations table created')
    }

    if (!tableNames.includes('rank_post_config')) {
      await db.execute({ sql: `CREATE TABLE IF NOT EXISTS rank_post_config (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )` })
      console.log('✅ rank_post_config table created')
    }

    // char_long カラムが古い tracked_players に存在しない場合の追加
    if (tableNames.includes('tracked_players')) {
      const tpInfo = await db.execute({ sql: 'PRAGMA table_info(tracked_players)' })
      const hasCharLong = tpInfo.rows.some((r: any) => r.name === 'char_long')
      if (!hasCharLong) {
        await db.execute({ sql: `ALTER TABLE tracked_players ADD COLUMN char_long TEXT NOT NULL DEFAULT ''` })
        console.log('✅ char_long column added to tracked_players')
      }
    }

    console.log('Database schema check complete');
  } catch (error) {
    console.error('Auto-migration error:', error);
    throw error;
  }
}
