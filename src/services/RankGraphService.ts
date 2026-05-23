import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import * as fs from 'fs';
import { truncate } from '../utils/text';

let fontsRegistered = false;
function registerFonts(): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  const candidates = [
    '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',
    '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try { GlobalFonts.registerFromPath(p, 'JapaneseGothic'); } catch {}
      break;
    }
  }
}

export type GraphSeries = {
  label: string;
  color: string;
  points: { t: Date; rating: number }[];
};

export const PALETTE = [
  '#5865f2', '#57f287', '#ed4245', '#fee75c', '#eb459e',
  '#00b0f4', '#f47b67', '#b388ff', '#95a5a6', '#1abc9c',
];

// Logical coordinates (drawing code uses these). Output PNG is scaled up by
// SCALE for higher-resolution rendering — see ctx.scale(SCALE, SCALE) below.
const SCALE = 2;
const W = 900;
const H = 420;
const PAD_LEFT = 65;
const PAD_RIGHT = 20;
const PAD_BOTTOM = 38;
const LEGEND_LINE_H = 18;

const BG = '#2b2d31';
const GRID = '#3f4147';
const LABEL_CLR = '#b5bac1';
const WHITE = '#ffffff';

export type RankTier = { name: string; min: number; color: string };

// GGST タワーレート換算でのランク境界(各ランクの最低値)。RP 用。
export const RP_RANK_TIERS: RankTier[] = [
  { name: 'Vanquisher', min: 45000, color: '#d4a3ff' },
  { name: 'Diamond 3',  min: 40800, color: '#8ec5ff' },
  { name: 'Diamond 2',  min: 36000, color: '#8ec5ff' },
  { name: 'Diamond 1',  min: 32400, color: '#8ec5ff' },
  { name: 'Platinum 3', min: 28400, color: '#a8e0e8' },
  { name: 'Platinum 2', min: 24400, color: '#a8e0e8' },
  { name: 'Platinum 1', min: 20400, color: '#a8e0e8' },
  { name: 'Gold 3',     min: 18000, color: '#f0d878' },
  { name: 'Gold 2',     min: 15600, color: '#f0d878' },
  { name: 'Gold 1',     min: 13200, color: '#f0d878' },
  { name: 'Silver 3',   min: 11000, color: '#c0c8d0' },
  { name: 'Silver 2',   min:  8800, color: '#c0c8d0' },
  { name: 'Silver 1',   min:  6600, color: '#c0c8d0' },
  { name: 'Bronze 3',   min:  5400, color: '#d49a78' },
  { name: 'Bronze 2',   min:  4200, color: '#d49a78' },
  { name: 'Bronze 1',   min:  3000, color: '#d49a78' },
  { name: 'Iron 3',     min:  2000, color: '#c5b58c' },
  { name: 'Iron 2',     min:  1000, color: '#c5b58c' },
];

function snapToStep(value: number, step: number, fn: 'floor' | 'ceil'): number {
  return fn === 'floor' ? Math.floor(value / step) * step : Math.ceil(value / step) * step;
}

export function renderHistoryGraph(
  series: GraphSeries[],
  windowDays: number,
  tiers: RankTier[] = RP_RANK_TIERS,
): Buffer {
  registerFonts();
  const ff = 'JapaneseGothic, sans-serif';

  const allRatings = series.flatMap(s => s.points.map(p => p.rating));
  const hasData = allRatings.length > 0;

  const rawMin = hasData ? Math.min(...allRatings) : 1500;
  const rawMax = hasData ? Math.max(...allRatings) : 1600;
  const padding = Math.max((rawMax - rawMin) * 0.1, 30);
  const minRating = snapToStep(rawMin - padding, 50, 'floor');
  const maxRating = snapToStep(rawMax + padding, 50, 'ceil');
  const ratingRange = maxRating - minRating || 100;

  const legendRows = Math.ceil(series.length / 6);
  const PAD_TOP = Math.max(30, legendRows * LEGEND_LINE_H + 12);
  const CHART_W = W - PAD_LEFT - PAD_RIGHT;
  const CHART_H = H - PAD_TOP - PAD_BOTTOM;

  const now = Date.now();
  const windowMs = windowDays * 24 * 3600 * 1000;
  const startTime = now - windowMs;

  const toY = (r: number) => PAD_TOP + CHART_H - ((r - minRating) / ratingRange) * CHART_H;
  const toX = (t: Date) => PAD_LEFT + Math.max(0, Math.min(1, (t.getTime() - startTime) / windowMs)) * CHART_W;

  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Y-axis grid + labels
  const ySteps = 5;
  ctx.font = `11px ${ff}`;
  for (let i = 0; i <= ySteps; i++) {
    const r = minRating + (ratingRange / ySteps) * i;
    const y = toY(r);
    ctx.strokeStyle = GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD_LEFT, y);
    ctx.lineTo(W - PAD_RIGHT, y);
    ctx.stroke();
    ctx.fillStyle = LABEL_CLR;
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(r).toString(), PAD_LEFT - 6, y + 4);
  }

  // Rank tier boundaries (overlay on the numeric grid)
  ctx.font = `bold 10px ${ff}`;
  for (const tier of tiers) {
    if (tier.min <= minRating || tier.min >= maxRating) continue;
    const y = toY(tier.min);
    ctx.strokeStyle = tier.color;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(PAD_LEFT, y);
    ctx.lineTo(W - PAD_RIGHT, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = tier.color;
    ctx.textAlign = 'right';
    ctx.fillText(tier.name, W - PAD_RIGHT - 4, y - 3);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  // X-axis labels
  const tickCount = Math.min(6, windowDays);
  ctx.textAlign = 'center';
  ctx.fillStyle = LABEL_CLR;
  ctx.font = `11px ${ff}`;
  for (let i = 0; i <= tickCount; i++) {
    const t = new Date(startTime + (windowMs / tickCount) * i);
    const x = PAD_LEFT + (i / tickCount) * CHART_W;
    const label = `${(t.getMonth() + 1).toString().padStart(2, '0')}/${t.getDate().toString().padStart(2, '0')}`;
    ctx.fillText(label, x, H - 8);
  }
  ctx.textAlign = 'left';

  // Legend
  const entriesPerRow = 6;
  for (let i = 0; i < series.length; i++) {
    const row = Math.floor(i / entriesPerRow);
    const col = i % entriesPerRow;
    const s = series[i];
    const label = truncate(s.label, 18);
    const entryW = Math.floor(CHART_W / Math.min(entriesPerRow, series.length - row * entriesPerRow));
    const lx = PAD_LEFT + col * entryW;
    const ly = 8 + row * LEGEND_LINE_H;
    ctx.fillStyle = s.color;
    ctx.fillRect(lx, ly, 10, 10);
    ctx.fillStyle = WHITE;
    ctx.font = `12px ${ff}`;
    ctx.fillText(label, lx + 14, ly + 9);
  }

  // Chart border
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD_LEFT, PAD_TOP, CHART_W, CHART_H);

  // Series lines
  for (const s of series) {
    if (s.points.length === 0) continue;
    const pts = s.points
      .filter(p => p.t.getTime() >= startTime)
      .sort((a, b) => a.t.getTime() - b.t.getTime())
      .map(p => ({ x: toX(p.t), y: toY(p.rating) }));
    if (pts.length === 0) continue;

    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.5;

    if (pts.length === 1) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      // Endpoint dot
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(pts[pts.length - 1].x, pts[pts.length - 1].y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return canvas.toBuffer('image/png');
}
