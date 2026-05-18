import { createCanvas, GlobalFonts, SKRSContext2D } from '@napi-rs/canvas'
import { EmbedBuilder, AttachmentBuilder } from 'discord.js'
import { TournamentModel, TournamentRegulation } from '../models/Tournament'
import { TournamentMatchModel, MatchWithParticipants } from '../models/TournamentMatch'
import * as fs from 'fs'

// ─── Font registration ────────────────────────────────────────────────────────

let fontsRegistered = false
function registerFonts(): void {
  if (fontsRegistered) return
  fontsRegistered = true

  const jpFontPath = '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf'
  if (fs.existsSync(jpFontPath)) {
    try {
      GlobalFonts.registerFromPath(jpFontPath, 'JapaneseGothic')
    } catch {
      // font registration failed — fall back to sans-serif
    }
  }
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const MATCH_HEIGHT = 60   // vertical slot per match in round 1
const BOX_H = 44          // match box height
const BOX_W = 180         // match box width
const ROUND_WIDTH = 220   // horizontal space per round (box + connector gap)
const HEADER_HEIGHT = 40  // space for round headers
const PADDING = 20        // canvas edge padding

// Colours
const BG_COLOR = '#2b2d31'
const BOX_COLOR = '#3b3d45'
const BOX_BORDER = '#5d6069'
const TEXT_WHITE = '#ffffff'
const TEXT_GRAY = '#b5bac1'
const WIN_BOX_COLOR = '#2d7d46'
const LINE_COLOR = '#5d6069'
const GOLD_COLOR = '#ffd700'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nextPowerOf2(n: number): number {
  let p = 1
  while (p < n) p <<= 1
  return p
}

function roundName(round: number, totalRounds: number): string {
  if (round === totalRounds) return '決勝'
  if (round === totalRounds - 1 && totalRounds > 2) return '準決勝'
  return `Round ${round}`
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen - 1) + '…'
}

// ─── Main drawing logic ───────────────────────────────────────────────────────

export class BracketImageService {
  static async generateBracketImage(tournamentId: number): Promise<Buffer> {
    registerFonts()

    const tournament = await TournamentModel.getById(tournamentId)
    if (!tournament) throw new Error(`Tournament ${tournamentId} not found`)

    const matches = await TournamentMatchModel.getByTournamentWithParticipants(tournamentId)
    if (matches.length === 0) throw new Error('No matches found')

    // Group matches by round
    const roundsMap = new Map<number, MatchWithParticipants[]>()
    for (const m of matches) {
      if (!roundsMap.has(m.round)) roundsMap.set(m.round, [])
      roundsMap.get(m.round)!.push(m)
    }

    const numRounds = roundsMap.size > 0 ? Math.max(...roundsMap.keys()) : 1
    const round1Matches = roundsMap.get(1) ?? []
    // Count non-bye matches for sizing; but slots determine the grid
    const totalSlots = nextPowerOf2(round1Matches.length > 0 ? round1Matches.length : 1)
    const maxMatchesInRound1 = totalSlots / 2  // first-round match count (including byes)

    const canvasHeight = Math.max(400, maxMatchesInRound1 * (MATCH_HEIGHT + 10) + HEADER_HEIGHT + PADDING * 2 + 40)
    const canvasWidth = numRounds * ROUND_WIDTH + PADDING * 2

    const canvas = createCanvas(canvasWidth, canvasHeight)
    const ctx = canvas.getContext('2d')

    // Choose font family
    const fontFamily = 'JapaneseGothic, sans-serif'

    // Background
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    // Title
    ctx.fillStyle = GOLD_COLOR
    ctx.font = `bold 18px ${fontFamily}`
    ctx.fillText(truncate(tournament.name, 40), PADDING, PADDING + 18)

    // For each round: calculate positions and draw
    // Round R has ceil(maxMatchesInRound1 / 2^(R-1)) matches
    // Each match in round R occupies a vertical slot of matchSlotH * 2^(R-1)
    const baseSlotH = MATCH_HEIGHT + 10  // slot height per match in round 1

    // Collect match positions for connector drawing
    const matchPositions = new Map<string, { x: number; y: number; midY: number }>()

    for (let r = 1; r <= numRounds; r++) {
      const roundMatches = [...(roundsMap.get(r) ?? [])].sort((a, b) => a.match_number - b.match_number)
      const slotH = baseSlotH * Math.pow(2, r - 1)

      // x position for this round's boxes
      const x = PADDING + (r - 1) * ROUND_WIDTH

      // Round header
      const rName = roundName(r, numRounds)
      ctx.fillStyle = GOLD_COLOR
      ctx.font = `bold 13px ${fontFamily}`
      const titleY = PADDING + 30 + HEADER_HEIGHT - 8
      ctx.fillText(rName, x, titleY)

      for (const match of roundMatches) {
        if (match.status === 'bye') continue

        const matchIdx = match.match_number - 1
        // Center the box within its vertical slot
        const slotTop = PADDING + 30 + HEADER_HEIGHT + matchIdx * slotH
        const boxY = slotTop + (slotH - BOX_H) / 2
        const midY = boxY + BOX_H / 2

        // Store position for connectors
        matchPositions.set(`${r}:${match.match_number}`, { x, y: boxY, midY })

        // Draw match box (split into two halves)
        const halfH = BOX_H / 2

        // Determine winner
        const winnerId = match.winner_id != null ? Number(match.winner_id) : null
        const p1Id = match.participant1_id != null ? Number(match.participant1_id) : null
        const p2Id = match.participant2_id != null ? Number(match.participant2_id) : null
        const p1Won = match.status === 'completed' && winnerId !== null && winnerId === p1Id
        const p2Won = match.status === 'completed' && winnerId !== null && winnerId === p2Id

        // P1 half (top)
        ctx.fillStyle = p1Won ? WIN_BOX_COLOR : BOX_COLOR
        ctx.strokeStyle = BOX_BORDER
        ctx.lineWidth = 1
        roundedRect(ctx, x, boxY, BOX_W, halfH, 6, true, false)

        // P2 half (bottom)
        ctx.fillStyle = p2Won ? WIN_BOX_COLOR : BOX_COLOR
        roundedRect(ctx, x, boxY + halfH, BOX_W, halfH, 6, false, true)

        // Border around whole box
        ctx.strokeStyle = BOX_BORDER
        ctx.lineWidth = 1
        roundedRectStroke(ctx, x, boxY, BOX_W, BOX_H, 6)

        // Divider line between halves
        ctx.strokeStyle = BOX_BORDER
        ctx.lineWidth = 0.5
        ctx.beginPath()
        ctx.moveTo(x, boxY + halfH)
        ctx.lineTo(x + BOX_W, boxY + halfH)
        ctx.stroke()

        // Text
        const p1Name = match.p1_name ?? 'TBD'
        const p1Rank = match.p1_rank ?? ''
        const p2Name = match.p2_name ?? 'TBD'
        const p2Rank = match.p2_rank ?? ''

        const textPad = 8
        const nameMaxW = BOX_W - textPad * 2 - (p1Rank ? 35 : 0)

        // P1 name
        ctx.fillStyle = TEXT_WHITE
        ctx.font = `${p1Won ? 'bold ' : ''}11px ${fontFamily}`
        ctx.fillText(truncate(p1Name, 18), x + textPad, boxY + halfH * 0.65)

        // P1 rank
        if (p1Rank) {
          ctx.fillStyle = TEXT_GRAY
          ctx.font = `10px ${fontFamily}`
          ctx.fillText(p1Rank, x + BOX_W - textPad - ctx.measureText(p1Rank).width, boxY + halfH * 0.65)
        }

        // P2 name
        ctx.fillStyle = TEXT_WHITE
        ctx.font = `${p2Won ? 'bold ' : ''}11px ${fontFamily}`
        ctx.fillText(truncate(p2Name, 18), x + textPad, boxY + halfH + halfH * 0.65)

        // P2 rank
        if (p2Rank) {
          ctx.fillStyle = TEXT_GRAY
          ctx.font = `10px ${fontFamily}`
          ctx.fillText(p2Rank, x + BOX_W - textPad - ctx.measureText(p2Rank).width, boxY + halfH + halfH * 0.65)
        }
      }
    }

    // Draw connector lines from round R to round R+1
    for (let r = 1; r < numRounds; r++) {
      const roundMatches = [...(roundsMap.get(r) ?? [])].sort((a, b) => a.match_number - b.match_number)
      const nextRoundMatches = roundsMap.get(r + 1) ?? []

      for (const match of roundMatches) {
        if (match.status === 'bye') continue

        const pos = matchPositions.get(`${r}:${match.match_number}`)
        if (!pos) continue

        const nextMatchNumber = Math.ceil(match.match_number / 2)
        const nextMatch = nextRoundMatches.find(m => m.match_number === nextMatchNumber)
        if (!nextMatch || nextMatch.status === 'bye') continue

        const nextPos = matchPositions.get(`${r + 1}:${nextMatchNumber}`)
        if (!nextPos) continue

        // Horizontal line from right edge of current box to midpoint
        const midX = pos.x + BOX_W + (ROUND_WIDTH - BOX_W) / 2

        ctx.strokeStyle = LINE_COLOR
        ctx.lineWidth = 1.5
        ctx.setLineDash([])

        // Line from right of current box to midpoint
        ctx.beginPath()
        ctx.moveTo(pos.x + BOX_W, pos.midY)
        ctx.lineTo(midX, pos.midY)
        ctx.stroke()

        // Vertical line at midpoint connecting the two feeder matches
        // Only draw the vertical part for the "lower" of each pair (even match_number)
        if (match.match_number % 2 === 0) {
          // Find the sibling match (odd, same pair)
          const siblingMatch = roundMatches.find(m => m.match_number === match.match_number - 1)
          const siblingPos = siblingMatch ? matchPositions.get(`${r}:${siblingMatch.match_number}`) : null

          if (siblingPos) {
            // Vertical connector
            ctx.beginPath()
            ctx.moveTo(midX, siblingPos.midY)
            ctx.lineTo(midX, pos.midY)
            ctx.stroke()
          }

          // Horizontal line from midpoint to left edge of next match box
          ctx.beginPath()
          ctx.moveTo(midX, nextPos.midY)
          ctx.lineTo(nextPos.x, nextPos.midY)
          ctx.stroke()
        } else if (match.match_number % 2 === 1) {
          // For odd match, just draw the horizontal to midX
          // The vertical + right-side horizontal is drawn by the even sibling
          // But if there's no sibling (solo match going into final), draw full connector
          const siblingMatch = roundMatches.find(m => m.match_number === match.match_number + 1 && m.status !== 'bye')
          if (!siblingMatch) {
            ctx.beginPath()
            ctx.moveTo(midX, pos.midY)
            ctx.lineTo(nextPos.x, nextPos.midY)
            ctx.stroke()
          }
        }
      }
    }

    return canvas.toBuffer('image/png')
  }

  static async formatBracketAsAttachment(tournamentId: number): Promise<{ attachment: AttachmentBuilder; embed: EmbedBuilder }> {
    const tournament = await TournamentModel.getById(tournamentId)
    if (!tournament) throw new Error(`Tournament ${tournamentId} not found`)

    const buffer = await BracketImageService.generateBracketImage(tournamentId)
    const attachment = new AttachmentBuilder(buffer, { name: 'bracket.png' })

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`🏆 ${tournament.name}`)
      .setImage('attachment://bracket.png')
      .setTimestamp()
      .setFooter({ text: 'ブラケット表示' })

    return { attachment, embed }
  }
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function roundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  roundTop: boolean,
  roundBottom: boolean
): void {
  const tl = roundTop ? r : 0
  const tr = roundTop ? r : 0
  const bl = roundBottom ? r : 0
  const br = roundBottom ? r : 0

  ctx.beginPath()
  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y)
  if (tr > 0) ctx.arcTo(x + w, y, x + w, y + tr, tr)
  else ctx.lineTo(x + w, y)
  ctx.lineTo(x + w, y + h - br)
  if (br > 0) ctx.arcTo(x + w, y + h, x + w - br, y + h, br)
  else ctx.lineTo(x + w, y + h)
  ctx.lineTo(x + bl, y + h)
  if (bl > 0) ctx.arcTo(x, y + h, x, y + h - bl, bl)
  else ctx.lineTo(x, y + h)
  ctx.lineTo(x, y + tl)
  if (tl > 0) ctx.arcTo(x, y, x + tl, y, tl)
  else ctx.lineTo(x, y)
  ctx.closePath()
  ctx.fill()
}

function roundedRectStroke(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
  ctx.stroke()
}
