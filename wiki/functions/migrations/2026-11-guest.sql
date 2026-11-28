-- ゲスト（ログインしていない人）のコメント・いいね・お気に入りに対応する（2026/11）
-- schema.sql で作った既存のデータベースに、D1 のコンソールで1回だけ実行する。
-- 新しく作るデータベースは schema.sql だけでよい（この変更も入っている）。
ALTER TABLE comments ADD COLUMN ip_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_comments_ip ON comments(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author, created_at);
CREATE INDEX IF NOT EXISTS idx_reactions_user ON reactions(user);
