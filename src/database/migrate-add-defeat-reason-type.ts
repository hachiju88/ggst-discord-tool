import 'dotenv/config';
import { createClient } from '@libsql/client';

async function migrate() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
    process.exit(1);
  }

  const db = createClient({ url, authToken });

  try {
    console.log('=== マイグレーション開始 ===\n');

    // 1. defeat_reason_typeカラムを追加
    console.log('1. matchesテーブルにdefeat_reason_typeカラムを追加...');
    await db.execute({
      sql: `
        ALTER TABLE matches
        ADD COLUMN defeat_reason_type TEXT CHECK(defeat_reason_type IN ('common', 'user'))
      `
    });
    console.log('✅ カラム追加完了\n');

    // 2. 既存データを更新（defeat_reason_idがある場合はcommonとして扱う）
    console.log('2. 既存データをcommonタイプに更新...');
    await db.execute({
      sql: `
        UPDATE matches
        SET defeat_reason_type = 'common'
        WHERE defeat_reason_id IS NOT NULL
      `
    });
    console.log('✅ 既存データ更新完了\n');

    // 3. 共通敗因に「コンボミス」を追加
    console.log('3. 共通敗因に「コンボミス」を追加...');

    // まず最大のdisplay_orderを取得
    const maxOrderResult = await db.execute({
      sql: 'SELECT MAX(display_order) as max_order FROM common_defeat_reasons'
    });
    const maxOrder = (maxOrderResult.rows[0]?.max_order as number) || 0;

    await db.execute({
      sql: `
        INSERT INTO common_defeat_reasons (reason, display_order)
        VALUES (?, ?)
      `,
      args: ['コンボミス', maxOrder + 1]
    });
    console.log('✅ 共通敗因追加完了\n');

    // 4. 確認
    console.log('4. 確認...');
    const reasons = await db.execute({
      sql: 'SELECT * FROM common_defeat_reasons ORDER BY display_order'
    });
    console.log(`共通敗因総数: ${reasons.rows.length}件\n`);

    const comboMiss = reasons.rows.find(r => r.reason === 'コンボミス');
    if (comboMiss) {
      console.log(`✅ 新規追加: ID=${comboMiss.id}, reason=${comboMiss.reason}, display_order=${comboMiss.display_order}\n`);
    }

    console.log('=== マイグレーション完了 ===');

  } catch (error) {
    console.error('❌ マイグレーションエラー:', error);
    throw error;
  } finally {
    db.close();
  }
}

migrate();
