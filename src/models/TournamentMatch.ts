import { getDatabase } from '../database'

export interface TournamentMatch {
  id: number
  tournament_id: number
  round: number
  match_number: number
  match_code: string | null
  participant1_id: number | null
  participant2_id: number | null
  winner_id: number | null
  handicap_participant_id: number | null
  handicap_rounds: number
  vc_channel_id: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'bye'
  message_id: string | null
  created_at: string
  updated_at: string
}

export interface MatchWithParticipants extends TournamentMatch {
  p1_discord_id: string | null
  p1_name: string | null
  p1_rank: string | null
  p2_discord_id: string | null
  p2_name: string | null
  p2_rank: string | null
  winner_discord_id: string | null
  winner_name: string | null
  handicap_player_name: string | null
  handicap_player_discord_id: string | null
}

const WITH_PARTICIPANTS_SQL = `
  SELECT m.*,
    p1.discord_id as p1_discord_id, p1.discord_name as p1_name, p1.rank as p1_rank,
    p2.discord_id as p2_discord_id, p2.discord_name as p2_name, p2.rank as p2_rank,
    w.discord_id as winner_discord_id, w.discord_name as winner_name,
    hp.discord_name as handicap_player_name, hp.discord_id as handicap_player_discord_id
  FROM tournament_matches m
  LEFT JOIN tournament_participants p1 ON m.participant1_id = p1.id
  LEFT JOIN tournament_participants p2 ON m.participant2_id = p2.id
  LEFT JOIN tournament_participants w ON m.winner_id = w.id
  LEFT JOIN tournament_participants hp ON m.handicap_participant_id = hp.id
`

export class TournamentMatchModel {
  static async create(data: {
    tournament_id: number
    round: number
    match_number: number
    match_code: string | null
    participant1_id: number | null
    participant2_id: number | null
    winner_id: number | null
    handicap_participant_id: number | null
    handicap_rounds: number
    vc_channel_id: string | null
    status: TournamentMatch['status']
  }): Promise<TournamentMatch> {
    const db = getDatabase()
    const result = await db.execute({
      sql: `INSERT INTO tournament_matches
              (tournament_id, round, match_number, match_code, participant1_id, participant2_id,
               winner_id, handicap_participant_id, handicap_rounds, vc_channel_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        data.tournament_id,
        data.round,
        data.match_number,
        data.match_code,
        data.participant1_id,
        data.participant2_id,
        data.winner_id,
        data.handicap_participant_id,
        data.handicap_rounds,
        data.vc_channel_id,
        data.status,
      ],
    })
    return (await this.getById(Number(result.lastInsertRowid)))!
  }

  static async getById(id: number): Promise<TournamentMatch | null> {
    const db = getDatabase()
    const result = await db.execute({
      sql: 'SELECT * FROM tournament_matches WHERE id = ?',
      args: [id],
    })
    return result.rows.length > 0 ? (result.rows[0] as unknown as TournamentMatch) : null
  }

  static async getWithParticipants(id: number): Promise<MatchWithParticipants | null> {
    const db = getDatabase()
    const result = await db.execute({
      sql: `${WITH_PARTICIPANTS_SQL} WHERE m.id = ?`,
      args: [id],
    })
    return result.rows.length > 0 ? (result.rows[0] as unknown as MatchWithParticipants) : null
  }

  static async getByTournament(tournamentId: number): Promise<TournamentMatch[]> {
    const db = getDatabase()
    const result = await db.execute({
      sql: 'SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY round, match_number',
      args: [tournamentId],
    })
    return result.rows as unknown as TournamentMatch[]
  }

  static async getByTournamentWithParticipants(tournamentId: number): Promise<MatchWithParticipants[]> {
    const db = getDatabase()
    const result = await db.execute({
      sql: `${WITH_PARTICIPANTS_SQL} WHERE m.tournament_id = ? ORDER BY m.round, m.match_number`,
      args: [tournamentId],
    })
    return result.rows as unknown as MatchWithParticipants[]
  }

  static async getByRound(tournamentId: number, round: number): Promise<TournamentMatch[]> {
    const db = getDatabase()
    const result = await db.execute({
      sql: 'SELECT * FROM tournament_matches WHERE tournament_id = ? AND round = ? ORDER BY match_number',
      args: [tournamentId, round],
    })
    return result.rows as unknown as TournamentMatch[]
  }

  static async setWinner(id: number, winnerId: number): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: `UPDATE tournament_matches SET winner_id = ?, status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [winnerId, id],
    })
  }

  static async changeWinner(id: number, newWinnerId: number): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: `UPDATE tournament_matches SET winner_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [newWinnerId, id],
    })
  }

  static async setParticipant(id: number, participantId: number, slot: 'p1' | 'p2'): Promise<void> {
    const db = getDatabase()
    const col = slot === 'p1' ? 'participant1_id' : 'participant2_id'
    await db.execute({
      sql: `UPDATE tournament_matches SET ${col} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [participantId, id],
    })
  }

  static async setHandicap(id: number, handicapParticipantId: number | null, rounds: number): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: `UPDATE tournament_matches SET handicap_participant_id = ?, handicap_rounds = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [handicapParticipantId, rounds, id],
    })
  }

  static async setMatchCode(id: number, code: string): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: `UPDATE tournament_matches SET match_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [code, id],
    })
  }

  static async setVcChannel(id: number, vcChannelId: string): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: `UPDATE tournament_matches SET vc_channel_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [vcChannelId, id],
    })
  }

  static async setMessageId(id: number, messageId: string): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: `UPDATE tournament_matches SET message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      args: [messageId, id],
    })
  }
}
