import 'dotenv/config';
import { createClient } from '@libsql/client';

async function addCancelMoves() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
    process.exit(1);
  }

  const db = createClient({ url, authToken });
  console.log('🔄 共通技にキャンセル技を追加\n');

  const newMoves = [
    {
      move_name: 'ダッキャン',
      move_name_en: 'Dash Cancel',
      move_notation: 'd.c',
      move_type: 'システム'
    },
    {
      move_name: 'ジャンキャン',
      move_name_en: 'Jump Cancel',
      move_notation: 'j.c',
      move_type: 'システム'
    }
  ];

  try {
    for (const move of newMoves) {
      // 既に存在するかチェック
      const existing = await db.execute({
        sql: 'SELECT id FROM common_moves WHERE move_notation = ?',
        args: [move.move_notation]
      });

      if (existing.rows.length > 0) {
        console.log(`ℹ️  ${move.move_name} (${move.move_notation}) は既に存在します`);
        continue;
      }

      // 追加
      const result = await db.execute({
        sql: `
          INSERT INTO common_moves (move_name, move_name_en, move_notation, move_type)
          VALUES (?, ?, ?, ?)
        `,
        args: [move.move_name, move.move_name_en, move.move_notation, move.move_type]
      });

      console.log(`✅ 追加: ${move.move_name} / ${move.move_name_en} (${move.move_notation})`);
    }

    console.log('\n✅ 追加完了');

    // 追加後の一覧を表示
    console.log('\n📋 追加された技:');
    const result = await db.execute({
      sql: `
        SELECT id, move_name, move_name_en, move_notation, move_type
        FROM common_moves
        WHERE move_notation IN ('d.c', 'j.c')
        ORDER BY move_notation
      `
    });

    result.rows.forEach(row => {
      console.log(`  ID: ${row.id} | ${row.move_name} / ${row.move_name_en} (${row.move_notation})`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

addCancelMoves();
