import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { TournamentModel, TournamentRegulation } from '../models/Tournament'
import { TournamentParticipant, TournamentParticipantModel } from '../models/TournamentParticipant'
import { TournamentMatchModel } from '../models/TournamentMatch'
import { BracketService } from './BracketService'
import { generateMatchCode } from '../utils/matchCode'

export interface StandingsEntry {
  participant: TournamentParticipant
  wins: number
  losses: number
  gameWins: number
  matchesPlayed: number
}

export interface MatchContent {
  content: string
  components: ActionRowBuilder<ButtonBuilder>[]
}

export class LeagueService {
  static async generateLeague(
    tournamentId: number,
    participants: TournamentParticipant[],
    regulation: TournamentRegulation
  ): Promise<number[]> {
    const matchIds: number[] = []
    let matchNumber = 1

    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        const p1 = participants[i]
        const p2 = participants[j]
        const handicap = BracketService.calcHandicap(p1, p2, regulation.handicapRules)

        const match = await TournamentMatchModel.create({
          tournament_id: tournamentId,
          round: 1,
          match_number: matchNumber++,
          match_code: generateMatchCode(),
          participant1_id: p1.id,
          participant2_id: p2.id,
          winner_id: null,
          handicap_participant_id: handicap.handicapParticipantId,
          handicap_rounds: handicap.rounds,
          vc_channel_id: null,
          status: 'pending',
        })
        matchIds.push(match.id)
      }
    }

    return matchIds
  }

  static async getStandings(tournamentId: number): Promise<StandingsEntry[]> {
    const participants = await TournamentParticipantModel.getByTournament(tournamentId)
    const matches = await TournamentMatchModel.getByTournament(tournamentId)
    const completed = matches.filter(m => m.status === 'completed')

    const entries = participants.map(p => {
      const pid = Number(p.id)
      const myCompleted = completed.filter(
        m => Number(m.participant1_id) === pid || Number(m.participant2_id) === pid
      )
      const wins = myCompleted.filter(m => Number(m.winner_id) === pid).length
      const losses = myCompleted.length - wins
      const gameWins = myCompleted.reduce((sum, m) => {
        if (Number(m.participant1_id) === pid) return sum + Number(m.p1_games_won)
        return sum + Number(m.p2_games_won)
      }, 0)

      return { participant: p, wins, losses, gameWins, matchesPlayed: myCompleted.length }
    })

    entries.sort((a, b) => b.wins - a.wins || b.gameWins - a.gameWins)
    return entries
  }

  static async formatMatchContent(matchId: number, regulation: TournamentRegulation): Promise<MatchContent> {
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
      `\`#${match.match_code}\`  リーグ戦 - Match ${match.match_number}  【${winsLabel}】`,
      p1Display,
      '**vs**',
      p2Display,
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

  static async formatLeagueEmbed(tournamentId: number): Promise<EmbedBuilder> {
    const tournament = await TournamentModel.getById(tournamentId)
    if (!tournament) throw new Error('Tournament not found')

    const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
    const standings = await this.getStandings(tournamentId)
    const matches = await TournamentMatchModel.getByTournamentWithParticipants(tournamentId)

    const totalMatches = matches.length
    const completedMatches = matches.filter(m => m.status === 'completed').length

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🏟️ ${tournament.name} — 順位表`)
      .setTimestamp()

    const medals = ['🥇', '🥈', '🥉']
    const standingsText = standings
      .map((s, i) => {
        const medal = medals[i] ?? `${i + 1}位`
        const rank = s.participant.rank ? ` [${s.participant.rank}]` : ''
        const char = s.participant.character ? ` (${s.participant.character})` : ''
        return `${medal} <@${s.participant.discord_id}>${rank}${char} — **${s.wins}勝${s.losses}敗** (${s.gameWins}G)`
      })
      .join('\n')

    embed.addFields({ name: '📊 順位表', value: standingsText || 'まだ試合結果がありません' })

    const recentCompleted = matches.filter(m => m.status === 'completed').slice(-8)
    if (recentCompleted.length > 0) {
      const resultText = recentCompleted
        .map(m => {
          const p1 = m.p1_name ?? '?'
          const p2 = m.p2_name ?? '?'
          const score = `${m.p1_games_won}-${m.p2_games_won}`
          return `\`#${m.match_code}\` ${p1} ${score} ${p2} ✅ ${m.winner_name}`
        })
        .join('\n')
      embed.addFields({ name: '✅ 最近の試合結果', value: resultText.slice(0, 1024) })
    }

    embed.setFooter({
      text: `進行状況: ${completedMatches}/${totalMatches} 試合完了 | ${regulation.winsRequired}先`,
    })

    return embed
  }

  static async checkAllComplete(tournamentId: number): Promise<boolean> {
    const matches = await TournamentMatchModel.getByTournament(tournamentId)
    return matches.every(m => m.status === 'completed')
  }
}
