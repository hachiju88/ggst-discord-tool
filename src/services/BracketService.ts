import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { TournamentModel, TournamentRegulation, HandicapRule } from '../models/Tournament'
import { TournamentParticipant, TournamentParticipantModel } from '../models/TournamentParticipant'
import { TournamentMatchModel, MatchWithParticipants } from '../models/TournamentMatch'
import { getRankIndex } from '../constants/ranks'

export interface HandicapResult {
  handicapParticipantId: number | null
  rounds: number
}

export interface MatchContent {
  content: string
  components: ActionRowBuilder<ButtonBuilder>[]
}

export interface AdvanceResult {
  isChampion: boolean
  championId: number | null
  nextMatchId: number | null
  nextMatchReady: boolean
}

function nextPowerOf2(n: number): number {
  let p = 1
  while (p < n) p <<= 1
  return p
}

function generateMatchCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export class BracketService {
  static calcHandicap(
    p1: TournamentParticipant,
    p2: TournamentParticipant,
    rules: HandicapRule[]
  ): HandicapResult {
    if (!p1.rank || !p2.rank || rules.length === 0) {
      return { handicapParticipantId: null, rounds: 0 }
    }
    const idx1 = getRankIndex(p1.rank)
    const idx2 = getRankIndex(p2.rank)
    if (idx1 === -1 || idx2 === -1) return { handicapParticipantId: null, rounds: 0 }

    const diff = Math.abs(idx1 - idx2)
    const sorted = [...rules].sort((a, b) => b.minRankDiff - a.minRankDiff)
    const rule = sorted.find(r => diff >= r.minRankDiff)
    if (!rule) return { handicapParticipantId: null, rounds: 0 }

    // lower index = stronger player
    const strongerId = idx1 < idx2 ? p1.id : p2.id
    return { handicapParticipantId: strongerId, rounds: rule.rounds }
  }

  // Creates all DB match records for the bracket. Returns round-1 match IDs (non-bye).
  static async generateBracket(
    tournamentId: number,
    participants: TournamentParticipant[],
    regulation: TournamentRegulation,
    voiceChannelIds: string[]
  ): Promise<number[]> {
    const shuffled = shuffle(participants)
    const size = nextPowerOf2(shuffled.length)
    const numRounds = Math.log2(size)

    // Pad with nulls for byes
    const padded: (TournamentParticipant | null)[] = [...shuffled]
    while (padded.length < size) padded.push(null)

    const round1MatchIds: number[] = []

    // Create round 1 matches
    for (let i = 0; i < size / 2; i++) {
      const p1 = padded[i * 2]
      const p2 = padded[i * 2 + 1]
      const matchNumber = i + 1
      const vcId = voiceChannelIds[i] ?? null
      const isBye = !p1 || !p2
      const matchCode = isBye ? null : generateMatchCode()

      let handicap: HandicapResult = { handicapParticipantId: null, rounds: 0 }
      if (p1 && p2) {
        handicap = this.calcHandicap(p1, p2, regulation.handicapRules)
      }

      const match = await TournamentMatchModel.create({
        tournament_id: tournamentId,
        round: 1,
        match_number: matchNumber,
        match_code: matchCode,
        participant1_id: p1?.id ?? null,
        participant2_id: p2?.id ?? null,
        winner_id: isBye ? (p1?.id ?? p2?.id ?? null) : null,
        handicap_participant_id: handicap.handicapParticipantId,
        handicap_rounds: handicap.rounds,
        vc_channel_id: vcId,
        status: isBye ? 'bye' : 'pending',
      })

      if (!isBye) round1MatchIds.push(match.id)
    }

    // Create skeleton matches for rounds 2+
    let prevCount = size / 2
    for (let r = 2; r <= numRounds; r++) {
      const matchCount = prevCount / 2
      for (let n = 1; n <= matchCount; n++) {
        await TournamentMatchModel.create({
          tournament_id: tournamentId,
          round: r,
          match_number: n,
          match_code: null,
          participant1_id: null,
          participant2_id: null,
          winner_id: null,
          handicap_participant_id: null,
          handicap_rounds: 0,
          vc_channel_id: null,
          status: 'pending',
        })
      }
      prevCount = matchCount
    }

    return round1MatchIds
  }

  static async advanceWinner(
    matchId: number,
    winnerId: number,
    regulation: TournamentRegulation
  ): Promise<AdvanceResult> {
    const match = await TournamentMatchModel.getById(matchId)
    if (!match) return { isChampion: false, championId: null, nextMatchId: null, nextMatchReady: false }

    await TournamentMatchModel.setWinner(matchId, winnerId)

    // Eliminate the loser
    const loserId = match.participant1_id === winnerId ? match.participant2_id : match.participant1_id
    if (loserId) await TournamentParticipantModel.eliminate(loserId)

    const allMatches = await TournamentMatchModel.getByTournament(match.tournament_id)
    const maxRound = Math.max(...allMatches.map(m => m.round))

    if (match.round === maxRound) {
      await TournamentModel.setStatus(match.tournament_id, 'completed')
      return { isChampion: true, championId: winnerId, nextMatchId: null, nextMatchReady: false }
    }

    const nextRound = match.round + 1
    const nextMatchNumber = Math.ceil(match.match_number / 2)
    const slot: 'p1' | 'p2' = match.match_number % 2 === 1 ? 'p1' : 'p2'

    const nextMatch = allMatches.find(m => m.round === nextRound && m.match_number === nextMatchNumber)
    if (!nextMatch) return { isChampion: false, championId: null, nextMatchId: null, nextMatchReady: false }

    await TournamentMatchModel.setParticipant(nextMatch.id, winnerId, slot)

    // Check if the next match now has both participants
    const updatedNext = await TournamentMatchModel.getById(nextMatch.id)
    const bothReady = !!(updatedNext?.participant1_id && updatedNext?.participant2_id)

    if (bothReady && updatedNext) {
      const p1 = await TournamentParticipantModel.getById(updatedNext.participant1_id!)
      const p2 = await TournamentParticipantModel.getById(updatedNext.participant2_id!)
      if (p1 && p2) {
        const handicap = this.calcHandicap(p1, p2, regulation.handicapRules)
        await TournamentMatchModel.setHandicap(updatedNext.id, handicap.handicapParticipantId, handicap.rounds)
        await TournamentMatchModel.setMatchCode(updatedNext.id, generateMatchCode())
      }
    }

    return {
      isChampion: false,
      championId: null,
      nextMatchId: nextMatch.id,
      nextMatchReady: bothReady,
    }
  }

  static async formatMatchContent(matchId: number, regulation: TournamentRegulation): Promise<MatchContent> {
    const match = await TournamentMatchModel.getWithParticipants(matchId)
    if (!match) throw new Error(`Match ${matchId} not found`)

    const winsLabel = `${regulation.winsRequired}先`
    const p1Display = match.p1_discord_id
      ? `<@${match.p1_discord_id}>${match.p1_rank ? ` [${match.p1_rank}]` : ''}`
      : 'TBD'
    const p2Display = match.p2_discord_id
      ? `<@${match.p2_discord_id}>${match.p2_rank ? ` [${match.p2_rank}]` : ''}`
      : 'TBD'

    const lines: string[] = [
      `\`#${match.match_code ?? '------'}\`  Round ${match.round} - Match ${match.match_number}  【${winsLabel}】`,
      `${p1Display}  vs  ${p2Display}`,
    ]

    if (match.handicap_rounds > 0 && match.handicap_player_name) {
      lines.push(`⚖️ ハンデ: ${match.handicap_rounds}ラウンド落とし（${match.handicap_player_name}に適用）`)
    }

    if (match.vc_channel_id) {
      lines.push(`🎤 <#${match.vc_channel_id}>`)
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

  static async formatBracketEmbed(tournamentId: number): Promise<EmbedBuilder> {
    const tournament = await TournamentModel.getById(tournamentId)
    if (!tournament) throw new Error('Tournament not found')

    const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
    const matches = await TournamentMatchModel.getByTournamentWithParticipants(tournamentId)

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`🏆 ${tournament.name}`)
      .setTimestamp()

    const roundsMap = new Map<number, MatchWithParticipants[]>()
    for (const m of matches) {
      if (!roundsMap.has(m.round)) roundsMap.set(m.round, [])
      roundsMap.get(m.round)!.push(m)
    }

    const totalRounds = roundsMap.size > 0 ? Math.max(...roundsMap.keys()) : 0

    for (const [round, roundMatches] of [...roundsMap.entries()].sort((a, b) => a[0] - b[0])) {
      const roundName =
        round === totalRounds
          ? '決勝'
          : round === totalRounds - 1 && totalRounds > 2
          ? '準決勝'
          : `Round ${round}`

      const lines: string[] = []
      for (const m of roundMatches) {
        if (m.status === 'bye') continue

        const p1 = m.p1_discord_id
          ? `<@${m.p1_discord_id}>${m.p1_rank ? `[${m.p1_rank}]` : ''}`
          : 'TBD'
        const p2 = m.p2_discord_id
          ? `<@${m.p2_discord_id}>${m.p2_rank ? `[${m.p2_rank}]` : ''}`
          : 'TBD'

        let line = `\`#${m.match_code ?? '------'}\`  ${p1} vs ${p2}`

        if (m.status === 'completed' && m.winner_discord_id) {
          line += `  ✅ <@${m.winner_discord_id}> の勝利`
        } else if (m.handicap_rounds > 0 && m.handicap_player_name) {
          line += `  ⚖️ ${m.handicap_rounds}R落とし(${m.handicap_player_name})`
        }

        if (m.vc_channel_id && m.status !== 'completed') {
          line += `  🎤 <#${m.vc_channel_id}>`
        }

        lines.push(line)
      }

      if (lines.length > 0) {
        const fieldValue = lines.join('\n')
        // Discord embed field value limit is 1024 chars
        embed.addFields({ name: roundName, value: fieldValue.slice(0, 1024) })
      }
    }

    const active = matches.filter(m => m.status !== 'bye')
    const completed = active.filter(m => m.status === 'completed')
    embed.setFooter({
      text: `進行状況: ${completed.length}/${active.length} 試合完了 | ${regulation.winsRequired}先`,
    })

    return embed
  }
}
