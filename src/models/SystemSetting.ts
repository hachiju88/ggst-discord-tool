import { getDatabase } from '../database';

export class SystemSettingModel {
    // 設定値を取得
    static async get(key: string): Promise<string | null> {
        const db = getDatabase();
        const result = await db.execute({
            sql: 'SELECT value FROM system_settings WHERE key = ?',
            args: [key]
        });

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0].value as string;
    }

    // 設定値を保存 (Upsert)
    static async set(key: string, value: string): Promise<void> {
        const db = getDatabase();
        await db.execute({
            sql: `
        INSERT INTO system_settings (key, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `,
            args: [key, value]
        });
    }

    // 設定値を削除
    static async delete(key: string): Promise<void> {
        const db = getDatabase();
        await db.execute({
            sql: 'DELETE FROM system_settings WHERE key = ?',
            args: [key]
        });
    }
}
