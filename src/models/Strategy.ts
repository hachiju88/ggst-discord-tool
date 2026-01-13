import { getDatabase } from '../database';
import { Strategy } from '../types';
import { CharacterModel } from './Character';

export class StrategyModel {
  // 個人戦略を作成
  static async create(
    userDiscordId: string,
    targetCharacterName: string,
    strategyContent: string,
    source: string = 'user'
  ): Promise<Strategy> {
    const db = getDatabase();

    // キャラ名からIDを取得
    const targetChar = await CharacterModel.getByName(targetCharacterName);
    if (!targetChar) {
      throw new Error(`Character not found: ${targetCharacterName}`);
    }

    // 新旧両方のカラムに挿入
    const insertResult = await db.execute({
      sql: `
        INSERT INTO strategies (user_discord_id, target_character, target_character_id, strategy_content, source)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [userDiscordId, targetCharacterName, targetChar.id, strategyContent, source]
    });

    const selectResult = await db.execute({
      sql: 'SELECT * FROM strategies WHERE id = ?',
      args: [Number(insertResult.lastInsertRowid)]
    });

    return selectResult.rows[0] as unknown as Strategy;
  }

  // 特定キャラの個人戦略を取得
  static async getByCharacter(userDiscordId: string, targetCharacterName: string): Promise<Strategy[]> {
    const db = getDatabase();

    // キャラ名からIDを取得してID列でフィルタ
    const targetChar = await CharacterModel.getByName(targetCharacterName);
    if (targetChar) {
      const result = await db.execute({
        sql: `
          SELECT * FROM strategies
          WHERE user_discord_id = ? AND target_character_id = ?
          ORDER BY created_at DESC
        `,
        args: [userDiscordId, targetChar.id]
      });
      return result.rows as unknown as Strategy[];
    } else {
      // 旧カラムでフォールバック
      const result = await db.execute({
        sql: `
          SELECT * FROM strategies
          WHERE user_discord_id = ? AND target_character = ?
          ORDER BY created_at DESC
        `,
        args: [userDiscordId, targetCharacterName]
      });
      return result.rows as unknown as Strategy[];
    }
  }

  // ユーザーの全個人戦略を取得
  static async getAllByUser(userDiscordId: string): Promise<Strategy[]> {
    const db = getDatabase();

    // charactersテーブルとJOINしてキャラ名でソート
    const result = await db.execute({
      sql: `
        SELECT s.*
        FROM strategies s
        LEFT JOIN characters c ON s.target_character_id = c.id
        WHERE s.user_discord_id = ?
        ORDER BY COALESCE(c.display_order, 999), COALESCE(c.name, s.target_character), s.created_at DESC
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
