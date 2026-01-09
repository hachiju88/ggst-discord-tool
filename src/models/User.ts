import { getDatabase } from '../database';
import { User } from '../types';

export class UserModel {
  // ユーザーを取得または作成
  static async findOrCreate(discordId: string): Promise<User> {
    const db = getDatabase();

    // 既存ユーザーを検索
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE discord_id = ?',
      args: [discordId]
    });

    if (result.rows.length > 0) {
      return result.rows[0] as unknown as User;
    }

    // 新規ユーザーを作成
    await db.execute({
      sql: 'INSERT INTO users (discord_id) VALUES (?)',
      args: [discordId]
    });

    const newUserResult = await db.execute({
      sql: 'SELECT * FROM users WHERE discord_id = ?',
      args: [discordId]
    });

    return newUserResult.rows[0] as unknown as User;
  }

  // メインキャラクターを設定
  static async setMainCharacter(discordId: string, character: string): Promise<void> {
    const db = getDatabase();

    await db.execute({
      sql: `UPDATE users SET main_character = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`,
      args: [character, discordId]
    });
  }

  // メインキャラクターを取得
  static async getMainCharacter(discordId: string): Promise<string | null> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'SELECT main_character FROM users WHERE discord_id = ?',
      args: [discordId]
    });

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as { main_character: string | null };
    return row.main_character;
  }

  // ユーザー情報を取得
  static async getUser(discordId: string): Promise<User | null> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE discord_id = ?',
      args: [discordId]
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as unknown as User;
  }
}
