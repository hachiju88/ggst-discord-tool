import { getDatabase } from '../database';

export interface Character {
  id: number;
  name: string;
  name_en: string | null;
  display_order: number;
  created_at: string;
}

export class CharacterModel {
  // 全キャラクター取得
  static async getAll(): Promise<Character[]> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'SELECT * FROM characters ORDER BY display_order ASC, name ASC',
      args: []
    });

    return result.rows as unknown as Character[];
  }

  // ID指定でキャラクター取得
  static async getById(id: number): Promise<Character | null> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'SELECT * FROM characters WHERE id = ?',
      args: [id]
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as unknown as Character;
  }

  // 名前指定でキャラクター取得
  static async getByName(name: string): Promise<Character | null> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'SELECT * FROM characters WHERE name = ?',
      args: [name]
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as unknown as Character;
  }

  // キャラクター名からID取得（便利メソッド）
  static async getIdByName(name: string): Promise<number | null> {
    const character = await this.getByName(name);
    return character ? character.id : null;
  }

  // キャラクター名リストをIDリストに変換
  static async getNamesForAutocomplete(): Promise<Array<{ name: string; value: string }>> {
    const characters = await this.getAll();
    return characters.map(char => ({
      name: char.name_en ? `${char.name} (${char.name_en})` : char.name,
      value: char.name
    }));
  }

  // キャラクター名のキャッシュ（オートコンプリート用）
  private static cachedNames: Array<{ name: string; value: string }> | null = null;
  private static cacheTimestamp: number = 0;
  private static CACHE_DURATION = 1000 * 60 * 60; // 1時間

  static async getCachedNamesForAutocomplete(): Promise<Array<{ name: string; value: string }>> {
    const now = Date.now();

    // キャッシュが有効な場合はそれを返す
    if (this.cachedNames && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
      return this.cachedNames;
    }

    // キャッシュを更新
    this.cachedNames = await this.getNamesForAutocomplete();
    this.cacheTimestamp = now;

    return this.cachedNames;
  }

  // キャッシュをクリア（テスト用）
  static clearCache(): void {
    this.cachedNames = null;
    this.cacheTimestamp = 0;
  }
}
