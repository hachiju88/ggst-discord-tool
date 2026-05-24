import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { AttachmentBuilder, EmbedBuilder } from 'discord.js'
import { TournamentModel } from '../models/Tournament'
import { LeagueService } from './LeagueService'
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

const BG       = '#2b2d31'
const HEADER_BG = '#1e1f22'
const ALT_ROW  = '#313338'
const WHITE    = '#ffffff'
const GRAY     = '#b5bac1'
const GOLD     = '#ffd700'
const SILVER   = '#c0c0c0'
const BRONZE   = '#cd7f32'
const WIN_CLR  = '#57f287'
const LOSS_CLR = '#ed4245'
const LINE_CLR = '#3f4147'

const PAD      = 0     // flush edges look better inside Discord embeds
const INPAD    = 16    // inner text padding
const TITLE_H  = 56
const TH       = 32   // table header row height
const ROW_H    = 34   // data row height
const W        = 620

const CX_RANK  = INPAD + 4
const CX_NAME  = INPAD + 44
const CX_RANKTEXT = INPAD + 300
const CX_WL    = INPAD + 452
const CX_GAMES = INPAD + 540

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…'
}

// ─── Image generation ─────────────────────────────────────────────────────────

export class LeagueImageService {
  static async generateLeagueImage(tournamentId: number): Promise<Buffer> {
    registerFonts()

    const tournament = await TournamentModel.getById(tournamentId)
    if (!tournament) throw new Error(`Tournament ${tournamentId} not found`)

    const standings = await LeagueService.getStandings(tournamentId)
    const ff = 'JapaneseGothic, sans-serif'

    const H = TITLE_H + TH + standings.length * ROW_H + 2
    const canvas = createCanvas(W, H)
    const ctx = canvas.getContext('2d')

    // Background
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    // Title area
    ctx.fillStyle = GOLD
    ctx.font = `bold 17px ${ff}`
    ctx.fillText(truncate(tournament.name, 36), INPAD, 22)
    ctx.fillStyle = GRAY
    ctx.font = `12px ${ff}`
    ctx.fillText('リーグ戦 — 順位表', INPAD, 42)

    // Table header background
    ctx.fillStyle = HEADER_BG
    ctx.fillRect(0, TITLE_H, W, TH)

    // Divider below header
    ctx.strokeStyle = LINE_CLR
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, TITLE_H + TH)
    ctx.lineTo(W, TITLE_H + TH)
    ctx.stroke()

    // Header labels
    const hY = TITLE_H + TH / 2 + 5
    ctx.fillStyle = GRAY
    ctx.font = `bold 11px ${ff}`
    ctx.fillText('#',          CX_RANK,     hY)
    ctx.fillText('プレイヤー', CX_NAME,     hY)
    ctx.fillText('ランク',     CX_RANKTEXT, hY)
    ctx.fillText('W-D-L',      CX_WL,       hY)
    ctx.fillText('G勝',        CX_GAMES,    hY)

    // Rank labels for top 3
    const rankLabels = ['1st', '2nd', '3rd']
    const barColors  = [GOLD, SILVER, BRONZE]

    for (let i = 0; i < standings.length; i++) {
      const s    = standings[i]
      const rowY = TITLE_H + TH + i * ROW_H
      const tY   = rowY + ROW_H / 2 + 5

      // Row background (alternating)
      ctx.fillStyle = i % 2 === 0 ? BG : ALT_ROW
      ctx.fillRect(0, rowY, W, ROW_H)

      // Left accent bar for top 3
      if (i < 3) {
        ctx.fillStyle = barColors[i]
        ctx.fillRect(0, rowY, 3, ROW_H)
      }

      // Rank label
      ctx.fillStyle = i < 3 ? GOLD : GRAY
      ctx.font = `bold 11px ${ff}`
      ctx.fillText(rankLabels[i] ?? String(i + 1), CX_RANK, tY)

      // Player name
      ctx.fillStyle = WHITE
      ctx.font = `13px ${ff}`
      ctx.fillText(truncate(s.participant.discord_name, 20), CX_NAME, tY)

      // Rank text
      ctx.fillStyle = GRAY
      ctx.font = `11px ${ff}`
      ctx.fillText(truncate(s.participant.rank ?? '—', 10), CX_RANKTEXT, tY)

      // W-D-L (coloured)
      ctx.fillStyle = s.wins > s.losses ? WIN_CLR : s.losses > s.wins ? LOSS_CLR : WHITE
      ctx.font = `bold 13px ${ff}`
      ctx.fillText(`${s.wins}-${s.draws}-${s.losses}`, CX_WL, tY)

      // Game wins
      ctx.fillStyle = GRAY
      ctx.font = `12px ${ff}`
      ctx.fillText(String(s.gameWins), CX_GAMES, tY)
    }

    // Bottom border
    const botY = TITLE_H + TH + standings.length * ROW_H
    ctx.strokeStyle = LINE_CLR
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, botY)
    ctx.lineTo(W, botY)
    ctx.stroke()

    return canvas.toBuffer('image/png')
  }

  static async formatLeagueAsAttachment(
    tournamentId: number
  ): Promise<{ attachment: AttachmentBuilder; embed: EmbedBuilder }> {
    const tournament = await TournamentModel.getById(tournamentId)
    if (!tournament) throw new Error(`Tournament ${tournamentId} not found`)

    const buffer = await this.generateLeagueImage(tournamentId)
    const attachment = new AttachmentBuilder(buffer, { name: 'league.png' })

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🏟️ ${tournament.name} — 順位表`)
      .setImage('attachment://league.png')
      .setTimestamp()

    return { attachment, embed }
  }
}
