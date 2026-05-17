import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { TournamentModel, TournamentRegulation } from '../models/Tournament'
import { TournamentParticipant, TournamentParticipantModel } from '../models/TournamentParticipant'
import { TournamentMatch, TournamentMatchModel } from '../models/TournamentMatch'
import { BracketService } from './BracketService'
import { StandingsEntry } from './LeagueService'

export interface MatchContent {
  content: string
  components: ActionRowBuilder<ButtonBuilder>[]
}

function generateMatchCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function pairKey(id1: number, id2: number): string {
  return `${Math.min(id1, id2)}:${Math.max(id1, id2)}`
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Greedy Swiss pairing: pair players with similar records, avoid rematches.
// Returns pairs of participant IDs; null in pair means bye.
function buildPairings(
  sorted: StandingsEntry[],
  playedPairs: Set<string>
): Array<[number, number | null]> {
  const result: Array<[number, number | null]> = []
  const used = new Set<number>()

  for (let i = 0; i < sorted.length; i++) {
    const pid = Number(sorted[i].participant.id)
    if (used.has(pid)) continue

    let found = false

    // First pass: no rematch
    for (let j = i + 1; j < sorted.length; j++) {
      const qid = Number(sorted[j].participant.id)
      if (used.has(qid)) continue
      if (playedPairs.has(pairKey(pid, qid))) continue
      result.push([pid, qid])
      used.add(pid)
      used.add(qid)
      found = true
      break
    }

    if (!found) {
      // Fallback: allow rematch (rare edge case when everyone has played each other)
      for (let j = i + 1; j < sorted.length; j++) {
        const qid = Number(sorted[j].participant.id)
        if (used.has(qid)) continue
        result.push([pid, qid])
        used.add(pid)
        used.add(qid)
        found = true
        break
      }
    }

    if (!found) {
      // Only one player left unpaired → bye
      result.push([pid, null])
      used.add(pid)
    }
  }

  return result
}

export class SwissService {
  static async getStandings(tournamentId: number): Promise<StandingsEntry[]> {
    const participants = await TournamentParticipantModel.getByTournament(tournamentId)
    const matches = await TournamentMatchModel.getByTournament(tournamentId)
    const completed = matches.filter(m => m.status === 'completed' || m.status === 'bye')

    const entries = participants.map(p => {
      const pid = Number(p.id)
      const mine = completed.filter(
        m => Number(m.participant1_id) === pid || Number(m.participant2_id) === pid
      )
      const wins = mine.filter(m => Number(m.winner_id) === pid).length
      const losses = mine.length - wins
      const gameWins = mine.reduce((sum, m) => {
        if (Number(m.participant1_id) === pid) return sum + Number(m.p1_games_won)
        return sum + Number(m.p2_games_won)
      }, 0)
      return { participant: p, wins, losses, gameWins, matchesPlayed: mine.length }
    })

    entries.sort((a, b) => b.wins - a.wins || b.gameWins - a.gameWins)
    return entries
  }

  static async generateRound(
    tournamentId: number,
    round: number,
    participants: TournamentParticipant[],
    regulation: TournamentRegulation,
    allMatches: TournamentMatch[]
  ): Promise<number[]> {
    const standings = await this.getStandings(tournamentId)

    // Build set of already-played pairs
    const playedPairs = new Set<string>()
    for (const m of allMatches) {
      if (m.participant1_id && m.participant2_id) {
        playedPairs.add(pairKey(Number(m.participant1_id), Number(m.participant2_id)))
      }
    }

    // Track who has already received a bye
    const byeRecipients = new Set<number>(
      allMatches
        .filter(m => m.status === 'bye' && m.winner_id)
        .map(m => Number(m.winner_id))
    )

    // Shuffle within same-wins groups to randomize pairing order
    const grouped = new Map<number, StandingsEntry[]>()
    for (const e of standings) {
      if (!grouped.has(e.wins)) grouped.set(e.wins, [])
      grouped.get(e.wins)!.push(e)
    }
    const shuffled: StandingsEntry[] = []
    for (const [, group] of [...grouped.entries()].sort((a, b) => b[0] - a[0])) {
      shuffled.push(...shuffle(group))
    }

    const pairs = buildPairings(shuffled, playedPairs)
    const matchIds: number[] = []
    let matchNumber = 1

    for (const [pid, qid] of pairs) {
      const p1 = participants.find(p => Number(p.id) === pid)!

      if (qid === null) {
        // Bye: give the player a free win
        const byeWins = regulation.winsRequired
        const m = await TournamentMatchModel.create({
          tournament_id: tournamentId,
          round,
          match_number: matchNumber++,
          match_code: null,
          participant1_id: pid,
          participant2_id: null,
          winner_id: pid,
          handicap_participant_id: null,
          handicap_rounds: 0,
          vc_channel_id: null,
          status: 'bye',
        })
        await TournamentMatchModel.setScore(m.id, pid, byeWins, 0)
        continue
      }

      const p2 = participants.find(p => Number(p.id) === qid)!
      const handicap = BracketService.calcHandicap(p1, p2, regulation.handicapRules)

      const m = await TournamentMatchModel.create({
        tournament_id: tournamentId,
        round,
        match_number: matchNumber++,
        match_code: generateMatchCode(),
        participant1_id: pid,
        participant2_id: qid,
        winner_id: null,
        handicap_participant_id: handicap.handicapParticipantId,
        handicap_rounds: handicap.rounds,
        vc_channel_id: null,
        status: 'pending',
      })
      matchIds.push(m.id)
    }

    return matchIds
  }

  static async isRoundComplete(tournamentId: number, round: number): Promise<boolean> {
    const matches = await TournamentMatchModel.getByRound(tournamentId, round)
    return matches.every(m => m.status === 'completed' || m.status === 'bye')
  }

  static async getCurrentRound(tournamentId: number): Promise<number> {
    const matches = await TournamentMatchModel.getByTournament(tournamentId)
    if (matches.length === 0) return 0
    return Math.max(...matches.map(m => m.round))
  }

  static async formatMatchContent(matchId: number, regulation: TournamentRegulation, round: number, totalRounds: number): Promise<MatchContent> {
    const match = await TournamentMatchModel.getWithParticipants(matchId)
    if (!match) throw new Error(`Match ${matchId} not found`)

    const winsLabel = `${regulation.winsRequired}先 / ${regulation.roundsRequired ?? 2}ラウンド`
    const p1Display = match.p1_discord_id
      ? `<@${match.p1_discord_id}>${match.p1_rank ? ` [${match.p1_rank}]` : ''}${match.p1_character ? ` (${match.p1_character})` : ''}`
      : 'TBD'
    const p2Display = match.p2_discord_id
      ? `<@${match.p2_discord_id}>${match.p2_rank ? ` [${match.p2_rank}]` : ''}${match.p2_character ? ` (${match.p2_character})` : ''}`
      : 'TBD'

    const lines = [
      `\`#${match.match_code}\`  スイスドロー Round ${round}/${totalRounds}  【${winsLabel}】`,
      `${p1Display}  vs  ${p2Display}`,
    ]

    if (match.handicap_rounds > 0 && match.handicap_player_name) {
      lines.push(`⚖️ ハンデ: ${match.handicap_rounds}ラウンド落とし（${match.handicap_player_name}に適用）`)
    }

    const row = new ActionRowBuilder<ButtonBuilder>()
    if (match.p1_discord_id && match.participant1_id) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`tnm-win:${match.id}:${match.participant1_id}`)
          .setLabel(`${match.p1_name} の勝利 ✅`)
          .setStyle(ButtonStyle.Success)
      )
    }
    if (match.p2_discord_id && match.participant2_id) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`tnm-win:${match.id}:${match.participant2_id}`)
          .setLabel(`${match.p2_name} の勝利 ✅`)
          .setStyle(ButtonStyle.Success)
      )
    }

    return {
      content: lines.join('\n'),
      components: row.components.length > 0 ? [row] : [],
    }
  }

  static async formatSwissEmbed(tournamentId: number): Promise<EmbedBuilder> {
    const tournament = await TournamentModel.getById(tournamentId)
    if (!tournament) throw new Error('Tournament not found')

    const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
    const totalRounds = regulation.totalRounds ?? 4
    const standings = await this.getStandings(tournamentId)
    const currentRound = await this.getCurrentRound(tournamentId)
    const allMatches = await TournamentMatchModel.getByTournamentWithParticipants(tournamentId)
    const currentRoundMatches = allMatches.filter(m => m.round === currentRound && m.status !== 'bye')

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`🎯 ${tournament.name} — スイスドロー`)
      .setTimestamp()

    // Round progress header
    embed.setDescription(`**Round ${currentRound} / ${totalRounds}**`)

    // Standings
    const medals = ['🥇', '🥈', '🥉']
    const standingsText = standings
      .map((s, i) => {
        const medal = medals[i] ?? `${i + 1}位`
        const rank = s.participant.rank ? ` [${s.participant.rank}]` : ''
        const char = s.participant.character ? ` (${s.participant.character})` : ''
        return `${medal} <@${s.participant.discord_id}>${rank}${char} — **${s.wins}勝${s.losses}敗** (${s.gameWins}G)`
      })
      .join('\n')
    embed.addFields({ name: '📊 現在の順位', value: standingsText || 'まだ試合結果がありません' })

    // Current round matches
    if (currentRoundMatches.length > 0) {
      const matchText = currentRoundMatches
        .map(m => {
          const p1 = m.p1_name ?? '?'
          const p2 = m.p2_name ?? '?'
          if (m.status === 'completed') {
            return `\`#${m.match_code}\` ${p1} ${m.p1_games_won}-${m.p2_games_won} ${p2} ✅ ${m.winner_name}`
          }
          return `\`#${m.match_code}\` ${p1} vs ${p2} ⏳`
        })
        .join('\n')
      embed.addFields({ name: `Round ${currentRound} の対戦`, value: matchText.slice(0, 1024) })
    }

    const completedInRound = currentRoundMatches.filter(m => m.status === 'completed').length
    embed.setFooter({
      text: `Round ${currentRound}: ${completedInRound}/${currentRoundMatches.length} 完了 | ${regulation.winsRequired}先`,
    })

    return embed
  }
}
