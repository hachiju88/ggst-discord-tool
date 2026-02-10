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
