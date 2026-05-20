import {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RankTrackingService, TrackedPlayer, RatingObservation } from './RankTrackingService';
import { renderHistoryGraph, GraphSeries, PALETTE } from './RankGraphService';
import { truncate, escapeMarkdown } from '../utils/text';

export type PanelOptions = {
  guildId: string;
  days: number;
  filterByDiscordId?: string;
  channelName?: string;
};

export type PanelPayload = {
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
};

const DAY_MS = 24 * 3600 * 1000;
const JST_OFFSET_MS = 9 * 3600 * 1000;

type PeriodConfig = {
  intervalDays: number;
  count: number;
};

// 各期間の最初のバケットは「最新時刻」(7dはJSTの今日末、それ以外はnow)。
// テキスト表示の最新レートとグラフの最新点を必ず一致させる狙い。
const PERIOD_CONFIGS: Record<number, PeriodConfig> = {
  7:   { intervalDays: 1,  count: 7  },  // 今日〜6日前 (JST)
  30:  { intervalDays: 5,  count: 7  },  // 0, 5, 10, 15, 20, 25, 30 日前
  90:  { intervalDays: 15, count: 7  },  // 0, 15, ..., 90
  180: { intervalDays: 30, count: 7  },  // 0, 30, ..., 180
  365: { intervalDays: 30, count: 13 },  // 0, 30, ..., 360
};

// 「今日のJST末」= 次のJST午前0時の直前。UTC ms に +9h して DAY_MS で
// floor すれば JST 0:00 (シフト後の UTC ms 表現) が得られる。
function endOfTodayJstMs(nowMs: number): number {
  const jstShifted = nowMs + JST_OFFSET_MS;
  const nextJstMidnightShifted = Math.floor(jstShifted / DAY_MS) * DAY_MS + DAY_MS;
  return nextJstMidnightShifted - JST_OFFSET_MS;
}

function sampleObservations(
  obs: RatingObservation[],
  days: number,
): { t: Date; rating: number }[] {
  const config = PERIOD_CONFIGS[days];
  if (!config) return obs.map(o => ({ t: new Date(o.observed_at), rating: o.rating }));

  const now = Date.now();
  const windowStartMs = now - days * DAY_MS;

  const sorted = obs
    .map(o => ({ ms: new Date(o.observed_at).getTime(), rating: o.rating }))
    .filter(o => o.ms >= windowStartMs)
    .sort((a, b) => a.ms - b.ms);

  if (sorted.length === 0) return [];

  const anchorMs = days === 7 ? endOfTodayJstMs(now) : now;

  const result: { t: Date; rating: number }[] = [];
  let lastPushedMs: number | undefined;

  for (let i = 0; i < config.count; i++) {
    const bucketEndMs = anchorMs - i * config.intervalDays * DAY_MS;
    let found: { ms: number; rating: number } | undefined;
    for (let j = sorted.length - 1; j >= 0; j--) {
      if (sorted[j].ms <= bucketEndMs) { found = sorted[j]; break; }
    }
    // 同じ古い試合が複数バケットで再ヒットしないよう抑止。
    if (found && found.ms !== lastPushedMs) {
      result.push({ t: new Date(found.ms), rating: found.rating });
      lastPushedMs = found.ms;
    }
  }

  // ループは新しい順(i=0が直近) → グラフ用に古い順へ反転
  return result.reverse();
}

function labelForDays(days: number): string {
  if (days === 365) return '1年';
  return `${days}日`;
}

function formatDelta(delta: number | null): string {
  if (delta === null) return '—';
  if (delta > 0) return `+${delta.toFixed(1)}`;
  return delta.toFixed(1);
}

async function computeDeltas(
  tracked: TrackedPlayer[],
  days: number,
): Promise<{
  obs: RatingObservation[][];
  latestRating: (number | null)[];
  delta: (number | null)[];
}> {
  const obs: RatingObservation[][] = [];
  const latestRating: (number | null)[] = [];
  const delta: (number | null)[] = [];

  for (const tp of tracked) {
    const observations = await RankTrackingService.getObservations(
      tp.puddle_player_id,
      tp.char_short,
      days,
    );
    obs.push(observations);

    if (observations.length === 0) {
      latestRating.push(null);
      delta.push(null);
      continue;
    }

    // getObservations は ORDER BY observed_at ASC で返すのでソート済み。
    const latest = observations[observations.length - 1];
    latestRating.push(latest.rating);

    // 「24h delta」は最新観測が直近24h以内にある場合のみ意味を持つ。
    // 5日前の観測しか無いプレイヤーで「+0」と出すと「最近変動が無い」と
    // 誤読されるため、その場合は null(「—」表示) にする。
    const now = Date.now();
    const latestTime = new Date(latest.observed_at).getTime();
    if (now - latestTime > 24 * 3600 * 1000) {
      delta.push(null);
      continue;
    }

    const cutoff24h = now - 24 * 3600 * 1000;
    const before = [...observations].reverse().find(
      o => new Date(o.observed_at).getTime() <= cutoff24h,
    );
    delta.push(before ? latest.rating - before.rating : null);
  }

  return { obs, latestRating, delta };
}

export async function buildPanel(options: PanelOptions): Promise<PanelPayload> {
  const { guildId, days, filterByDiscordId, channelName } = options;

  let allTracked = await RankTrackingService.getGuildTracking(guildId);
  if (filterByDiscordId) {
    allTracked = allTracked.filter(tp => tp.added_by_discord_id === filterByDiscordId);
  }

  const config = await RankTrackingService.getPostConfig(guildId);
  const postChannel = channelName ?? (config ? `<#${config.channel_id}>` : '未設定');

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📈 ランク追跡 (直近 ${labelForDays(days)})`)
    .setFooter({ text: `投稿先: ${postChannel} | 期間: ${labelForDays(days)}` })
    .setTimestamp();

  const isMineView = !!filterByDiscordId;
  const files: AttachmentBuilder[] = [];

  if (allTracked.length === 0) {
    embed.setDescription(
      isMineView
        ? 'あなたが登録したプレイヤーはまだありません。'
        : '追跡対象がありません。\n**追加**ボタンから puddle.farm のプレイヤーを登録してください。',
    );
    return { embeds: [embed], files: [], components: buildComponents(days, isMineView) };
  }

  const { obs, latestRating, delta } = await computeDeltas(allTracked, days);

  // Embed description: one line per tracked player (markdown link).
  // display_name / char_long can contain markdown-meaningful chars — escape them.
  const lines = allTracked.map((tp, i) => {
    const url = `https://puddle.farm/player/${tp.puddle_player_id}/${tp.char_short}`;
    const displayName = escapeMarkdown(truncate(tp.display_name, 14));
    const charDisplay = escapeMarkdown(tp.char_long || tp.char_short);
    const nameLabel = `${displayName} (${charDisplay})`;
    const ratingStr = latestRating[i] !== null ? `**${latestRating[i]!.toFixed(0)}** (${formatDelta(delta[i])})` : '*(データなし)*';
    return `[${nameLabel}](${url}) — ${ratingStr}`;
  });
  embed.setDescription(lines.join('\n'));

  // Graph
  const series: GraphSeries[] = allTracked.map((tp, i) => ({
    label: `${truncate(tp.display_name, 10)} (${tp.char_short})`,
    color: PALETTE[i % PALETTE.length],
    points: sampleObservations(obs[i], days),
  }));

  // サンプリング結果ではなく生データの有無で判定 (取得済みデータがあるのに
  // バケット範囲外で空になり「データ取得中」と誤表示するのを防ぐ)。
  const hasAnyPoints = obs.some(arr => arr.length > 0);
  if (hasAnyPoints) {
    const buf = renderHistoryGraph(series, days);
    const attachment = new AttachmentBuilder(buf, { name: 'rank-history.png' });
    files.push(attachment);
    embed.setImage('attachment://rank-history.png');
  } else {
    embed.addFields({
      name: '⏳ データ取得中',
      value: '次回更新(毎時)まで少々お待ちください。',
    });
  }

  return { embeds: [embed], files, components: buildComponents(days, isMineView) };
}

function buildComponents(
  days: number,
  isMineView: boolean,
): ActionRowBuilder<ButtonBuilder>[] {
  if (isMineView) {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('grank:mine:7').setLabel('7d').setStyle(ButtonStyle.Secondary).setDisabled(days === 7),
        new ButtonBuilder().setCustomId('grank:mine:30').setLabel('30d').setStyle(ButtonStyle.Secondary).setDisabled(days === 30),
        new ButtonBuilder().setCustomId('grank:mine:90').setLabel('90d').setStyle(ButtonStyle.Secondary).setDisabled(days === 90),
        new ButtonBuilder().setCustomId('grank:mine:180').setLabel('180d').setStyle(ButtonStyle.Secondary).setDisabled(days === 180),
        new ButtonBuilder().setCustomId('grank:mine:365').setLabel('1year').setStyle(ButtonStyle.Secondary).setDisabled(days === 365),
      ),
    ];
  }

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`grank:refresh:${days}`).setLabel('🔄 更新').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('grank:add').setLabel('➕ 追加').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('grank:remove').setLabel('➖ 解除').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`grank:mine:${days}`).setLabel('👤 自分のみ').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('grank:period:7').setLabel('7d').setStyle(ButtonStyle.Secondary).setDisabled(days === 7),
      new ButtonBuilder().setCustomId('grank:period:30').setLabel('30d').setStyle(ButtonStyle.Secondary).setDisabled(days === 30),
      new ButtonBuilder().setCustomId('grank:period:90').setLabel('90d').setStyle(ButtonStyle.Secondary).setDisabled(days === 90),
      new ButtonBuilder().setCustomId('grank:period:180').setLabel('180d').setStyle(ButtonStyle.Secondary).setDisabled(days === 180),
      new ButtonBuilder().setCustomId('grank:period:365').setLabel('1year').setStyle(ButtonStyle.Secondary).setDisabled(days === 365),
    ),
  ];
}
