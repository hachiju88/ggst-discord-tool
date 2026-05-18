import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { TournamentModel, TournamentRegulation, HandicapRule } from '../models/Tournament'
import { TournamentParticipant, TournamentParticipantModel } from '../models/TournamentParticipant'
import { TournamentMatchModel, MatchWithParticipants } from '../models/TournamentMatch'
import { getRankIndex } from '../constants/ranks'
import { generateMatchCode } from '../utils/matchCode'
import { shuffle } from '../utils/shuffle'

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

  // Creates all DB match records for the bracket. Returns IDs of all immediately-playable matches.
  static async generateBracket(
    tournamentId: number,
    participants: TournamentParticipant[],
    regulation: TournamentRegulation,
    voiceChannelIds: string[]
  ): Promise<number[]> {
    const shuffled = shuffle(participants)
    const size = nextPowerOf2(shuffled.length)
    const numRounds = Math.log2(size)
    const numByes = size - shuffled.length

    // Place participants so byes are never paired with byes.
    // First `numByes` real players are placed in even slots (paired with null);
    // the rest fill consecutive slots.
    const slots: (TournamentParticipant | null)[] = new Array(size).fill(null)
    for (let i = 0; i < numByes; i++) {
      slots[i * 2] = shuffled[i]
    }
    let idx = numByes
    for (let i = numByes * 2; i < size && idx < shuffled.length; i++) {
      slots[i] = shuffled[idx++]
    }

    // Round 1 matches. Assign VC only to real (non-bye) matches.
    let vcIdx = 0
    const matchPromises = []
    for (let i = 0; i < size / 2; i++) {
      const p1 = slots[i * 2]
      const p2 = slots[i * 2 + 1]
      const matchNumber = i + 1
      const isBye = !p1 || !p2
      const vcId = isBye ? null : (voiceChannelIds[vcIdx++] ?? null)
      const matchCode = isBye ? null : generateMatchCode()

      let handicap: HandicapResult = { handicapParticipantId: null, rounds: 0 }
      if (p1 && p2) {
        handicap = this.calcHandicap(p1, p2, regulation.handicapRules)
      }

      matchPromises.push(TournamentMatchModel.create({
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
      }))
    }
    await Promise.all(matchPromises)

    // Skeleton matches for rounds 2+
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

    // Propagate round-1 byes into round 2
    if (numRounds >= 2) {
      const round1 = await TournamentMatchModel.getByRound(tournamentId, 1)
      const round2 = await TournamentMatchModel.getByRound(tournamentId, 2)
      for (const m of round1) {
        if (m.status !== 'bye' || !m.winner_id) continue
        const nextMatchNumber = Math.ceil(m.match_number / 2)
        const slot: 'p1' | 'p2' = m.match_number % 2 === 1 ? 'p1' : 'p2'
        const target = round2.find(r => r.match_number === nextMatchNumber)
        if (target) {
          await TournamentMatchModel.setParticipant(target.id, m.winner_id, slot)
        }
      }
      // Finalize any round-2 matches that are now both-ready, and assign spare VCs
      const refreshedR2 = await TournamentMatchModel.getByRound(tournamentId, 2)
      for (const m of refreshedR2) {
        if (m.participant1_id && m.participant2_id && !m.match_code) {
          await this.finalizeMatchIfReady(m.id, regulation)
          if (vcIdx < voiceChannelIds.length) {
            await TournamentMatchModel.setVcChannel(m.id, voiceChannelIds[vcIdx++])
          }
        }
      }
    }

    // Return IDs of all matches that are immediately playable
    const allMatches = await TournamentMatchModel.getByTournament(tournamentId)
    return allMatches
      .filter(m => m.status === 'pending' && m.participant1_id && m.participant2_id)
      .map(m => m.id)
  }

  // Compute handicap and assign match code for a pending match whose participants are both known.
  static async finalizeMatchIfReady(matchId: number, regulation: TournamentRegulation): Promise<boolean> {
    const m = await TournamentMatchModel.getById(matchId)
    if (!m || !m.participant1_id || !m.participant2_id) return false
    if (m.match_code) return true
    const p1 = await TournamentParticipantModel.getById(m.participant1_id)
    const p2 = await TournamentParticipantModel.getById(m.participant2_id)
    if (!p1 || !p2) return false
    const h = this.calcHandicap(p1, p2, regulation.handicapRules)
    await TournamentMatchModel.setHandicap(m.id, h.handicapParticipantId, h.rounds)
    await TournamentMatchModel.setMatchCode(m.id, generateMatchCode())
    return true
  }

  static async advanceWinner(
    matchId: number,
    winnerId: number,
    regulation: TournamentRegulation
  ): Promise<AdvanceResult> {
    const match = await TournamentMatchModel.getById(matchId)
    if (!match) return { isChampion: false, championId: null, nextMatchId: null, nextMatchReady: false }

    await TournamentMatchModel.setWinner(matchId, winnerId)

    // Eliminate the loser (defensive Number() to handle bigint/number coercion edge cases)
    const p1Id = match.participant1_id != null ? Number(match.participant1_id) : null
    const p2Id = match.participant2_id != null ? Number(match.participant2_id) : null
    const loserId = p1Id === winnerId ? p2Id : p1Id
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

    const finalized = await this.finalizeMatchIfReady(nextMatch.id, regulation)

    return {
      isChampion: false,
      championId: null,
      nextMatchId: nextMatch.id,
      nextMatchReady: finalized,
    }
  }

  static async formatMatchContent(matchId: number, regulation: TournamentRegulation): Promise<MatchContent> {
    const match = await TournamentMatchModel.getWithParticipants(matchId)
    if (!match) throw new Error(`Match ${matchId} not found`)

    const rounds = regulation.roundsRequired ?? 2
    const winsLabel = `${regulation.winsRequired}先 / ${rounds}ラウンド`
    const p1Display = match.p1_discord_id
      ? `<@${match.p1_discord_id}>${match.p1_rank ? ` [${match.p1_rank}]` : ''}${match.p1_character ? ` (${match.p1_character})` : ''}`
      : 'TBD'
    const p2Display = match.p2_discord_id
      ? `<@${match.p2_discord_id}>${match.p2_rank ? ` [${match.p2_rank}]` : ''}${match.p2_character ? ` (${match.p2_character})` : ''}`
      : 'TBD'

    const lines: string[] = [
      `\`#${match.match_code ?? '------'}\`  Round ${match.round} - Match ${match.match_number}  【${winsLabel}】`,
      p1Display,
      '**vs**',
      p2Display,
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
      if (m.status === 'bye') continue
      if (!roundsMap.has(m.round)) roundsMap.set(m.round, [])
      roundsMap.get(m.round)!.push(m)
    }

    const sortedRounds = [...roundsMap.keys()].sort((a, b) => a - b)
    const totalRounds = sortedRounds.length

    function roundName(r: number): string {
      if (r === totalRounds) return '決勝'
      if (r === totalRounds - 1 && totalRounds > 2) return '準決勝'
      if (r === totalRounds - 2 && totalRounds > 3) return '準々決勝'
      return `Round ${r}`
    }

    const descLines: string[] = []

    for (const round of sortedRounds) {
      const roundMatches = [...(roundsMap.get(round) ?? [])].sort((a, b) => a.match_number - b.match_number)
      if (roundMatches.length === 0) continue

      descLines.push(`**━━ ${roundName(round)} ━━**`)

      for (const m of roundMatches) {
        const p1 = m.p1_discord_id
          ? `<@${m.p1_discord_id}>${m.p1_rank ? ` [${m.p1_rank}]` : ''}`
          : 'TBD'
        const p2 = m.p2_discord_id
          ? `<@${m.p2_discord_id}>${m.p2_rank ? ` [${m.p2_rank}]` : ''}`
          : 'TBD'

        if (m.status === 'completed' && m.winner_discord_id) {
          const isP1Winner = m.winner_discord_id === m.p1_discord_id
          const winner = isP1Winner ? p1 : p2
          const loser = isP1Winner ? p2 : p1
          descLines.push(`✅ ${winner}  **def.**  ${loser}`)
        } else if (!m.p1_discord_id || !m.p2_discord_id) {
          descLines.push(`⬜ ${p1}  vs  ${p2}`)
        } else {
          const handicapSuffix = m.handicap_rounds > 0 && m.handicap_player_name
            ? `  ⚖️ ${m.handicap_player_name}に${m.handicap_rounds}R落とし`
            : ''
          descLines.push(`⚔️ ${p1}  vs  ${p2}${handicapSuffix}`)
        }
      }

      descLines.push('')
    }

    const active = matches.filter(m => m.status !== 'bye')
    const completed = active.filter(m => m.status === 'completed')

    const description = descLines.join('\n').slice(0, 4000) || '試合はまだありません。'
    embed.setDescription(description)
    embed.setFooter({
      text: `進行状況: ${completed.length}/${active.length} 試合完了 | ${regulation.winsRequired}先 / ${regulation.roundsRequired ?? 2}ラウンド`,
    })

    return embed
  }
}
