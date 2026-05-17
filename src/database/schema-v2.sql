-- ======================================
-- GGSTディスコードBot スキーマ v2
-- ======================================

-- characters テーブル: キャラクター情報
CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    name_en TEXT,
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- users テーブル: Discord ユーザー情報
CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    main_character_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (main_character_id) REFERENCES characters(id)
);

-- common_defeat_reasons テーブル: 共通の敗因マスタ
CREATE TABLE IF NOT EXISTS common_defeat_reasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reason TEXT NOT NULL UNIQUE,
    display_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- defeat_reasons テーブル: ユーザー独自の敗因
CREATE TABLE IF NOT EXISTS defeat_reasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_discord_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_discord_id, reason),
    FOREIGN KEY (user_discord_id) REFERENCES users(discord_id)
);

-- matches テーブル: 個人の対戦記録
CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_discord_id TEXT NOT NULL,
    my_character_id INTEGER,
    opponent_character_id INTEGER NOT NULL,
    result TEXT CHECK(result IN ('win', 'loss')),
    defeat_reason_id INTEGER,
    note TEXT,
    priority TEXT CHECK(priority IN ('critical', 'important', 'recommended')),
    match_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_discord_id) REFERENCES users(discord_id),
    FOREIGN KEY (my_character_id) REFERENCES characters(id),
    FOREIGN KEY (opponent_character_id) REFERENCES characters(id),
    FOREIGN KEY (defeat_reason_id) REFERENCES defeat_reasons(id)
);

-- strategies テーブル: 個人専用の戦略メモ
CREATE TABLE IF NOT EXISTS strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_discord_id TEXT NOT NULL,
    target_character_id INTEGER NOT NULL,
    strategy_content TEXT NOT NULL,
    source TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_discord_id) REFERENCES users(discord_id),
    FOREIGN KEY (target_character_id) REFERENCES characters(id)
);

-- common_strategies テーブル: 全ユーザー共通の対策情報
CREATE TABLE IF NOT EXISTS common_strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_character_id INTEGER NOT NULL,
    strategy_content TEXT NOT NULL,
    created_by_discord_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by_discord_id) REFERENCES users(discord_id),
    FOREIGN KEY (target_character_id) REFERENCES characters(id)
);

-- character_moves テーブル: キャラクターのコマンド技
CREATE TABLE IF NOT EXISTS character_moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL,
    move_name TEXT NOT NULL,
    move_name_en TEXT,
    move_notation TEXT NOT NULL,
    move_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (character_id) REFERENCES characters(id)
);

-- combos テーブル: コンボ情報
CREATE TABLE IF NOT EXISTS combos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_discord_id TEXT NOT NULL,
    character_id INTEGER NOT NULL,
    location TEXT NOT NULL CHECK(location IN ('center', 'corner')),
    tension_gauge INTEGER NOT NULL CHECK(tension_gauge IN (0, 50, 100)),
    starter TEXT NOT NULL CHECK(starter IN ('counter', 'normal')),
    combo_notation TEXT NOT NULL,
    damage INTEGER,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_discord_id) REFERENCES users(discord_id),
    FOREIGN KEY (character_id) REFERENCES characters(id)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_users_main_char ON users(main_character_id);
CREATE INDEX IF NOT EXISTS idx_matches_user ON matches(user_discord_id);
CREATE INDEX IF NOT EXISTS idx_matches_my_char ON matches(my_character_id);
CREATE INDEX IF NOT EXISTS idx_matches_opponent ON matches(opponent_character_id);
CREATE INDEX IF NOT EXISTS idx_matches_priority ON matches(priority);
CREATE INDEX IF NOT EXISTS idx_matches_defeat_reason ON matches(defeat_reason_id);
CREATE INDEX IF NOT EXISTS idx_strategies_user ON strategies(user_discord_id);
CREATE INDEX IF NOT EXISTS idx_strategies_target ON strategies(target_character_id);
CREATE INDEX IF NOT EXISTS idx_common_strategies_target ON common_strategies(target_character_id);
CREATE INDEX IF NOT EXISTS idx_defeat_reasons_user ON defeat_reasons(user_discord_id);
CREATE INDEX IF NOT EXISTS idx_character_moves_char ON character_moves(character_id);
CREATE INDEX IF NOT EXISTS idx_combos_user ON combos(user_discord_id);
CREATE INDEX IF NOT EXISTS idx_combos_char ON combos(character_id);

-- ======================================
-- トーナメント管理テーブル
-- ======================================

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'single_elim',
  type TEXT NOT NULL DEFAULT 'individual',
  max_participants INTEGER,
  status TEXT NOT NULL DEFAULT 'registration',
  regulation TEXT NOT NULL DEFAULT '{"winsRequired":2,"handicapRules":[]}',
  created_by TEXT NOT NULL,
  channel_id TEXT,
  announcement_message_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournament_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  discord_id TEXT NOT NULL,
  discord_name TEXT NOT NULL,
  rank TEXT,
  seed INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tournament_id, discord_id)
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  match_code TEXT,
  participant1_id INTEGER REFERENCES tournament_participants(id),
  participant2_id INTEGER REFERENCES tournament_participants(id),
  winner_id INTEGER REFERENCES tournament_participants(id),
  handicap_participant_id INTEGER REFERENCES tournament_participants(id),
  handicap_rounds INTEGER NOT NULL DEFAULT 0,
  vc_channel_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  message_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tournaments_guild ON tournaments(guild_id);
CREATE INDEX IF NOT EXISTS idx_participants_tournament ON tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON tournament_matches(tournament_id);
