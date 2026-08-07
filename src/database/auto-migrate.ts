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

    // tournament_matches.is_draw カラム確認（団体戦の引き分け対応）
    const hasIsDraw = matchInfo.rows.some((row: any) => row.name === 'is_draw')
    if (!hasIsDraw) {
      await db.execute({ sql: 'ALTER TABLE tournament_matches ADD COLUMN is_draw INTEGER NOT NULL DEFAULT 0' })
      console.log('✅ is_draw column added to tournament_matches')
    } else {
      console.log('✅ tournament_matches.is_draw already exists')
    }

    // tournament_matches.is_final_tiebreaker カラム確認（大会全体の優勝決定戦）
    const hasIsFinalTb = matchInfo.rows.some((row: any) => row.name === 'is_final_tiebreaker')
    if (!hasIsFinalTb) {
      await db.execute({ sql: 'ALTER TABLE tournament_matches ADD COLUMN is_final_tiebreaker INTEGER NOT NULL DEFAULT 0' })
      console.log('✅ is_final_tiebreaker column added to tournament_matches')
    } else {
      console.log('✅ tournament_matches.is_final_tiebreaker already exists')
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

    // ── 回復処理 ──────────────────────────────────────────────────────────────
    // libsql/Turso は RENAME TABLE 時に FK 参照を自動更新する。
    // 前回のマイグレーションで RENAME が成功した後 DROP _old が FK エラーで失敗すると、
    // tournament_team_battles の FK が tournament_team_members_old を向いたまま残る。
    // 子テーブル (tournament_team_battles) を再構築して FK を正しい名前に戻し、
    // 参照されなくなった _old を削除する。
    if (tableNames.includes('tournament_team_members_old') && tableNames.includes('tournament_team_battles')) {
      console.log('前回のマイグレーション失敗から回復中 (tournament_team_members_old が残存)...')
      const btColsRec = await db.execute({ sql: 'PRAGMA table_info(tournament_team_battles)' })
      const hasTbRec = btColsRec.rows.some((r: any) => r.name === 'is_tiebreaker')
      await db.execute({ sql: 'DROP TABLE IF EXISTS tournament_team_battles_new' })
      await db.execute({ sql: `CREATE TABLE tournament_team_battles_new (
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
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP${hasTbRec ? ',\n        is_tiebreaker INTEGER NOT NULL DEFAULT 0' : ''}
      )` })
      await db.execute({ sql: 'INSERT INTO tournament_team_battles_new SELECT * FROM tournament_team_battles' })
      // 子テーブル (FK を持つ側) の DROP は FK 有効でも常に可能
      await db.execute({ sql: 'DROP TABLE tournament_team_battles' })
      await db.execute({ sql: 'ALTER TABLE tournament_team_battles_new RENAME TO tournament_team_battles' })
      await db.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_team_battles_match ON tournament_team_battles(match_id)' })
      // tournament_team_battles が tournament_team_members を参照するようになったので _old は参照なし
      await db.execute({ sql: 'DROP TABLE tournament_team_members_old' })
      console.log('✅ 回復完了: tournament_team_members_old を削除し FK 参照を修正しました')
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
        UNIQUE(team_id, position)
      )` })
      await db.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_team_members_team ON tournament_team_members(team_id)' })
      console.log('✅ tournament_team_members table created')
    } else {
      // 旧 UNIQUE(team_id, discord_id) → UNIQUE(team_id, position) へのマイグレーション
      // 同一チームで同ユーザーが複数ポジションを持てるようにするため
      const tmTableSqlResult = await db.execute({
        sql: "SELECT sql FROM sqlite_master WHERE type='table' AND name='tournament_team_members'",
      })
      const tmTableSql = ((tmTableSqlResult.rows[0] as any)?.sql ?? '') as string
      const hasOldUnique = /UNIQUE\s*\(\s*team_id\s*,\s*discord_id\s*\)/i.test(tmTableSql)
      if (hasOldUnique) {
        // 既存データに (team_id, position) の重複がないか確認
        const dupResult = await db.execute({
          sql: `SELECT team_id, position, COUNT(*) AS cnt FROM tournament_team_members
                WHERE position IS NOT NULL
                GROUP BY team_id, position HAVING cnt > 1`,
        })
        if (dupResult.rows.length > 0) {
          console.error('⚠️ tournament_team_members に (team_id, position) の重複行が存在するためマイグレーションを中止します:')
          for (const row of dupResult.rows) {
            const r = row as any
            console.error(`   team_id=${r.team_id}, position=${r.position}, count=${r.cnt}`)
          }
          console.error('   手動で重複を解消してから再起動してください。')
        } else {
          console.log('Migrating tournament_team_members UNIQUE constraint...')
          await db.execute({ sql: 'DROP TABLE IF EXISTS tournament_team_members_new' })
          await db.execute({ sql: 'DROP TABLE IF EXISTS tournament_team_battles_new' })
          // Step1: 新スキーマのメンバーテーブルを作成してデータコピー
          await db.execute({ sql: `CREATE TABLE tournament_team_members_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
            discord_id TEXT NOT NULL,
            discord_name TEXT NOT NULL,
            rank TEXT,
            character TEXT,
            position INTEGER,
            is_captain INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(team_id, position)
          )` })
          await db.execute({ sql: 'INSERT INTO tournament_team_members_new SELECT * FROM tournament_team_members' })
          // Step2: tournament_team_battles が存在する場合、FK を tournament_team_members_new に向けて再構築
          // そうすることで DROP tournament_team_members 時に FK 参照がなくなる
          if (tableNames.includes('tournament_team_battles')) {
            const btCols = await db.execute({ sql: 'PRAGMA table_info(tournament_team_battles)' })
            const hasTb = btCols.rows.some((r: any) => r.name === 'is_tiebreaker')
            await db.execute({ sql: `CREATE TABLE tournament_team_battles_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              match_id INTEGER NOT NULL REFERENCES tournament_matches(id) ON DELETE CASCADE,
              battle_order INTEGER NOT NULL,
              match_code TEXT,
              team1_member_id INTEGER REFERENCES tournament_team_members_new(id),
              team2_member_id INTEGER REFERENCES tournament_team_members_new(id),
              winner_member_id INTEGER REFERENCES tournament_team_members_new(id),
              winner_team_id INTEGER REFERENCES tournament_teams(id),
              team1_games_won INTEGER NOT NULL DEFAULT 0,
              team2_games_won INTEGER NOT NULL DEFAULT 0,
              handicap_member_id INTEGER REFERENCES tournament_team_members_new(id),
              handicap_rounds INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'pending',
              message_id TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP${hasTb ? ',\n              is_tiebreaker INTEGER NOT NULL DEFAULT 0' : ''}
            )` })
            await db.execute({ sql: 'INSERT INTO tournament_team_battles_new SELECT * FROM tournament_team_battles' })
            await db.execute({ sql: 'DROP TABLE tournament_team_battles' })  // 子テーブル DROP は常に可
          }
          // Step3: 旧メンバーテーブルを削除（もう FK 参照がない）
          await db.execute({ sql: 'DROP TABLE tournament_team_members' })
          // Step4: リネーム（libsql が battles_new の FK を tournament_team_members に更新する）
          await db.execute({ sql: 'ALTER TABLE tournament_team_members_new RENAME TO tournament_team_members' })
          if (tableNames.includes('tournament_team_battles')) {
            await db.execute({ sql: 'ALTER TABLE tournament_team_battles_new RENAME TO tournament_team_battles' })
            await db.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_team_battles_match ON tournament_team_battles(match_id)' })
          }
          await db.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_team_members_team ON tournament_team_members(team_id)' })
          console.log('✅ tournament_team_members UNIQUE 制約を (team_id, discord_id) → (team_id, position) に変更')
        }
      }
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

    // tournament_team_battles.is_tiebreaker カラム確認（最終戦判定）
    if (tableNames.includes('tournament_team_battles')) {
      const battleInfo = await db.execute({ sql: 'PRAGMA table_info(tournament_team_battles)' })
      const hasIsTiebreaker = battleInfo.rows.some((row: any) => row.name === 'is_tiebreaker')
      if (!hasIsTiebreaker) {
        await db.execute({ sql: 'ALTER TABLE tournament_team_battles ADD COLUMN is_tiebreaker INTEGER NOT NULL DEFAULT 0' })
        console.log('✅ is_tiebreaker column added to tournament_team_battles')
      } else {
        console.log('✅ tournament_team_battles.is_tiebreaker already exists')
      }
    }

    // ランク追跡テーブル (puddle_player_id は int64 のため TEXT で保存)
    if (!tableNames.includes('tracked_players')) {
      await db.execute({ sql: `CREATE TABLE IF NOT EXISTS tracked_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        puddle_player_id TEXT NOT NULL,
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
        puddle_player_id TEXT NOT NULL,
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

      // 旧スキーマで puddle_player_id が INTEGER の場合、TEXT に作り直す。
      // int64 値を libSQL から JS に読み込むと Number 上限超えで RangeError になるため。
      // CAST は SQLite サーバー側で実行されるので JS への値転送は発生しない。
      const puddleCol = tpInfo.rows.find((r: any) => r.name === 'puddle_player_id') as any
      if (puddleCol && typeof puddleCol.type === 'string' && puddleCol.type.toUpperCase() === 'INTEGER') {
        console.log('Migrating tracked_players.puddle_player_id INTEGER → TEXT...')
        // 前回の途中失敗でテーブルが残っている場合に備えて先に削除
        await db.execute({ sql: 'DROP TABLE IF EXISTS tracked_players_new' })
        await db.execute({ sql: `CREATE TABLE tracked_players_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          puddle_player_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          char_short TEXT NOT NULL,
          char_long TEXT NOT NULL DEFAULT '',
          added_by_discord_id TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(guild_id, puddle_player_id, char_short)
        )` })
        await db.execute({ sql: `INSERT INTO tracked_players_new (id, guild_id, puddle_player_id, display_name, char_short, char_long, added_by_discord_id, created_at)
          SELECT id, guild_id, CAST(puddle_player_id AS TEXT), display_name, char_short, char_long, added_by_discord_id, created_at
          FROM tracked_players` })
        await db.execute({ sql: 'DROP TABLE tracked_players' })
        await db.execute({ sql: 'ALTER TABLE tracked_players_new RENAME TO tracked_players' })
        await db.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_tracked_guild ON tracked_players(guild_id)' })
        console.log('✅ tracked_players.puddle_player_id migrated to TEXT')
      }
    }

    if (tableNames.includes('rating_observations')) {
      const roInfo = await db.execute({ sql: 'PRAGMA table_info(rating_observations)' })
      const puddleCol = roInfo.rows.find((r: any) => r.name === 'puddle_player_id') as any
      if (puddleCol && typeof puddleCol.type === 'string' && puddleCol.type.toUpperCase() === 'INTEGER') {
        console.log('Migrating rating_observations.puddle_player_id INTEGER → TEXT...')
        // 前回の途中失敗でテーブルが残っている場合に備えて先に削除
        await db.execute({ sql: 'DROP TABLE IF EXISTS rating_observations_new' })
        await db.execute({ sql: `CREATE TABLE rating_observations_new (
          puddle_player_id TEXT NOT NULL,
          char_short TEXT NOT NULL,
          observed_at TEXT NOT NULL,
          rating REAL NOT NULL,
          PRIMARY KEY (puddle_player_id, char_short, observed_at)
        )` })
        await db.execute({ sql: `INSERT INTO rating_observations_new (puddle_player_id, char_short, observed_at, rating)
          SELECT CAST(puddle_player_id AS TEXT), char_short, observed_at, rating
          FROM rating_observations` })
        await db.execute({ sql: 'DROP TABLE rating_observations' })
        await db.execute({ sql: 'ALTER TABLE rating_observations_new RENAME TO rating_observations' })
        await db.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_obs_player_char ON rating_observations(puddle_player_id, char_short)' })
        console.log('✅ rating_observations.puddle_player_id migrated to TEXT')
      }
    }

    // system_settings テーブル（権限ロール・各種設定の保存先）が無ければ作成。
    // 旧環境では migrate-add-settings-table.ts で個別に作られていたが、
    // 新規デプロイでも確実に存在させるためここでも保証する。
    if (!tableNames.includes('system_settings')) {
      await db.execute({ sql: `CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )` })
      console.log('✅ system_settings table created')
    }

    // 簡易VC募集: VC参加回数の記録テーブル
    if (!tableNames.includes('vc_visits')) {
      await db.execute({ sql: `CREATE TABLE IF NOT EXISTS vc_visits (
        guild_id TEXT NOT NULL,
        discord_id TEXT NOT NULL,
        visit_count INTEGER NOT NULL DEFAULT 0,
        last_visit_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, discord_id)
      )` })
      console.log('✅ vc_visits table created')
    }

    // 簡易VC募集: 自動作成した一時VCの管理テーブル
    if (!tableNames.includes('temp_voice_channels')) {
      await db.execute({ sql: `CREATE TABLE IF NOT EXISTS temp_voice_channels (
        channel_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        creator_id TEXT NOT NULL,
        announce_channel_id TEXT,
        announce_message_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )` })
      await db.execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_temp_vc_guild ON temp_voice_channels(guild_id)' })
      console.log('✅ temp_voice_channels table created')
    }

    console.log('Database schema check complete');
  } catch (error) {
    console.error('Auto-migration error:', error);
    throw error;
  }
}
