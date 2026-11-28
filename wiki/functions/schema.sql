-- 新しく作るデータベース用。前から使っているデータベースには、これではなく migrations/ の SQL を実行する
-- （このファイルを丸ごと流すと、まだ無い列へのインデックスでエラーになる）
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  page TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  author TEXT NOT NULL,         -- メールアドレス、ゲストなら anon:<ID>
  created_at TEXT NOT NULL,
  ip_hash TEXT                  -- ゲストの投稿だけ：IPアドレスの鍵付きハッシュ（連投の制限に使う）
);
CREATE INDEX IF NOT EXISTS idx_comments_page ON comments(page, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_ip ON comments(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author, created_at);

CREATE TABLE IF NOT EXISTS reactions (
  page TEXT NOT NULL,
  user TEXT NOT NULL,           -- メールアドレス、ゲストなら anon:<ID>
  kind TEXT NOT NULL CHECK (kind IN ('like', 'fav')),
  created_at TEXT NOT NULL,
  ip_hash TEXT,                 -- ゲストの分だけ：IPアドレスの鍵付きハッシュ（いいねの水増し対策）
  PRIMARY KEY (page, user, kind)
);
CREATE INDEX IF NOT EXISTS idx_reactions_kind ON reactions(kind, page);

-- フォームからの記事の作成・編集・削除の記録（誰がいつ変更したか）
CREATE TABLE IF NOT EXISTS article_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  action TEXT NOT NULL,
  user TEXT NOT NULL,
  at TEXT NOT NULL
);

-- アップロードした動画と、それを使っている記事
CREATE TABLE IF NOT EXISTS media (
  key TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS media_refs (
  key TEXT NOT NULL,
  page TEXT NOT NULL,
  PRIMARY KEY (key, page)
);
CREATE INDEX IF NOT EXISTS idx_media_refs_page ON media_refs(page);
CREATE INDEX IF NOT EXISTS idx_reactions_user ON reactions(user);
CREATE INDEX IF NOT EXISTS idx_reactions_ip ON reactions(ip_hash, created_at);

-- サーバーだけが使う鍵（ip_hash：IPアドレスのハッシュの鍵。初回に自動で作る）
CREATE TABLE IF NOT EXISTS app_keys (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
