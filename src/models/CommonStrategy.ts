import { getDatabase } from '../database';
import { CommonStrategy } from '../types';

export class CommonStrategyModel {
  // 共通戦略を作成
  static create(
    targetCharacter: string,
    strategyContent: string,
    createdByDiscordId: string
  ): CommonStrategy {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO common_strategies (target_character, strategy_content, created_by_discord_id)
      VALUES (?, ?, ?)
    `);

    const info = stmt.run(targetCharacter, strategyContent, createdByDiscordId);

    return db.prepare('SELECT * FROM common_strategies WHERE id = ?')
      .get(info.lastInsertRowid) as CommonStrategy;
  }

  // 特定キャラの共通戦略を取得
  static getByCharacter(targetCharacter: string): CommonStrategy[] {
    const db = getDatabase();

    return db.prepare(`
      SELECT * FROM common_strategies
      WHERE target_character = ?
      ORDER BY created_at DESC
    `).all(targetCharacter) as CommonStrategy[];
  }

  // 全ての共通戦略を取得
  static getAll(): CommonStrategy[] {
    const db = getDatabase();

    return db.prepare(`
      SELECT * FROM common_strategies
      ORDER BY target_character, created_at DESC
    `).all() as CommonStrategy[];
  }

  // 共通戦略を削除
  static delete(id: number): boolean {
    const db = getDatabase();

    const stmt = db.prepare('DELETE FROM common_strategies WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
