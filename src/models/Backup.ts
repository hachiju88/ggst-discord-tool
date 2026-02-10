import { getDatabase } from '../database';

export interface BackupRecord {
    id: number;
    data: string;
    created_by: string;
    created_at: string;
}

export class BackupModel {
    private static MAX_BACKUPS = 5;

    // バックアップを作成
    static async create(data: string, createdBy: string): Promise<void> {
        const db = getDatabase();

        // バックアップを保存
        await db.execute({
            sql: `
        INSERT INTO backups (data, created_by)
        VALUES (?, ?)
      `,
            args: [data, createdBy]
        });

        // 古いバックアップを削除 (ローテーション)
        // IDの降順で上位5件を残し、それ以外を削除
        // SQLiteで "OFFSET" を使うか、サブクエリで削除対象を特定
        await db.execute({
            sql: `
        DELETE FROM backups
        WHERE id NOT IN (
          SELECT id FROM backups
          ORDER BY created_at DESC
          LIMIT ?
        )
      `,
            args: [this.MAX_BACKUPS]
        });
    }

    // 全てのバックアップを取得 (作成日時の降順)
    static async getAll(): Promise<BackupRecord[]> {
        const db = getDatabase();

        const result = await db.execute(`
      SELECT * FROM backups
      ORDER BY created_at DESC
    `);

        return result.rows as unknown as BackupRecord[];
    }

    // ID指定でバックアップを取得
    static async getById(id: number): Promise<BackupRecord | null> {
        const db = getDatabase();

        const result = await db.execute({
            sql: 'SELECT * FROM backups WHERE id = ?',
            args: [id]
        });

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0] as unknown as BackupRecord;
    }
}
