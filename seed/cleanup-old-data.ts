import Database from 'better-sqlite3';
import * as path from 'path';

const dbPath = path.join(__dirname, '..', 'data', 'ggst.db');
const db = new Database(dbPath);

try {
  // 「梅喧」という古いデータを削除
  const deleteStmt = db.prepare(`
    DELETE FROM common_strategies
    WHERE target_character = ?
  `);

  const result = deleteStmt.run('梅喧');

  if (result.changes > 0) {
    console.log(`古いデータ「梅喧」を削除しました（${result.changes}件）`);
  } else {
    console.log('削除対象のデータが見つかりませんでした');
  }

  // 確認
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM common_strategies');
  const countResult = countStmt.get() as { count: number };
  console.log(`現在のデータ件数: ${countResult.count}件`);

  // 全キャラクター一覧を表示
  const listStmt = db.prepare('SELECT DISTINCT target_character FROM common_strategies ORDER BY target_character');
  const characters = listStmt.all() as Array<{ target_character: string }>;
  console.log('\n登録されているキャラクター:');
  characters.forEach((char, index) => {
    console.log(`  ${index + 1}. ${char.target_character}`);
  });

} catch (error) {
  console.error('エラーが発生しました:', error);
} finally {
  db.close();
}
