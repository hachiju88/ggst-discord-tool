import 'dotenv/config';
import { createClient } from '@libsql/client';

async function debugCharacterMoves() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
    process.exit(1);
  }

  const db = createClient({ url, authToken });

  try {
    // キャラクター一覧を取得
    console.log('📋 キャラクター一覧\n');
    const characters = await db.execute('SELECT id, name FROM characters ORDER BY display_order');

    if (characters.rows.length === 0) {
      console.log('❌ キャラクターが登録されていません');
      return;
    }

    // 各キャラクターの技数を確認
    console.log('キャラクター | ID | 専用技数');
    console.log('------------|----|---------');

    for (const char of characters.rows) {
      const moves = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM character_moves WHERE character_id = ?',
        args: [char.id]
      });
      const count = Number(moves.rows[0].count);
      console.log(`${String(char.name).padEnd(20)} | ${String(char.id).padEnd(2)} | ${count}`);
    }

    // 最近追加された技を表示
    console.log('\n📝 最近追加された専用技（最新10件）\n');
    const recentMoves = await db.execute(`
      SELECT
        c.name as character_name,
        cm.move_name,
        cm.move_name_en,
        cm.move_notation,
        cm.created_at
      FROM character_moves cm
      JOIN characters c ON cm.character_id = c.id
      ORDER BY cm.created_at DESC
      LIMIT 10
    `);

    if (recentMoves.rows.length === 0) {
      console.log('❌ 専用技が1件も登録されていません');
    } else {
      recentMoves.rows.forEach(row => {
        console.log(`${row.character_name} | ${row.move_name} (${row.move_notation})`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    db.close();
  }
}

debugCharacterMoves();
