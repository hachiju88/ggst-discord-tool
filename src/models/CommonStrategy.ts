import { getDatabase } from '../database';
import { CommonStrategy } from '../types';
import { CharacterModel } from './Character';

export class CommonStrategyModel {
  // 共通戦略を作成
  static async create(
    targetCharacterName: string,
    strategyContent: string,
    createdByDiscordId: string
  ): Promise<CommonStrategy> {
    const db = getDatabase();

    // キャラ名からIDを取得
    const targetChar = await CharacterModel.getByName(targetCharacterName);
    if (!targetChar) {
      throw new Error(`Character not found: ${targetCharacterName}`);
    }

    // 新旧両方のカラムに挿入
    const insertResult = await db.execute({
      sql: `
        INSERT INTO common_strategies (target_character, target_character_id, strategy_content, created_by_discord_id)
        VALUES (?, ?, ?, ?)
      `,
      args: [targetCharacterName, targetChar.id, strategyContent, createdByDiscordId]
    });

    const selectResult = await db.execute({
      sql: 'SELECT * FROM common_strategies WHERE id = ?',
      args: [Number(insertResult.lastInsertRowid)]
    });

    return selectResult.rows[0] as unknown as CommonStrategy;
  }

  // 特定キャラの共通戦略を取得
  static async getByCharacter(targetCharacterName: string): Promise<CommonStrategy[]> {
    const db = getDatabase();

    // キャラ名からIDを取得してID列でフィルタ
    const targetChar = await CharacterModel.getByName(targetCharacterName);
    if (targetChar) {
      const result = await db.execute({
        sql: `
          SELECT * FROM common_strategies
          WHERE target_character_id = ?
          ORDER BY created_at DESC
        `,
        args: [targetChar.id]
      });
      return result.rows as unknown as CommonStrategy[];
    } else {
      // 旧カラムでフォールバック
      const result = await db.execute({
        sql: `
          SELECT * FROM common_strategies
          WHERE target_character = ?
          ORDER BY created_at DESC
        `,
        args: [targetCharacterName]
      });
      return result.rows as unknown as CommonStrategy[];
    }
  }

  // 全ての共通戦略を取得
  static async getAll(): Promise<CommonStrategy[]> {
    const db = getDatabase();

    // charactersテーブルとJOINしてキャラ名でソート
    const result = await db.execute({
      sql: `
        SELECT cs.*
        FROM common_strategies cs
        LEFT JOIN characters c ON cs.target_character_id = c.id
        ORDER BY COALESCE(c.display_order, 999), COALESCE(c.name, cs.target_character), cs.created_at DESC
      `,
      args: []
    });

    return result.rows as unknown as CommonStrategy[];
  }

  // IDで共通戦略を取得
  static async getById(id: number): Promise<CommonStrategy | null> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'SELECT * FROM common_strategies WHERE id = ?',
      args: [id]
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as unknown as CommonStrategy;
  }

  // 共通戦略を更新
  static async update(id: number, strategyContent: string): Promise<CommonStrategy | null> {
    const db = getDatabase();

    const result = await db.execute({
      sql: `
        UPDATE common_strategies
        SET strategy_content = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      args: [strategyContent, id]
    });

    if (result.rowsAffected === 0) {
      return null;
    }

    return await this.getById(id);
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
