import { getDatabase } from '../database'

export const POSITION_NAMES = ['先鋒', '次鋒', '中堅', '副将', '大将']

// position 値からラベル文字列を返す。null は「未配置」、範囲外は「N番」
export function positionLabel(position: number | null | undefined): string {
  if (position == null) return '未配置'
  return POSITION_NAMES[position - 1] ?? `${position}番`
}

// チーム規模ごとの正規ポジション構成
// 1人: 大将 / 2人: 先鋒・大将 / 3人: 先鋒・中堅・大将
// 4人: 先鋒・次鋒・中堅・大将 / 5人: 先鋒・次鋒・中堅・副将・大将
export const POSITIONS_BY_TEAM_SIZE: Readonly<Record<number, readonly number[]>> = {
  1: [5],
  2: [1, 5],
  3: [1, 3, 5],
  4: [1, 2, 3, 5],
  5: [1, 2, 3, 4, 5],
}

export function getPositionsForTeamSize(size: number): readonly number[] {
  if (size < 1) return []
  return POSITIONS_BY_TEAM_SIZE[Math.min(size, 5)] ?? []
}

// 既存配置を尊重しつつ、新規参加者のための次の空きスキーマスロットを返す。
// スキーマに空きが無い場合は 1〜5 の中の任意の空きにフォールバック。
export function nextSchemaSlot(
  occupiedPositions: (number | null | undefined)[],
  newSize: number
): number | null {
  const occupied = new Set(occupiedPositions.filter((p): p is number => p != null))
  const schema = getPositionsForTeamSize(newSize)
  const fromSchema = schema.find(p => !occupied.has(p))
  if (fromSchema != null) return fromSchema
  for (let p = 1; p <= 5; p++) {
    if (!occupied.has(p)) return p
  }
  return null
}

export interface TournamentTeamMember {
  id: number
  team_id: number
  discord_id: string
  discord_name: string
  rank: string | null
  character: string | null
  position: number | null  // 1=先鋒 … 5=大将
  is_captain: number
  created_at: string
}

export class TournamentTeamMemberModel {
  static async create(data: {
    team_id: number
    discord_id: string
    discord_name: string
    rank?: string | null
    character?: string | null
    position?: number | null
    is_captain?: boolean
  }): Promise<TournamentTeamMember> {
    const db = getDatabase()
    const result = await db.execute({
      sql: `INSERT INTO tournament_team_members
              (team_id, discord_id, discord_name, rank, character, position, is_captain)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        data.team_id,
        data.discord_id,
        data.discord_name,
        data.rank ?? null,
        data.character ?? null,
        data.position ?? null,
        data.is_captain ? 1 : 0,
      ],
    })
    return (await this.getById(Number(result.lastInsertRowid)))!
  }

  static async getById(id: number): Promise<TournamentTeamMember | null> {
    const db = getDatabase()
    const r = await db.execute({ sql: 'SELECT * FROM tournament_team_members WHERE id = ?', args: [id] })
    return (r.rows[0] as unknown as TournamentTeamMember) ?? null
  }

  static async getByTeam(teamId: number): Promise<TournamentTeamMember[]> {
    const db = getDatabase()
    const r = await db.execute({
      sql: 'SELECT * FROM tournament_team_members WHERE team_id = ? ORDER BY position, id',
      args: [teamId],
    })
    return r.rows as unknown as TournamentTeamMember[]
  }

  static async getByDiscordId(teamId: number, discordId: string): Promise<TournamentTeamMember | null> {
    const db = getDatabase()
    const r = await db.execute({
      sql: 'SELECT * FROM tournament_team_members WHERE team_id = ? AND discord_id = ?',
      args: [teamId, discordId],
    })
    return (r.rows[0] as unknown as TournamentTeamMember) ?? null
  }

  // 同一チーム内で同じユーザーが複数ポジションを持ちうるため、全行を返す
  static async getAllByDiscordId(teamId: number, discordId: string): Promise<TournamentTeamMember[]> {
    const db = getDatabase()
    const r = await db.execute({
      sql: 'SELECT * FROM tournament_team_members WHERE team_id = ? AND discord_id = ? ORDER BY position, id',
      args: [teamId, discordId],
    })
    return r.rows as unknown as TournamentTeamMember[]
  }

  // 大会内に同じDiscordユーザーが既にいるか確認
  static async getByDiscordIdInTournament(
    tournamentId: number,
    discordId: string
  ): Promise<TournamentTeamMember | null> {
    const db = getDatabase()
    const r = await db.execute({
      sql: `SELECT tm.* FROM tournament_team_members tm
            JOIN tournament_teams t ON tm.team_id = t.id
            WHERE t.tournament_id = ? AND tm.discord_id = ?`,
      args: [tournamentId, discordId],
    })
    return (r.rows[0] as unknown as TournamentTeamMember) ?? null
  }

  static async getByTournament(
    tournamentId: number
  ): Promise<(TournamentTeamMember & { team_name: string })[]> {
    const db = getDatabase()
    const r = await db.execute({
      sql: `SELECT tm.*, t.name AS team_name
            FROM tournament_team_members tm
            JOIN tournament_teams t ON tm.team_id = t.id
            WHERE t.tournament_id = ?
            ORDER BY t.team_order, t.id, tm.position, tm.id`,
      args: [tournamentId],
    })
    return r.rows as unknown as (TournamentTeamMember & { team_name: string })[]
  }

  static async setPosition(id: number, position: number | null): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: 'UPDATE tournament_team_members SET position = ? WHERE id = ?',
      args: [position, id],
    })
  }

  static async setCharacter(id: number, character: string | null): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: 'UPDATE tournament_team_members SET character = ? WHERE id = ?',
      args: [character, id],
    })
  }

  static async setRank(id: number, rank: string | null): Promise<void> {
    const db = getDatabase()
    await db.execute({
      sql: 'UPDATE tournament_team_members SET rank = ? WHERE id = ?',
      args: [rank, id],
    })
  }

  static async delete(id: number): Promise<void> {
    const db = getDatabase()
    // SQLite は FK 強制が既定 OFF のため、battle 参照を手動で NULL に
    await db.execute({
      sql: 'UPDATE tournament_team_battles SET team1_member_id = NULL WHERE team1_member_id = ?',
      args: [id],
    })
    await db.execute({
      sql: 'UPDATE tournament_team_battles SET team2_member_id = NULL WHERE team2_member_id = ?',
      args: [id],
    })
    await db.execute({
      sql: 'UPDATE tournament_team_battles SET winner_member_id = NULL WHERE winner_member_id = ?',
      args: [id],
    })
    await db.execute({
      sql: 'UPDATE tournament_team_battles SET handicap_member_id = NULL WHERE handicap_member_id = ?',
      args: [id],
    })
    await db.execute({ sql: 'DELETE FROM tournament_team_members WHERE id = ?', args: [id] })
  }

  static async countByTeam(teamId: number): Promise<number> {
    const db = getDatabase()
    const r = await db.execute({
      sql: 'SELECT COUNT(*) as cnt FROM tournament_team_members WHERE team_id = ?',
      args: [teamId],
    })
    return Number((r.rows[0] as any).cnt)
  }
}
