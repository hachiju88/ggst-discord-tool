import { getDatabase } from '../database';

export interface CommonMove {
  id: number;
  move_name: string;
  move_name_en: string | null;
  move_notation: string;
  move_type: string | null;
  display_order: number;
  created_at: string;
}

export class CommonMoveModel {
  /**
   * 全ての共通技を取得
   */
  static async getAll(): Promise<CommonMove[]> {
    const db = getDatabase();
    const result = await db.execute(
      'SELECT * FROM common_moves ORDER BY display_order, id'
    );
    return result.rows as unknown as CommonMove[];
  }

  /**
   * IDで共通技を取得
   */
  static async getById(id: number): Promise<CommonMove | null> {
    const db = getDatabase();
    const result = await db.execute({
      sql: 'SELECT * FROM common_moves WHERE id = ?',
      args: [id]
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as unknown as CommonMove;
  }

  /**
   * move_notationで共通技を取得
   */
  static async getByNotation(notation: string): Promise<CommonMove | null> {
    const db = getDatabase();
    const result = await db.execute({
      sql: 'SELECT * FROM common_moves WHERE move_notation = ?',
      args: [notation]
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as unknown as CommonMove;
  }

  /**
   * 共通技を作成
   */
  static async create(
    moveName: string,
    moveNotation: string,
    moveNameEn?: string,
    moveType?: string,
    displayOrder?: number
  ): Promise<void> {
    const db = getDatabase();
    await db.execute({
      sql: `INSERT INTO common_moves (move_name, move_name_en, move_notation, move_type, display_order)
            VALUES (?, ?, ?, ?, ?)`,
      args: [moveName, moveNameEn || null, moveNotation, moveType || null, displayOrder || 0]
    });
  }

  /**
   * 共通技を更新
   */
  static async update(
    id: number,
    moveName?: string,
    moveNotation?: string,
    moveNameEn?: string,
    moveType?: string
  ): Promise<boolean> {
    const db = getDatabase();
    const updates: string[] = [];
    const args: any[] = [];

    if (moveName !== undefined) {
      updates.push('move_name = ?');
      args.push(moveName);
    }
    if (moveNotation !== undefined) {
      updates.push('move_notation = ?');
      args.push(moveNotation);
    }
    if (moveNameEn !== undefined) {
      updates.push('move_name_en = ?');
      args.push(moveNameEn);
    }
    if (moveType !== undefined) {
      updates.push('move_type = ?');
      args.push(moveType);
    }

    if (updates.length === 0) {
      return false;
    }

    args.push(id);

    const result = await db.execute({
      sql: `UPDATE common_moves SET ${updates.join(', ')} WHERE id = ?`,
      args
    });

    return result.rowsAffected > 0;
  }

  /**
   * 共通技を削除
   */
  static async delete(id: number): Promise<boolean> {
    const db = getDatabase();
    const result = await db.execute({
      sql: 'DELETE FROM common_moves WHERE id = ?',
      args: [id]
    });

    return result.rowsAffected > 0;
  }
}
