-- users テーブル: Discord ユーザー情報
CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    main_character TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- matches テーブル: 個人の対戦記録
CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_discord_id TEXT NOT NULL,
    my_character TEXT,
    opponent_character TEXT NOT NULL,
    result TEXT NOT NULL CHECK(result IN ('win', 'loss')),
    note TEXT,
    match_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_discord_id) REFERENCES users(discord_id)
);

-- strategies テーブル: 個人専用の戦略メモ
CREATE TABLE IF NOT EXISTS strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_discord_id TEXT NOT NULL,
    target_character TEXT NOT NULL,
    strategy_content TEXT NOT NULL,
    source TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_discord_id) REFERENCES users(discord_id)
);

-- common_strategies テーブル: 全ユーザー共通の対策情報
CREATE TABLE IF NOT EXISTS common_strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_character TEXT NOT NULL,
    strategy_content TEXT NOT NULL,
    created_by_discord_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by_discord_id) REFERENCES users(discord_id)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_matches_user ON matches(user_discord_id);
CREATE INDEX IF NOT EXISTS idx_matches_opponent ON matches(opponent_character);
CREATE INDEX IF NOT EXISTS idx_strategies_user ON strategies(user_discord_id);
CREATE INDEX IF NOT EXISTS idx_strategies_target ON strategies(target_character);
CREATE INDEX IF NOT EXISTS idx_common_strategies_target ON common_strategies(target_character);
