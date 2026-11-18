CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  page TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  author TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_page ON comments(page, created_at);

CREATE TABLE IF NOT EXISTS reactions (
  page TEXT NOT NULL,
  user TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('like', 'fav')),
  created_at TEXT NOT NULL,
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
