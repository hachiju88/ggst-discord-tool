import { getDatabase } from '../database'

export interface TournamentParticipant {
  id: number
  tournament_id: number
  discord_id: string
  discord_name: string
  rank: string | null
  seed: number | null
  status: 'active' | 'eliminated'
  created_at: string
}

export class TournamentParticipantModel {
  static async create(data: {
    tournament_id: number
    discord_id: string
    discord_name: string
    rank: string | null
  }): Promise<TournamentParticipant> {
    const db = getDatabase()
    const result = await db.execute({
      sql: `INSERT INTO tournament_participants (tournament_id, discord_id, discord_name, rank)
            VALUES (?, ?, ?, ?)`,
      args: [data.tournament_id, data.discord_id, data.discord_name, data.rank],
    })
    return (await this.getById(Number(result.lastInsertRowid)))!
  }

  static async getById(id: number): Promise<TournamentParticipant | null> {
    const db = getDatabase()
    const result = await db.execute({
      sql: 'SELECT * FROM tournament_participants WHERE id = ?',
      args: [id],
    })
    return result.rows.length > 0 ? (result.rows[0] as unknown as TournamentParticipant) : null
  }

  static async getByTournament(tournamentId: number): Promise<TournamentParticipant[]> {
    const db = getDatabase()
    const result = await db.execute({
      sql: 'SELECT * FROM tournament_participants WHERE tournament_id = ? ORDER BY created_at ASC',
      args: [tournamentId],
    })
    return result.rows as unknown as TournamentParticipant[]
  }

  static async getByDiscordId(tournamentId: number, discordId: string): Promise<TournamentParticipant | null> {
    const db = getDatabase()
    const result = await db.execute({
      sql: 'SELECT * FROM tournament_participants WHERE tournament_id = ? AND discord_id = ?',
      args: [tournamentId, discordId],
    })
    return result.rows.length > 0 ? (result.rows[0] as unknown as TournamentParticipant) : null
  }

  static async eliminate(id: number): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: `UPDATE tournament_participants SET status = 'eliminated' WHERE id = ?`,
      args: [id],
    })
  }

  static async restore(id: number): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: `UPDATE tournament_participants SET status = 'active' WHERE id = ?`,
      args: [id],
    })
  }

  static async delete(id: number): Promise<boolean> {
    const db = getDatabase()
    const result = await db.execute({
      sql: 'DELETE FROM tournament_participants WHERE id = ?',
      args: [id],
    })
    return result.rowsAffected > 0
  }

  static async count(tournamentId: number): Promise<number> {
    const db = getDatabase()
    const result = await db.execute({
      sql: 'SELECT COUNT(*) as cnt FROM tournament_participants WHERE tournament_id = ?',
      args: [tournamentId],
    })
    return Number(result.rows[0]?.['cnt'] ?? 0)
  }
}
