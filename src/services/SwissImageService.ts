import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { AttachmentBuilder, EmbedBuilder } from 'discord.js'
import { TournamentModel, TournamentRegulation } from '../models/Tournament'
import { TournamentMatchModel } from '../models/TournamentMatch'
import { SwissService } from './SwissService'
import * as fs from 'fs'

// ─── Font registration ────────────────────────────────────────────────────────

let fontsRegistered = false
function registerFonts(): void {
  if (fontsRegistered) return
  fontsRegistered = true
  const candidates = [
    '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',
    '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try { GlobalFonts.registerFromPath(p, 'JapaneseGothic') } catch {}
      break
    }
  }
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const BG        = '#2b2d31'
const HEADER_BG = '#1e1f22'
const ALT_ROW   = '#313338'
const SECTION_BG = '#23252a'
const WHITE     = '#ffffff'
const GRAY      = '#b5bac1'
const GOLD      = '#ffd700'
const SILVER    = '#c0c0c0'
const BRONZE    = '#cd7f32'
const WIN_CLR   = '#57f287'
const LOSS_CLR  = '#ed4245'
const LINE_CLR  = '#3f4147'
const ORANGE    = '#e67e22'
const PENDING   = '#faa61a'

const INPAD  = 16
const TITLE_H = 56
const TH      = 32
const ROW_H   = 34
const SEC_H   = 36   // section header height
const MATCH_H = 30   // pairing row height
const W       = 620

const CX_RANK  = INPAD + 4
const CX_NAME  = INPAD + 44
const CX_RANKTEXT = INPAD + 300
const CX_WL    = INPAD + 452
const CX_GAMES = INPAD + 540

// Pairing columns
const PX_CODE  = INPAD + 4
const PX_P1    = INPAD + 70
const PX_P2    = INPAD + 310
const PX_STATUS = INPAD + 540

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…'
}

// ─── Image generation ─────────────────────────────────────────────────────────

export class SwissImageService {
  static async generateSwissImage(tournamentId: number): Promise<Buffer> {
    registerFonts()

    const tournament = await TournamentModel.getById(tournamentId)
    if (!tournament) throw new Error(`Tournament ${tournamentId} not found`)

    const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
    const totalRounds = regulation.totalRounds ?? 4
    const standings = await SwissService.getStandings(tournamentId)
    const currentRound = await SwissService.getCurrentRound(tournamentId)
    const allMatches = await TournamentMatchModel.getByTournamentWithParticipants(tournamentId)
    const roundMatches = allMatches.filter(m => m.round === currentRound && m.status !== 'bye')

    const ff = 'JapaneseGothic, sans-serif'

    // Calculate canvas height
    const pairingSection = roundMatches.length > 0 ? SEC_H + roundMatches.length * MATCH_H + 8 : 0
    const H = TITLE_H + TH + standings.length * ROW_H + pairingSection + 2

    const canvas = createCanvas(W, H)
    const ctx = canvas.getContext('2d')

    // Background
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    // ── Title area ─────────────────────────────────────────────────────────────
    ctx.fillStyle = ORANGE
    ctx.font = `bold 17px ${ff}`
    ctx.fillText(truncate(tournament.name, 36), INPAD, 22)
    ctx.fillStyle = GRAY
    ctx.font = `12px ${ff}`
    ctx.fillText(`スイスドロー — Round ${currentRound} / ${totalRounds}`, INPAD, 42)

    // ── Table header ───────────────────────────────────────────────────────────
    ctx.fillStyle = HEADER_BG
    ctx.fillRect(0, TITLE_H, W, TH)

    ctx.strokeStyle = LINE_CLR
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, TITLE_H + TH)
    ctx.lineTo(W, TITLE_H + TH)
    ctx.stroke()

    const hY = TITLE_H + TH / 2 + 5
    ctx.fillStyle = GRAY
    ctx.font = `bold 11px ${ff}`
    ctx.fillText('#',          CX_RANK,      hY)
    ctx.fillText('プレイヤー', CX_NAME,      hY)
    ctx.fillText('ランク',     CX_RANKTEXT,  hY)
    ctx.fillText('W-L',        CX_WL,        hY)
    ctx.fillText('G勝',        CX_GAMES,     hY)

    // ── Standings rows ─────────────────────────────────────────────────────────
    const rankLabels = ['1st', '2nd', '3rd']
    const barColors  = [GOLD, SILVER, BRONZE]

    for (let i = 0; i < standings.length; i++) {
      const s    = standings[i]
      const rowY = TITLE_H + TH + i * ROW_H
      const tY   = rowY + ROW_H / 2 + 5

      ctx.fillStyle = i % 2 === 0 ? BG : ALT_ROW
      ctx.fillRect(0, rowY, W, ROW_H)

      if (i < 3) {
        ctx.fillStyle = barColors[i]
        ctx.fillRect(0, rowY, 3, ROW_H)
      }

      ctx.fillStyle = i < 3 ? GOLD : GRAY
      ctx.font = `bold 11px ${ff}`
      ctx.fillText(rankLabels[i] ?? String(i + 1), CX_RANK, tY)

      ctx.fillStyle = WHITE
      ctx.font = `13px ${ff}`
      ctx.fillText(truncate(s.participant.discord_name, 20), CX_NAME, tY)

      ctx.fillStyle = GRAY
      ctx.font = `11px ${ff}`
      ctx.fillText(truncate(s.participant.rank ?? '—', 10), CX_RANKTEXT, tY)

      ctx.fillStyle = s.wins > s.losses ? WIN_CLR : s.losses > s.wins ? LOSS_CLR : WHITE
      ctx.font = `bold 13px ${ff}`
      ctx.fillText(`${s.wins}-${s.losses}`, CX_WL, tY)

      ctx.fillStyle = GRAY
      ctx.font = `12px ${ff}`
      ctx.fillText(String(s.gameWins), CX_GAMES, tY)
    }

    // ── Pairings section ───────────────────────────────────────────────────────
    if (roundMatches.length > 0) {
      const secTop = TITLE_H + TH + standings.length * ROW_H

      // Section header
      ctx.fillStyle = SECTION_BG
      ctx.fillRect(0, secTop, W, SEC_H)

      ctx.strokeStyle = LINE_CLR
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, secTop)
      ctx.lineTo(W, secTop)
      ctx.stroke()

      ctx.fillStyle = ORANGE
      ctx.font = `bold 13px ${ff}`
      ctx.fillText(`Round ${currentRound} の対戦`, INPAD, secTop + SEC_H / 2 + 5)

      // Pairing column headers
      const colHY = secTop + SEC_H + 14
      ctx.fillStyle = GRAY
      ctx.font = `bold 10px ${ff}`
      ctx.fillText('Code',    PX_CODE,   colHY)
      ctx.fillText('P1',      PX_P1,     colHY)
      ctx.fillText('P2',      PX_P2,     colHY)
      ctx.fillText('結果',    PX_STATUS, colHY)

      for (let i = 0; i < roundMatches.length; i++) {
        const m    = roundMatches[i]
        const rowY = secTop + SEC_H + MATCH_H + i * MATCH_H
        const tY   = rowY + MATCH_H / 2 + 4

        ctx.fillStyle = i % 2 === 0 ? BG : ALT_ROW
        ctx.fillRect(0, rowY, W, MATCH_H)

        // Match code
        ctx.fillStyle = GRAY
        ctx.font = `10px ${ff}`
        ctx.fillText(`#${m.match_code ?? '???'}`, PX_CODE, tY)

        // P1 name
        const p1Name = truncate(m.p1_name ?? 'TBD', 16)
        const p2Name = truncate(m.p2_name ?? 'TBD', 16)

        ctx.fillStyle = m.status === 'completed' && m.winner_id === m.participant1_id ? WIN_CLR : WHITE
        ctx.font = `12px ${ff}`
        ctx.fillText(p1Name, PX_P1, tY)

        // vs separator
        ctx.fillStyle = GRAY
        ctx.font = `11px ${ff}`
        ctx.fillText('vs', PX_P2 - 26, tY)

        // P2 name
        ctx.fillStyle = m.status === 'completed' && m.winner_id === m.participant2_id ? WIN_CLR : WHITE
        ctx.font = `12px ${ff}`
        ctx.fillText(p2Name, PX_P2, tY)

        // Status
        if (m.status === 'completed') {
          ctx.fillStyle = WIN_CLR
          ctx.font = `11px ${ff}`
          ctx.fillText(`${m.p1_games_won}-${m.p2_games_won}`, PX_STATUS, tY)
        } else {
          ctx.fillStyle = PENDING
          ctx.font = `11px ${ff}`
          ctx.fillText('⏳', PX_STATUS, tY)
        }
      }
    }

    return canvas.toBuffer('image/png')
  }

  static async formatSwissAsAttachment(
    tournamentId: number
  ): Promise<{ attachment: AttachmentBuilder; embed: EmbedBuilder }> {
    const tournament = await TournamentModel.getById(tournamentId)
    if (!tournament) throw new Error(`Tournament ${tournamentId} not found`)

    const buffer = await this.generateSwissImage(tournamentId)
    const attachment = new AttachmentBuilder(buffer, { name: 'swiss.png' })

    const regulation = JSON.parse(tournament.regulation) as TournamentRegulation
    const totalRounds = regulation.totalRounds ?? 4
    const currentRound = await SwissService.getCurrentRound(tournamentId)

    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`🎯 ${tournament.name} — スイスドロー`)
      .setDescription(`**Round ${currentRound} / ${totalRounds}**`)
      .setImage('attachment://swiss.png')
      .setTimestamp()

    return { attachment, embed }
  }
}
