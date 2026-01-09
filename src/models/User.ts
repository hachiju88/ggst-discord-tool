import { getDatabase } from '../database';
import { User } from '../types';

export class UserModel {
  // ユーザーを取得または作成
  static findOrCreate(discordId: string): User {
    const db = getDatabase();

    // 既存ユーザーを検索
    const existingUser = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId) as User | undefined;

    if (existingUser) {
      return existingUser;
    }

    // 新規ユーザーを作成
    const stmt = db.prepare(
      'INSERT INTO users (discord_id) VALUES (?)'
    );
    stmt.run(discordId);

    return db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordId) as User;
  }

  // メインキャラクターを設定
  static setMainCharacter(discordId: string, character: string): void {
    const db = getDatabase();

    const stmt = db.prepare(`
      UPDATE users
      SET main_character = ?, updated_at = CURRENT_TIMESTAMP
      WHERE discord_id = ?
    `);

    stmt.run(character, discordId);
  }

  // メインキャラクターを取得
  static getMainCharacter(discordId: string): string | null {
    const db = getDatabase();

    const user = db.prepare('SELECT main_character FROM users WHERE discord_id = ?')
      .get(discordId) as { main_character: string | null } | undefined;

    return user?.main_character || null;
  }

  // ユーザー情報を取得
  static getUser(discordId: string): User | null {
    const db = getDatabase();

    const user = db.prepare('SELECT * FROM users WHERE discord_id = ?')
      .get(discordId) as User | undefined;

    return user || null;
  }
}
