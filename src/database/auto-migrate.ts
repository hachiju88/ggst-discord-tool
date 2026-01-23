import { getDatabase } from './index';

/**
 * 起動時に自動的に必要なマイグレーションを実行
 */
export async function autoMigrate() {
  const db = getDatabase();

  try {
    console.log('Checking database schema...');

    // defeat_reason_typeカラムの存在確認
    const tableInfo = await db.execute({
      sql: "PRAGMA table_info(matches)"
    });

    const hasDefeatReasonType = tableInfo.rows.some(
      (row: any) => row.name === 'defeat_reason_type'
    );

    if (!hasDefeatReasonType) {
      console.log('Adding defeat_reason_type column...');

      // カラムを追加
      await db.execute({
        sql: `
          ALTER TABLE matches
          ADD COLUMN defeat_reason_type TEXT CHECK(defeat_reason_type IN ('common', 'user'))
        `
      });

      // 既存データを更新
      await db.execute({
        sql: `
          UPDATE matches
          SET defeat_reason_type = 'common'
          WHERE defeat_reason_id IS NOT NULL
        `
      });

      console.log('✅ defeat_reason_type column added');
    } else {
      console.log('✅ defeat_reason_type column already exists');
    }

    // 共通敗因に「コンボミス」が存在するか確認
    const comboMissCheck = await db.execute({
      sql: "SELECT * FROM common_defeat_reasons WHERE reason = 'コンボミス'"
    });

    if (comboMissCheck.rows.length === 0) {
      console.log('Adding "コンボミス" to common defeat reasons...');

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

      console.log('✅ "コンボミス" added to common defeat reasons');
    } else {
      console.log('✅ "コンボミス" already exists');
    }

    console.log('Database schema check complete');
  } catch (error) {
    console.error('Auto-migration error:', error);
    // エラーが発生しても起動は続行（既にカラムが存在する場合など）
  }
}
