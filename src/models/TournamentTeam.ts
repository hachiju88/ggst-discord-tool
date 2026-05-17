import { getDatabase } from '../database'

export interface TournamentTeam {
  id: number
  tournament_id: number
  name: string
  team_order: number
  announcement_message_id: string | null
  created_at: string
}

export class TournamentTeamModel {
  static async create(data: {
    tournament_id: number
    name: string
    team_order?: number
  }): Promise<TournamentTeam> {
    const db = getDatabase()
    const result = await db.execute({
      sql: 'INSERT INTO tournament_teams (tournament_id, name, team_order) VALUES (?, ?, ?)',
      args: [data.tournament_id, data.name, data.team_order ?? 0],
    })
    return (await this.getById(Number(result.lastInsertRowid)))!
  }

  static async getById(id: number): Promise<TournamentTeam | null> {
    const db = getDatabase()
    const r = await db.execute({ sql: 'SELECT * FROM tournament_teams WHERE id = ?', args: [id] })
    return (r.rows[0] as unknown as TournamentTeam) ?? null
  }

  static async getByTournament(tournamentId: number): Promise<TournamentTeam[]> {
    const db = getDatabase()
    const r = await db.execute({
      sql: 'SELECT * FROM tournament_teams WHERE tournament_id = ? ORDER BY team_order, id',
      args: [tournamentId],
    })
    return r.rows as unknown as TournamentTeam[]
  }

  static async getByName(tournamentId: number, name: string): Promise<TournamentTeam | null> {
    const db = getDatabase()
    const r = await db.execute({
      sql: 'SELECT * FROM tournament_teams WHERE tournament_id = ? AND name = ?',
      args: [tournamentId, name],
    })
    return (r.rows[0] as unknown as TournamentTeam) ?? null
  }

  static async setAnnouncementMessageId(id: number, messageId: string): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: 'UPDATE tournament_teams SET announcement_message_id = ? WHERE id = ?',
      args: [messageId, id],
    })
  }

  static async delete(id: number): Promise<void> {
    const db = getDatabase()
    await db.execute({ sql: 'DELETE FROM tournament_teams WHERE id = ?', args: [id] })
  }
}
