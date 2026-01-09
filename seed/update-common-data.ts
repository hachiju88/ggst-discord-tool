import Database from 'better-sqlite3';
import * as path from 'path';

const dbPath = path.join(__dirname, '..', 'data', 'ggst.db');
const db = new Database(dbPath);

// 箇条書き形式のデータに更新
const updates = [
  { character: 'ソル=バッドガイ', invincible: true, invincibleAwake: true, commandThrow: true, counter: false },
  { character: 'カイ=キスク', invincible: true, invincibleAwake: true, commandThrow: false, counter: false },
  { character: 'メイ', invincible: false, invincibleAwake: true, commandThrow: true, counter: false },
  { character: 'アクセル・ロウ', invincible: false, invincibleAwake: true, commandThrow: true, counter: false },
  { character: 'チップ・ザナフ', invincible: true, invincibleAwake: true, commandThrow: true, counter: false },
  { character: 'ポチョムキン', invincible: false, invincibleAwake: true, commandThrow: true, counter: false },
  { character: 'ファウスト', invincible: false, invincibleAwake: true, commandThrow: true, counter: false },
  { character: 'ミリア・レイジ', invincible: true, invincibleAwake: true, commandThrow: false, counter: false },
  { character: 'ザトー=ONE', invincible: false, invincibleAwake: false, commandThrow: true, counter: false },
  { character: 'ラムレザル=ヴァレンタイン', invincible: false, invincibleAwake: true, commandThrow: false, counter: false },
  { character: 'レオ・ホワイトファング', invincible: true, invincibleAwake: true, commandThrow: true, counter: true },
  { character: 'ナゴリユキ', invincible: true, invincibleAwake: true, commandThrow: true, counter: false },
  { character: 'ジオヴァーナ', invincible: true, invincibleAwake: true, commandThrow: false, counter: false },
  { character: 'アンジー', invincible: true, invincibleAwake: false, commandThrow: false, counter: true },
  { character: 'イノ', invincible: false, invincibleAwake: true, commandThrow: true, counter: false },
  { character: 'ゴールドルイス', invincible: false, invincibleAwake: true, commandThrow: false, counter: false },
  { character: 'ジャック・オー', invincible: false, invincibleAwake: true, commandThrow: true, counter: false },
  { character: 'ハッピーカオス', invincible: false, invincibleAwake: false, commandThrow: false, counter: false },
  { character: 'バイケン', invincible: false, invincibleAwake: true, commandThrow: false, counter: true },
  { character: 'テスタメント', invincible: false, invincibleAwake: true, commandThrow: false, counter: false },
  { character: 'ブリジット', invincible: true, invincibleAwake: false, commandThrow: true, counter: false },
  { character: 'シン・キスク', invincible: true, invincibleAwake: true, commandThrow: false, counter: false },
  { character: 'ベッドマン?', invincible: false, invincibleAwake: true, commandThrow: false, counter: false },
  { character: 'アスカR#', invincible: true, invincibleAwake: false, commandThrow: false, counter: false },
  { character: 'ジョニー', invincible: false, invincibleAwake: true, commandThrow: false, counter: false },
  { character: 'エルフェルト', invincible: false, invincibleAwake: true, commandThrow: true, counter: false },
  { character: 'A.B.A', invincible: true, invincibleAwake: false, commandThrow: false, counter: true },
  { character: 'スレイヤー', invincible: false, invincibleAwake: true, commandThrow: true, counter: false },
  { character: 'ディズィー', invincible: false, invincibleAwake: true, commandThrow: false, counter: false },
  { character: 'ヴェノム', invincible: false, invincibleAwake: false, commandThrow: true, counter: false },
  { character: 'ユニカ', invincible: true, invincibleAwake: true, commandThrow: false, counter: false },
  { character: 'ルーシー', invincible: true, invincibleAwake: true, commandThrow: false, counter: false },
];

// 箇条書き形式に変換する関数
function formatContent(data: { invincible: boolean; invincibleAwake: boolean; commandThrow: boolean; counter: boolean }): string {
  const lines = [
    `無敵：${data.invincible ? 'あり' : 'なし'}`,
    `無敵覚醒：${data.invincibleAwake ? 'あり' : 'なし'}`,
    `コマ投げ：${data.commandThrow ? 'あり' : 'なし'}`,
    `当て身：${data.counter ? 'あり' : 'なし'}`
  ];
  return lines.join('\n');
}

try {
  // システムユーザーが存在しない場合は作成
  const systemUserId = 'system';
  const userCheckStmt = db.prepare('SELECT discord_id FROM users WHERE discord_id = ?');
  const existingUser = userCheckStmt.get(systemUserId);

  if (!existingUser) {
    const insertUserStmt = db.prepare(`
      INSERT INTO users (discord_id, main_character)
      VALUES (?, NULL)
    `);
    insertUserStmt.run(systemUserId);
    console.log('システムユーザーを作成しました');
  }

  // 各キャラクターごとに、データを新規挿入または更新
  for (const update of updates) {
    // 箇条書き形式に変換
    const content = formatContent(update);

    // そのキャラクターの全レコードを取得
    const getStmt = db.prepare(`
      SELECT id FROM common_strategies
      WHERE target_character = ?
      ORDER BY id ASC
    `);
    const records = getStmt.all(update.character) as Array<{ id: number }>;

    if (records.length > 0) {
      // 最初のレコードを更新
      const updateStmt = db.prepare(`
        UPDATE common_strategies
        SET strategy_content = ?
        WHERE id = ?
      `);
      updateStmt.run(content, records[0].id);

      // 2件目以降を削除
      if (records.length > 1) {
        const deleteStmt = db.prepare(`
          DELETE FROM common_strategies
          WHERE target_character = ? AND id != ?
        `);
        deleteStmt.run(update.character, records[0].id);
      }

      console.log(`${update.character}: 更新しました`);
    } else {
      // レコードが存在しない場合は新規挿入
      const insertStmt = db.prepare(`
        INSERT INTO common_strategies (target_character, strategy_content, created_by_discord_id)
        VALUES (?, ?, ?)
      `);
      insertStmt.run(update.character, content, systemUserId);
      console.log(`${update.character}: 新規挿入しました`);
    }
  }

  // 確認
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM common_strategies');
  const result = countStmt.get() as { count: number };
  console.log(`\nデータベースに登録されている共通対策情報: ${result.count}件`);

} catch (error) {
  console.error('エラーが発生しました:', error);
} finally {
  db.close();
}
