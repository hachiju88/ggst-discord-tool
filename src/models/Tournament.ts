import { getDatabase } from '../database'

export interface HandicapRule {
  minRankDiff: number
  rounds: number
}

export interface TournamentRegulation {
  winsRequired: number
  roundsRequired: number
  handicapRules: HandicapRule[]
}

export interface Tournament {
  id: number
  guild_id: string
  name: string
  format: string
  type: string
  max_participants: number | null
  status: 'registration' | 'in_progress' | 'completed'
  regulation: string
  created_by: string
  channel_id: string | null
  announcement_message_id: string | null
  created_at: string
  updated_at: string
}

export class TournamentModel {
  static async create(data: {
    guild_id: string
    name: string
    format: string
    max_participants: number | null
    regulation: TournamentRegulation
    created_by: string
    channel_id: string | null
  }): Promise<Tournament> {
    const db = getDatabase()
    const result = await db.execute({
      sql: `INSERT INTO tournaments (guild_id, name, format, max_participants, regulation, created_by, channel_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        data.guild_id,
        data.name,
        data.format,
        data.max_participants,
        JSON.stringify(data.regulation),
        data.created_by,
        data.channel_id,
      ],
    })
    return (await this.getById(Number(result.lastInsertRowid)))!
  }

  static async getById(id: number): Promise<Tournament | null> {
    const db = getDatabase()
    const result = await db.execute({
      sql: 'SELECT * FROM tournaments WHERE id = ?',
      args: [id],
    })
    return result.rows.length > 0 ? (result.rows[0] as unknown as Tournament) : null
  }

  static async getByGuild(guildId: string): Promise<Tournament[]> {
    const db = getDatabase()
    const result = await db.execute({
      sql: 'SELECT * FROM tournaments WHERE guild_id = ? ORDER BY created_at DESC',
      args: [guildId],
    })
    return result.rows as unknown as Tournament[]
  }

  static async getLatestActive(guildId: string): Promise<Tournament | null> {
    const db = getDatabase()
    const result = await db.execute({
      sql: `SELECT * FROM tournaments WHERE guild_id = ? AND status != 'completed'
            ORDER BY created_at DESC LIMIT 1`,
      args: [guildId],
    })
    return result.rows.length > 0 ? (result.rows[0] as unknown as Tournament) : null
  }

  static async setStatus(id: number, status: Tournament['status']): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: `UPDATE tournaments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [status, id],
    })
  }

  static async setAnnouncementMessage(id: number, channelId: string, messageId: string): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: `UPDATE tournaments SET channel_id = ?, announcement_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [channelId, messageId, id],
    })
  }

  static async delete(id: number): Promise<boolean> {
    const db = getDatabase()
    const result = await db.execute({
      sql: 'DELETE FROM tournaments WHERE id = ?',
      args: [id],
    })
    return result.rowsAffected > 0
  }
}
