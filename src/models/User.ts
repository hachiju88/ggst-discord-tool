import { getDatabase } from '../database';
import { User, Character } from '../types';
import { CharacterModel } from './Character';

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

  // メインキャラクターを設定（キャラ名から）
  static async setMainCharacter(discordId: string, characterName: string): Promise<void> {
    const db = getDatabase();

    // キャラ名からIDを取得
    const character = await CharacterModel.getByName(characterName);
    if (!character) {
      throw new Error(`Character not found: ${characterName}`);
    }

    // 新旧両方のカラムを更新（後方互換性のため）
    await db.execute({
      sql: `UPDATE users SET main_character = ?, main_character_id = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`,
      args: [characterName, character.id, discordId]
    });
  }

  // メインキャラクターを設定（キャラIDから）
  static async setMainCharacterById(discordId: string, characterId: number): Promise<void> {
    const db = getDatabase();

    // キャラIDから名前を取得
    const character = await CharacterModel.getById(characterId);
    if (!character) {
      throw new Error(`Character not found with ID: ${characterId}`);
    }

    // 新旧両方のカラムを更新（後方互換性のため）
    await db.execute({
      sql: `UPDATE users SET main_character = ?, main_character_id = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?`,
      args: [character.name, characterId, discordId]
    });
  }

  // メインキャラクター名を取得（後方互換性のため）
  static async getMainCharacter(discordId: string): Promise<string | null> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'SELECT main_character FROM users WHERE discord_id = ?',
      args: [discordId]
    });

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as unknown as { main_character: string | null };
    return row.main_character;
  }

  // メインキャラクターIDを取得
  static async getMainCharacterId(discordId: string): Promise<number | null> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'SELECT main_character_id FROM users WHERE discord_id = ?',
      args: [discordId]
    });

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as unknown as { main_character_id: number | null };
    return row.main_character_id;
  }

  // メインキャラクター情報を取得
  static async getMainCharacterInfo(discordId: string): Promise<Character | null> {
    const characterId = await this.getMainCharacterId(discordId);
    if (!characterId) {
      return null;
    }

    return await CharacterModel.getById(characterId);
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
