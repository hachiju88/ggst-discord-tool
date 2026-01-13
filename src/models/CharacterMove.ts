import { getDatabase } from '../database';
import { CharacterMove } from '../types';
import { CharacterModel } from './Character';

export class CharacterMoveModel {
  // 技を作成
  static async create(
    characterName: string,
    moveName: string,
    moveNotation: string,
    moveType?: string | null,
    moveNameEn?: string | null
  ): Promise<CharacterMove> {
    const db = getDatabase();

    // キャラ名からIDを取得
    const character = await CharacterModel.getByName(characterName);
    if (!character) {
      throw new Error(`Character not found: ${characterName}`);
    }

    const insertResult = await db.execute({
      sql: `
        INSERT INTO character_moves (character_id, move_name, move_name_en, move_notation, move_type)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [character.id, moveName, moveNameEn || null, moveNotation, moveType || null]
    });

    const selectResult = await db.execute({
      sql: 'SELECT * FROM character_moves WHERE id = ?',
      args: [Number(insertResult.lastInsertRowid)]
    });

    return selectResult.rows[0] as unknown as CharacterMove;
  }

  // 特定キャラの全技を取得
  static async getByCharacter(characterName: string): Promise<CharacterMove[]> {
    const db = getDatabase();

    const character = await CharacterModel.getByName(characterName);
    if (!character) {
      return [];
    }

    const result = await db.execute({
      sql: 'SELECT * FROM character_moves WHERE character_id = ? ORDER BY move_name ASC',
      args: [character.id]
    });

    return result.rows as unknown as CharacterMove[];
  }

  // 特定キャラの技をオートコンプリート用に取得
  static async getMovesForAutocomplete(characterName: string): Promise<Array<{ name: string; value: string }>> {
    const moves = await this.getByCharacter(characterName);

    return moves.map(move => {
      // 英語名がある場合は「日本語名 / English Name (コマンド)」形式
      // 英語名がない場合は「日本語名 (コマンド)」形式
      const displayName = move.move_name_en
        ? `${move.move_name} / ${move.move_name_en} (${move.move_notation})`
        : `${move.move_name} (${move.move_notation})`;

      return {
        name: displayName,
        value: move.move_notation
      };
    });
  }

  // 技をバルク登録（複数一括）
  static async bulkCreate(
    characterName: string,
    moves: Array<{ moveName: string; moveNotation: string; moveType?: string | null; moveNameEn?: string | null }>
  ): Promise<void> {
    const db = getDatabase();

    const character = await CharacterModel.getByName(characterName);
    if (!character) {
      throw new Error(`Character not found: ${characterName}`);
    }

    for (const move of moves) {
      await db.execute({
        sql: `
          INSERT INTO character_moves (character_id, move_name, move_name_en, move_notation, move_type)
          VALUES (?, ?, ?, ?, ?)
        `,
        args: [character.id, move.moveName, move.moveNameEn || null, move.moveNotation, move.moveType || null]
      });
    }
  }

  // 全技を削除（特定キャラ）
  static async deleteByCharacter(characterName: string): Promise<boolean> {
    const db = getDatabase();

    const character = await CharacterModel.getByName(characterName);
    if (!character) {
      return false;
    }

    const result = await db.execute({
      sql: 'DELETE FROM character_moves WHERE character_id = ?',
      args: [character.id]
    });

    return result.rowsAffected > 0;
  }

  // 技をID指定で取得
  static async getById(id: number): Promise<CharacterMove | null> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'SELECT * FROM character_moves WHERE id = ?',
      args: [id]
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as unknown as CharacterMove;
  }

  // 技を更新
  static async update(
    id: number,
    moveName?: string,
    moveNotation?: string,
    moveType?: string | null,
    moveNameEn?: string | null
  ): Promise<boolean> {
    const db = getDatabase();

    // 既存の技を取得
    const existing = await this.getById(id);
    if (!existing) {
      return false;
    }

    // 更新するフィールドを決定
    const finalMoveName = moveName !== undefined ? moveName : existing.move_name;
    const finalMoveNameEn = moveNameEn !== undefined ? moveNameEn : existing.move_name_en;
    const finalMoveNotation = moveNotation !== undefined ? moveNotation : existing.move_notation;
    const finalMoveType = moveType !== undefined ? moveType : existing.move_type;

    const result = await db.execute({
      sql: `
        UPDATE character_moves
        SET move_name = ?, move_name_en = ?, move_notation = ?, move_type = ?
        WHERE id = ?
      `,
      args: [finalMoveName, finalMoveNameEn, finalMoveNotation, finalMoveType, id]
    });

    return result.rowsAffected > 0;
  }

  // 技を削除
  static async delete(id: number): Promise<boolean> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'DELETE FROM character_moves WHERE id = ?',
      args: [id]
    });

    return result.rowsAffected > 0;
  }
}
