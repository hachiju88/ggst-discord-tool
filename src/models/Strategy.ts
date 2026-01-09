import { getDatabase } from '../database';
import { Strategy } from '../types';

export class StrategyModel {
  // 個人戦略を作成
  static create(
    userDiscordId: string,
    targetCharacter: string,
    strategyContent: string,
    source: string = 'user'
  ): Strategy {
    const db = getDatabase();

    const stmt = db.prepare(`
      INSERT INTO strategies (user_discord_id, target_character, strategy_content, source)
      VALUES (?, ?, ?, ?)
    `);

    const info = stmt.run(userDiscordId, targetCharacter, strategyContent, source);

    return db.prepare('SELECT * FROM strategies WHERE id = ?')
      .get(info.lastInsertRowid) as Strategy;
  }

  // 特定キャラの個人戦略を取得
  static getByCharacter(userDiscordId: string, targetCharacter: string): Strategy[] {
    const db = getDatabase();

    return db.prepare(`
      SELECT * FROM strategies
      WHERE user_discord_id = ? AND target_character = ?
      ORDER BY created_at DESC
    `).all(userDiscordId, targetCharacter) as Strategy[];
  }

  // ユーザーの全個人戦略を取得
  static getAllByUser(userDiscordId: string): Strategy[] {
    const db = getDatabase();

    return db.prepare(`
      SELECT * FROM strategies
      WHERE user_discord_id = ?
      ORDER BY target_character, created_at DESC
    `).all(userDiscordId) as Strategy[];
  }

  // 個人戦略を削除
  static delete(id: number, userDiscordId: string): boolean {
    const db = getDatabase();

    const stmt = db.prepare(`
      DELETE FROM strategies
      WHERE id = ? AND user_discord_id = ?
    `);

    const result = stmt.run(id, userDiscordId);
    return result.changes > 0;
  }
}
