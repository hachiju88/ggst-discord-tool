import { getDatabase } from '../database';
import { DefeatReason, CommonDefeatReason } from '../types';

export class DefeatReasonModel {
  // ===================================
  // 共通敗因（マスタデータ）
  // ===================================

  // 全共通敗因取得
  static async getAllCommon(): Promise<CommonDefeatReason[]> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'SELECT * FROM common_defeat_reasons ORDER BY display_order ASC',
      args: []
    });

    return result.rows as unknown as CommonDefeatReason[];
  }

  // ID指定で共通敗因取得
  static async getCommonById(id: number): Promise<CommonDefeatReason | null> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'SELECT * FROM common_defeat_reasons WHERE id = ?',
      args: [id]
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as unknown as CommonDefeatReason;
  }

  // ===================================
  // ユーザー独自敗因
  // ===================================

  // ユーザーの全敗因取得
  static async getByUser(userDiscordId: string): Promise<DefeatReason[]> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'SELECT * FROM defeat_reasons WHERE user_discord_id = ? ORDER BY created_at DESC',
      args: [userDiscordId]
    });

    return result.rows as unknown as DefeatReason[];
  }

  // 敗因追加
  static async create(userDiscordId: string, reason: string): Promise<DefeatReason> {
    const db = getDatabase();

    const insertResult = await db.execute({
      sql: 'INSERT INTO defeat_reasons (user_discord_id, reason) VALUES (?, ?)',
      args: [userDiscordId, reason]
    });

    const selectResult = await db.execute({
      sql: 'SELECT * FROM defeat_reasons WHERE id = ?',
      args: [Number(insertResult.lastInsertRowid)]
    });

    return selectResult.rows[0] as unknown as DefeatReason;
  }

  // ID指定で敗因取得
  static async getById(id: number): Promise<DefeatReason | null> {
    const db = getDatabase();

    const result = await db.execute({
      sql: 'SELECT * FROM defeat_reasons WHERE id = ?',
      args: [id]
    });

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as unknown as DefeatReason;
  }

  // ===================================
  // オートコンプリート用
  // ===================================

  // ユーザー用の敗因リスト（独自 + 共通）
  static async getReasonsForAutocomplete(userDiscordId: string): Promise<Array<{ name: string; value: string }>> {
    const commonReasons = await this.getAllCommon();
    const userReasons = await this.getByUser(userDiscordId);

    const result: Array<{ name: string; value: string }> = [];

    // ユーザー独自敗因を先に表示
    for (const reason of userReasons) {
      result.push({
        name: `[自分] ${reason.reason}`,
        value: `user:${reason.id}`
      });
    }

    // 共通敗因は後に表示
    for (const reason of commonReasons) {
      result.push({
        name: `[共通] ${reason.reason}`,
        value: `common:${reason.id}`
      });
    }

    return result;
  }

  // 敗因IDの解析（"common:1" or "user:5"）
  static parseReasonValue(value: string): { type: 'common' | 'user'; id: number } | null {
    const match = value.match(/^(common|user):(\d+)$/);
    if (!match) {
      return null;
    }

    return {
      type: match[1] as 'common' | 'user',
      id: parseInt(match[2], 10)
    };
  }

  // 敗因の表示名取得（共通 or ユーザー独自）
  static async getReasonDisplayName(reasonValue: string): Promise<string | null> {
    const parsed = this.parseReasonValue(reasonValue);
    if (!parsed) {
      return null;
    }

    if (parsed.type === 'common') {
      const reason = await this.getCommonById(parsed.id);
      return reason ? reason.reason : null;
    } else {
      const reason = await this.getById(parsed.id);
      return reason ? reason.reason : null;
    }
  }

  // IDとタイプから表示名を取得
  static async getReasonDisplayNameById(id: number, type: 'common' | 'user'): Promise<string | null> {
    if (type === 'common') {
      const reason = await this.getCommonById(id);
      return reason ? reason.reason : null;
    } else {
      const reason = await this.getById(id);
      return reason ? reason.reason : null;
    }
  }
}
