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

  // Builds an ASCII bracket art string using box-drawing characters.
  static buildBracketArt(matches: MatchWithParticipants[]): string {
    if (matches.length === 0) return '試合データがありません'

    const maxRound = Math.max(...matches.map(m => m.round))
    const bracketSize = Math.pow(2, maxRound)
    const totalRows = bracketSize * 2 - 1

    const NAME_W = 12
    const H_PAD = 2
    const COL_W = NAME_W + H_PAD + 1 // 15

    const totalCols = maxRound * COL_W + NAME_W + 16
    const grid: string[][] = Array.from({ length: totalRows }, () =>
      new Array(totalCols).fill(' ')
    )

    const set = (row: number, col: number, ch: string) => {
      if (row >= 0 && row < totalRows && col >= 0 && col < totalCols)
        grid[row][col] = ch
    }
    const setStr = (row: number, colStart: number, s: string) => {
      for (let i = 0; i < s.length; i++) set(row, colStart + i, s[i])
    }

    // Row position of ├ for round r (1-indexed), match index m (0-indexed)
    const getMidRow = (r: number, m: number) =>
      Math.pow(2, r) - 1 + m * Math.pow(2, r + 1)

    // Column of ├/┐/┘ for round r (1-indexed)
    const getJoinCol = (r: number) => (r - 1) * COL_W + NAME_W

    const trunc = (s: string) =>
      s.length > NAME_W ? s.substring(0, NAME_W - 1) + '…' : s

    const matchMap = new Map<string, MatchWithParticipants>()
    for (const m of matches) matchMap.set(`${m.round}:${m.match_number - 1}`, m)
    const getMatch = (r: number, mIdx: number) => matchMap.get(`${r}:${mIdx}`)

    const getWinnerName = (m: MatchWithParticipants | undefined): string | null => {
      if (!m || (m.status !== 'completed' && m.status !== 'bye')) return null
      if (m.winner_discord_id && m.winner_discord_id === m.p1_discord_id) return m.p1_name ?? null
      if (m.winner_discord_id && m.winner_discord_id === m.p2_discord_id) return m.p2_name ?? null
      return null
    }

    // Round 1: place participant names, ┐/┘, and ├──
    for (let m = 0; m < bracketSize / 2; m++) {
      const match = getMatch(1, m)
      const topRow = m * 4
      const botRow = m * 4 + 2
      const mid = getMidRow(1, m)
      const jc = getJoinCol(1)

      setStr(topRow, 0, trunc(match?.p1_name ?? '').padEnd(NAME_W, '─'))
      set(topRow, jc, '┐')

      const p2Name = match?.status === 'bye' ? 'BYE' : (match?.p2_name ?? '')
      setStr(botRow, 0, trunc(p2Name).padEnd(NAME_W, '─'))
      set(botRow, jc, '┘')

      set(mid, jc, '├')
      set(mid, jc + 1, '─')
      set(mid, jc + 2, '─')
    }

    // All rounds: place winner name → next join char (or champion label)
    for (let r = 1; r <= maxRound; r++) {
      const matchCount = bracketSize / Math.pow(2, r)
      const jc = getJoinCol(r)

      for (let m = 0; m < matchCount; m++) {
        const mid = getMidRow(r, m)
        const wName = getWinnerName(getMatch(r, m))

        if (r < maxRound) {
          // winner name padded with ─, then ┐/┘ for the next round
          const nameStart = jc + H_PAD + 1
          const nextJC = getJoinCol(r + 1)
          setStr(mid, nameStart, (wName ? trunc(wName) : '').padEnd(NAME_W, '─'))
          set(mid, nextJC, m % 2 === 0 ? '┐' : '┘')
        } else if (wName) {
          setStr(mid, jc + H_PAD + 1, '🏆 ' + wName)
        }
      }
    }

    // Rounds 2+: vertical connectors (│) and ├──
    for (let r = 2; r <= maxRound; r++) {
      const matchCount = bracketSize / Math.pow(2, r)
      const jc = getJoinCol(r)

      for (let m = 0; m < matchCount; m++) {
        const topInRow = getMidRow(r - 1, 2 * m)
        const botInRow = getMidRow(r - 1, 2 * m + 1)
        const mid = getMidRow(r, m)

        for (let row = topInRow + 1; row < mid; row++) set(row, jc, '│')
        set(mid, jc, '├')
        set(mid, jc + 1, '─')
        set(mid, jc + 2, '─')
        for (let row = mid + 1; row < botInRow; row++) set(row, jc, '│')
      }
    }

    return grid.map(row => row.join('').trimEnd()).join('\n')
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

    const bracketArt = BracketService.buildBracketArt(matches)
    const description = '```\n' + bracketArt + '\n```'

    const active = matches.filter(m => m.status !== 'bye')
    const completed = active.filter(m => m.status === 'completed')

    embed.setDescription(description.slice(0, 4096))
    embed.setFooter({
      text: `進行状況: ${completed.length}/${active.length} 試合完了 | ${regulation.winsRequired}先 / ${regulation.roundsRequired ?? 2}ラウンド`,
    })

    return embed
  }
}
