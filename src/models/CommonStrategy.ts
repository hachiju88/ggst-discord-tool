import { getDatabase } from '../database';
import { CommonStrategy } from '../types';

export class CommonStrategyModel {
  // 共通戦略を作成
  static async create(
    targetCharacter: string,
    strategyContent: string,
    createdByDiscordId: string
  ): Promise<CommonStrategy> {
    const db = getDatabase();

    const insertResult = await db.execute({
      sql: `
        INSERT INTO common_strategies (target_character, strategy_content, created_by_discord_id)
        VALUES (?, ?, ?)
      `,
      args: [targetCharacter, strategyContent, createdByDiscordId]
    });

    const selectResult = await db.execute({
      sql: 'SELECT * FROM common_strategies WHERE id = ?',
      args: [Number(insertResult.lastInsertRowid)]
    });

    return selectResult.rows[0] as unknown as CommonStrategy;
  }

  // 特定キャラの共通戦略を取得
  static async getByCharacter(targetCharacter: string): Promise<CommonStrategy[]> {
    const db = getDatabase();

    const result = await db.execute({
      sql: `
        SELECT * FROM common_strategies
        WHERE target_character = ?
        ORDER BY created_at DESC
      `,
      args: [targetCharacter]
    });

    return result.rows as unknown as CommonStrategy[];
  }

  // 全ての共通戦略を取得
  static async getAll(): Promise<CommonStrategy[]> {
    const db = getDatabase();

    const result = await db.execute({
      sql: `
        SELECT * FROM common_strategies
        ORDER BY target_character, created_at DESC
      `,
      args: []
    });

    return result.rows as unknown as CommonStrategy[];
  }

  // 共通戦略を削除
  static async delete(id: number): Promise<boolean> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'DELETE FROM common_strategies WHERE id = ?',
      args: [id]
    });

    return result.rowsAffected > 0;
  }
}
