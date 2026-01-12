import { getDatabase } from '../database';
import { Strategy } from '../types';

export class StrategyModel {
  // 個人戦略を作成
  static async create(
    userDiscordId: string,
    targetCharacter: string,
    strategyContent: string,
    source: string = 'user'
  ): Promise<Strategy> {
    const db = getDatabase();

    const insertResult = await db.execute({
      sql: `
        INSERT INTO strategies (user_discord_id, target_character, strategy_content, source)
        VALUES (?, ?, ?, ?)
      `,
      args: [userDiscordId, targetCharacter, strategyContent, source]
    });

    const selectResult = await db.execute({
      sql: 'SELECT * FROM strategies WHERE id = ?',
      args: [Number(insertResult.lastInsertRowid)]
    });

    return selectResult.rows[0] as unknown as Strategy;
  }

  // 特定キャラの個人戦略を取得
  static async getByCharacter(userDiscordId: string, targetCharacter: string): Promise<Strategy[]> {
    const db = getDatabase();

    const result = await db.execute({
      sql: `
        SELECT * FROM strategies
        WHERE user_discord_id = ? AND target_character = ?
        ORDER BY created_at DESC
      `,
      args: [userDiscordId, targetCharacter]
    });

    return result.rows as unknown as Strategy[];
  }

  // ユーザーの全個人戦略を取得
  static async getAllByUser(userDiscordId: string): Promise<Strategy[]> {
    const db = getDatabase();

    const result = await db.execute({
      sql: `
        SELECT * FROM strategies
        WHERE user_discord_id = ?
        ORDER BY target_character, created_at DESC
      `,
      args: [userDiscordId]
    });

    return result.rows as unknown as Strategy[];
  }

  // 個人戦略を削除
  static async delete(id: number, userDiscordId: string): Promise<boolean> {
    const db = getDatabase();

    const result = await db.execute({
      sql: `
        DELETE FROM strategies
        WHERE id = ? AND user_discord_id = ?
      `,
      args: [id, userDiscordId]
    });

    return result.rowsAffected > 0;
  }
}
