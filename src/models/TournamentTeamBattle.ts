import { getDatabase } from '../database'

export interface TournamentTeamBattle {
  id: number
  match_id: number
  battle_order: number
  match_code: string | null
  team1_member_id: number | null
  team2_member_id: number | null
  winner_member_id: number | null
  winner_team_id: number | null
  team1_games_won: number
  team2_games_won: number
  handicap_member_id: number | null
  handicap_rounds: number
  status: string
  message_id: string | null
  created_at: string
  updated_at: string
}

export class TournamentTeamBattleModel {
  static async create(data: {
    match_id: number
    battle_order: number
    match_code?: string | null
    team1_member_id: number | null
    team2_member_id: number | null
    handicap_member_id?: number | null
    handicap_rounds?: number
  }): Promise<TournamentTeamBattle> {
    const db = getDatabase()
    const result = await db.execute({
      sql: `INSERT INTO tournament_team_battles
              (match_id, battle_order, match_code, team1_member_id, team2_member_id,
               handicap_member_id, handicap_rounds, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      args: [
        data.match_id,
        data.battle_order,
        data.match_code ?? null,
        data.team1_member_id,
        data.team2_member_id,
        data.handicap_member_id ?? null,
        data.handicap_rounds ?? 0,
      ],
    })
    return (await this.getById(Number(result.lastInsertRowid)))!
  }

  static async getById(id: number): Promise<TournamentTeamBattle | null> {
    const db = getDatabase()
    const r = await db.execute({
      sql: 'SELECT * FROM tournament_team_battles WHERE id = ?',
      args: [id],
    })
    return (r.rows[0] as unknown as TournamentTeamBattle) ?? null
  }

  static async getByMatch(matchId: number): Promise<TournamentTeamBattle[]> {
    const db = getDatabase()
    const r = await db.execute({
      sql: 'SELECT * FROM tournament_team_battles WHERE match_id = ? ORDER BY battle_order',
      args: [matchId],
    })
    return r.rows as unknown as TournamentTeamBattle[]
  }

  static async setWinner(
    id: number,
    winnerMemberId: number,
    winnerTeamId: number,
    t1Games: number,
    t2Games: number
  ): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: `UPDATE tournament_team_battles
            SET winner_member_id = ?, winner_team_id = ?,
                team1_games_won = ?, team2_games_won = ?,
                status = 'completed', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [winnerMemberId, winnerTeamId, t1Games, t2Games, id],
    })
  }

  static async setMessageId(id: number, messageId: string): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: 'UPDATE tournament_team_battles SET message_id = ? WHERE id = ?',
      args: [messageId, id],
    })
  }
}
