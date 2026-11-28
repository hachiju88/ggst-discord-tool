-- ゲストのいいねの水増し対策と、IPアドレスのハッシュの鍵（2026/11、2026-11-guest.sql の後に実行）
ALTER TABLE reactions ADD COLUMN ip_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_reactions_ip ON reactions(ip_hash, created_at);
CREATE TABLE IF NOT EXISTS app_keys (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
