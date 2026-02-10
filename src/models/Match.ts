import { getDatabase } from '../database';
import { Match } from '../types';
import { CharacterModel } from './Character';

export class MatchModel {
  // 対戦記録を作成
  static async create(
    userDiscordId: string,
    myCharacterName: string | null,
    opponentCharacterName: string,
    result: 'win' | 'loss' | null,
    note?: string,
    defeatReasonId?: number | null,
    priority?: 'critical' | 'important' | 'recommended' | null,
    defeatReasonType?: 'common' | 'user' | null
  ): Promise<Match> {
    const db = getDatabase();

    // キャラ名からIDを取得
    let myCharId: number | null = null;
    if (myCharacterName) {
      const myChar = await CharacterModel.getByName(myCharacterName);
      if (myChar) {
        myCharId = myChar.id;
      }
    }

    const opponentChar = await CharacterModel.getByName(opponentCharacterName);
    if (!opponentChar) {
      throw new Error(`Opponent character not found: ${opponentCharacterName}`);
    }

    // 新旧両方のカラムに挿入（後方互換性のため）
    const insertResult = await db.execute({
      sql: `
        INSERT INTO matches (
          user_discord_id,
          my_character, my_character_id,
          opponent_character, opponent_character_id,
          result,
          defeat_reason_id,
          defeat_reason_type,
          priority,
          note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        userDiscordId,
        myCharacterName, myCharId,
        opponentCharacterName, opponentChar.id,
        result,
        defeatReasonId || null,
        defeatReasonType || null,
        priority || null,
        note || null
      ]
    });

    const selectResult = await db.execute({
      sql: 'SELECT * FROM matches WHERE id = ?',
      args: [Number(insertResult.lastInsertRowid)]
    });

    return selectResult.rows[0] as unknown as Match;
  }

  // ユーザーの全対戦記録を取得
  static async getByUser(
    userDiscordId: string,
    limit?: number,
    opponentCharacterFilter?: string,
    myCharacterFilter?: string,
    period?: '1day' | '1week' | '1month' | 'all'
  ): Promise<Match[]> {
    const db = getDatabase();

    let query = 'SELECT * FROM matches WHERE user_discord_id = ?';
    const params: any[] = [userDiscordId];

    // 期間フィルター
    if (period && period !== 'all') {
      const daysMap = { '1day': 1, '1week': 7, '1month': 30 };
      const days = daysMap[period];
      query += ` AND match_date >= datetime('now', '-${days} days')`;
    }

    // フィルタがある場合は、まずキャラ名からIDを取得してID列でフィルタ（高速化）
    if (opponentCharacterFilter) {
      const opponentChar = await CharacterModel.getByName(opponentCharacterFilter);
      if (opponentChar) {
        query += ' AND opponent_character_id = ?';
        params.push(opponentChar.id);
      } else {
        // キャラが見つからない場合は旧カラムでフォールバック
        query += ' AND opponent_character = ?';
        params.push(opponentCharacterFilter);
      }
    }

    if (myCharacterFilter) {
      const myChar = await CharacterModel.getByName(myCharacterFilter);
      if (myChar) {
        query += ' AND my_character_id = ?';
        params.push(myChar.id);
      } else {
        // キャラが見つからない場合は旧カラムでフォールバック
        query += ' AND my_character = ?';
        params.push(myCharacterFilter);
      }
    }

    query += ' ORDER BY match_date DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const result = await db.execute({
      sql: query,
      args: params
    });

    return result.rows as unknown as Match[];
  }

  // 特定キャラとの対戦成績を取得
  static async getStats(
    userDiscordId: string,
    opponentCharacterName?: string,
    myCharacterName?: string,
    period?: '1day' | '1week' | '1month' | 'all'
  ): Promise<{
    total: number;
    wins: number;
    losses: number;
  }> {
    const db = getDatabase();

    let query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as losses
      FROM matches
      WHERE user_discord_id = ?
    `;
    const params: any[] = [userDiscordId];

    // 期間フィルター
    if (period && period !== 'all') {
      const daysMap = { '1day': 1, '1week': 7, '1month': 30 };
      const days = daysMap[period];
      query += ` AND match_date >= datetime('now', '-${days} days')`;
    }

    // キャラ名からIDに変換してフィルタ
    if (opponentCharacterName) {
      const opponentChar = await CharacterModel.getByName(opponentCharacterName);
      if (opponentChar) {
        query += ' AND opponent_character_id = ?';
        params.push(opponentChar.id);
      } else {
        query += ' AND opponent_character = ?';
        params.push(opponentCharacterName);
      }
    }

    if (myCharacterName) {
      const myChar = await CharacterModel.getByName(myCharacterName);
      if (myChar) {
        query += ' AND my_character_id = ?';
        params.push(myChar.id);
      } else {
        query += ' AND my_character = ?';
        params.push(myCharacterName);
      }
    }

    const result = await db.execute({
      sql: query,
      args: params
    });

    return result.rows[0] as unknown as {
      total: number;
      wins: number;
      losses: number;
    };
  }

  // キャラクター別の成績を取得
  static async getStatsByCharacter(
    userDiscordId: string,
    period?: '1day' | '1week' | '1month' | 'all'
  ): Promise<Array<{
    character: string;
    total: number;
    wins: number;
    losses: number;
    winRate: number;
  }>> {
    const db = getDatabase();

    // 期間フィルターの条件を構築
    let whereClause = 'WHERE m.user_discord_id = ?';
    if (period && period !== 'all') {
      const daysMap = { '1day': 1, '1week': 7, '1month': 30 };
      const days = daysMap[period];
      whereClause += ` AND m.match_date >= datetime('now', '-${days} days')`;
    }

    // キャラクターIDでグループ化し、charactersテーブルとJOIN
    const result = await db.execute({
      sql: `
        SELECT
          COALESCE(c.name, m.opponent_character) as character,
          COUNT(*) as total,
          SUM(CASE WHEN m.result = 'win' THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN m.result = 'loss' THEN 1 ELSE 0 END) as losses
        FROM matches m
        LEFT JOIN characters c ON m.opponent_character_id = c.id
        ${whereClause}
        GROUP BY COALESCE(m.opponent_character_id, m.opponent_character)
        ORDER BY total DESC
      `,
      args: [userDiscordId]
    });

    const results = result.rows as unknown as Array<{
      character: string;
      total: number;
      wins: number;
      losses: number;
    }>;

    return results.map(r => ({
      ...r,
      winRate: r.total > 0 ? (r.wins / r.total) * 100 : 0
    }));
  }

  // 特定キャラとの敗因トップ3を取得
  static async getDefeatReasonStats(
    userDiscordId: string,
    opponentCharacterName?: string,
    myCharacterName?: string,
    period?: '1day' | '1week' | '1month' | 'all'
  ): Promise<Array<{
    defeat_reason_id: number;
    defeat_reason_type: 'common' | 'user';
    count: number;
  }>> {
    const db = getDatabase();

    let query = `
      SELECT defeat_reason_id, defeat_reason_type, COUNT(*) as count
      FROM matches
      WHERE user_discord_id = ? AND result = 'loss' AND defeat_reason_id IS NOT NULL
    `;
    const params: any[] = [userDiscordId];

    // 期間フィルター
    if (period && period !== 'all') {
      const daysMap = { '1day': 1, '1week': 7, '1month': 30 };
      const days = daysMap[period];
      query += ` AND match_date >= datetime('now', '-${days} days')`;
    }

    if (opponentCharacterName) {
      const opponentChar = await CharacterModel.getByName(opponentCharacterName);
      if (opponentChar) {
        query += ' AND opponent_character_id = ?';
        params.push(opponentChar.id);
      } else {
        query += ' AND opponent_character = ?';
        params.push(opponentCharacterName);
      }
    }

    if (myCharacterName) {
      const myChar = await CharacterModel.getByName(myCharacterName);
      if (myChar) {
        query += ' AND my_character_id = ?';
        params.push(myChar.id);
      } else {
        query += ' AND my_character = ?';
        params.push(myCharacterName);
      }
    }

    query += ' GROUP BY defeat_reason_id, defeat_reason_type ORDER BY count DESC LIMIT 3';

    const result = await db.execute({
      sql: query,
      args: params
    });

    return result.rows as unknown as Array<{
      defeat_reason_id: number;
      defeat_reason_type: 'common' | 'user';
      count: number;
    }>;
  }

  // 優先度フィルタ付きで対戦記録を取得
  static async getByUserWithPriority(
    userDiscordId: string,
    opponentCharacterFilter?: string,
    myCharacterFilter?: string,
    priorityFilter?: 'critical' | 'important' | 'recommended'
  ): Promise<Match[]> {
    const db = getDatabase();

    let query = 'SELECT * FROM matches WHERE user_discord_id = ?';
    const params: any[] = [userDiscordId];

    if (opponentCharacterFilter) {
      const opponentChar = await CharacterModel.getByName(opponentCharacterFilter);
      if (opponentChar) {
        query += ' AND opponent_character_id = ?';
        params.push(opponentChar.id);
      } else {
        query += ' AND opponent_character = ?';
        params.push(opponentCharacterFilter);
      }
    }

    if (myCharacterFilter) {
      const myChar = await CharacterModel.getByName(myCharacterFilter);
      if (myChar) {
        query += ' AND my_character_id = ?';
        params.push(myChar.id);
      } else {
        query += ' AND my_character = ?';
        params.push(myCharacterFilter);
      }
    }

    if (priorityFilter) {
      query += ' AND priority = ?';
      params.push(priorityFilter);
    }

    query += ' ORDER BY match_date DESC';

    const result = await db.execute({
      sql: query,
      args: params
    });

    return result.rows as unknown as Match[];
  }
}
