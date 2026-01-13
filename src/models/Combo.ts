import { getDatabase } from '../database';
import { Combo } from '../types';
import { CharacterModel } from './Character';

export class ComboModel {
  // コンボを作成
  static async create(
    userDiscordId: string,
    characterName: string,
    location: 'center' | 'corner',
    tensionGauge: 0 | 50 | 100,
    starter: 'counter' | 'normal',
    comboNotation: string,
    damage?: number | null,
    note?: string | null
  ): Promise<Combo> {
    const db = getDatabase();

    // キャラ名からIDを取得
    const character = await CharacterModel.getByName(characterName);
    if (!character) {
      throw new Error(`Character not found: ${characterName}`);
    }

    const insertResult = await db.execute({
      sql: `
        INSERT INTO combos (
          user_discord_id,
          character_id,
          location,
          tension_gauge,
          starter,
          combo_notation,
          damage,
          note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        userDiscordId,
        character.id,
        location,
        tensionGauge,
        starter,
        comboNotation,
        damage || null,
        note || null
      ]
    });

    const selectResult = await db.execute({
      sql: 'SELECT * FROM combos WHERE id = ?',
      args: [Number(insertResult.lastInsertRowid)]
    });

    return selectResult.rows[0] as unknown as Combo;
  }

  // ユーザーの全コンボを取得
  static async getAllByUser(userDiscordId: string): Promise<Combo[]> {
    const db = getDatabase();

    const result = await db.execute({
      sql: `
        SELECT c.*
        FROM combos c
        LEFT JOIN characters ch ON c.character_id = ch.id
        WHERE c.user_discord_id = ?
        ORDER BY ch.display_order ASC, c.created_at DESC
      `,
      args: [userDiscordId]
    });

    return result.rows as unknown as Combo[];
  }

  // 特定キャラのコンボを取得
  static async getByCharacter(
    userDiscordId: string,
    characterName: string
  ): Promise<Combo[]> {
    const db = getDatabase();

    const character = await CharacterModel.getByName(characterName);
    if (!character) {
      return [];
    }

    const result = await db.execute({
      sql: `
        SELECT * FROM combos
        WHERE user_discord_id = ? AND character_id = ?
        ORDER BY created_at DESC
      `,
      args: [userDiscordId, character.id]
    });

    return result.rows as unknown as Combo[];
  }

  // 条件でフィルタリングしてコンボを取得
  static async getByConditions(
    userDiscordId: string,
    characterName: string,
    location?: 'center' | 'corner',
    tensionGauge?: 0 | 50 | 100,
    starter?: 'counter' | 'normal'
  ): Promise<Combo[]> {
    const db = getDatabase();

    const character = await CharacterModel.getByName(characterName);
    if (!character) {
      return [];
    }

    let query = 'SELECT * FROM combos WHERE user_discord_id = ? AND character_id = ?';
    const params: any[] = [userDiscordId, character.id];

    if (location) {
      query += ' AND location = ?';
      params.push(location);
    }

    if (tensionGauge !== undefined) {
      query += ' AND tension_gauge = ?';
      params.push(tensionGauge);
    }

    if (starter) {
      query += ' AND starter = ?';
      params.push(starter);
    }

    query += ' ORDER BY damage DESC, created_at DESC';

    const result = await db.execute({
      sql: query,
      args: params
    });

    return result.rows as unknown as Combo[];
  }

  // コンボを削除
  static async delete(id: number, userDiscordId: string): Promise<boolean> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'DELETE FROM combos WHERE id = ? AND user_discord_id = ?',
      args: [id, userDiscordId]
    });

    return result.rowsAffected > 0;
  }

  // IDでコンボを取得
  static async getById(id: number): Promise<Combo | null> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'SELECT * FROM combos WHERE id = ?',
      args: [id]
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as unknown as Combo;
  }
}
