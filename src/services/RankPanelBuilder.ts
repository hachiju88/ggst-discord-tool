import {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { RankTrackingService, TrackedPlayer, RatingObservation } from './RankTrackingService';
import { renderHistoryGraph, GraphSeries, PALETTE, RP_RANK_TIERS, RankTier } from './RankGraphService';
import { truncate, escapeMarkdown } from '../utils/text';
import { DR_OFFSET, DR_RANK_TIERS, decodeRating, RatingKind } from '../constants/dr-ranks';

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

// kind を指定すると、その種別の観測だけを残し、DR は実値(rating-DR_OFFSET)に
// デコードした上でサンプリングする。グラフ用に値スケールを揃える狙い。
function sampleObservations(
  obs: RatingObservation[],
  days: number,
  kind?: RatingKind,
): { t: Date; rating: number }[] {
  const filtered = kind
    ? obs.filter(o => (kind === 'DR' ? o.rating > DR_OFFSET : o.rating <= DR_OFFSET))
    : obs;
  const decoded = filtered.map(o => ({
    ...o,
    rating: kind === 'DR' ? o.rating - DR_OFFSET : o.rating,
  }));

  const config = PERIOD_CONFIGS[days];
  if (!config) return decoded.map(o => ({ t: new Date(o.observed_at), rating: o.rating }));

  const now = Date.now();
  const windowStartMs = now - days * DAY_MS;

  const sorted = decoded
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

type PlayerStat = {
  obs: RatingObservation[];
  kind: RatingKind | null;     // 最新観測のkind。観測がなければnull
  latestValue: number | null;  // デコード済み実値
  delta: number | null;        // 同kind比較のdelta。昇格を跨ぐ場合はnull
};

async function computeStats(
  tracked: TrackedPlayer[],
  days: number,
): Promise<PlayerStat[]> {
  const stats: PlayerStat[] = [];

  for (const tp of tracked) {
    const observations = await RankTrackingService.getObservations(
      tp.puddle_player_id,
      tp.char_short,
      days,
    );

    if (observations.length === 0) {
      stats.push({ obs: observations, kind: null, latestValue: null, delta: null });
      continue;
    }

    // getObservations は ORDER BY observed_at ASC で返すのでソート済み。
    const latest = observations[observations.length - 1];
    const decodedLatest = decodeRating(latest.rating);

    // 「24h delta」は最新観測が直近24h以内にある場合のみ意味を持つ。
    // 5日前の観測しか無いプレイヤーで「+0」と出すと「最近変動が無い」と
    // 誤読されるため、その場合は null(「—」表示) にする。
    const now = Date.now();
    const latestTime = new Date(latest.observed_at).getTime();
    if (now - latestTime > 24 * 3600 * 1000) {
      stats.push({ obs: observations, kind: decodedLatest.kind, latestValue: decodedLatest.value, delta: null });
      continue;
    }

    // 24h前との比較。最新と最も近い「24h以上前」の観測を1つ取り、kindが一致
    // していれば差分を返す。kind不一致(昇格/降格を跨ぐ)の場合は walk past せず
    // null を返す ── 数日〜数週間前の観測まで遡って「24h delta」と表示する誤りを防ぐ。
    const cutoff24h = now - 24 * 3600 * 1000;
    const before = [...observations].reverse().find(
      o => new Date(o.observed_at).getTime() <= cutoff24h,
    );
    const delta = before && decodeRating(before.rating).kind === decodedLatest.kind
      ? decodedLatest.value - decodeRating(before.rating).value
      : null;
    stats.push({ obs: observations, kind: decodedLatest.kind, latestValue: decodedLatest.value, delta });
  }

  return stats;
}

type GroupItem = {
  tp: TrackedPlayer;
  stat: PlayerStat;
};

function buildEmbedForGroup(
  items: GroupItem[],
  kind: RatingKind,
  days: number,
  postChannel: string,
  graphFileName: string,
  hasGraph: boolean,
): EmbedBuilder {
  const isDr = kind === 'DR';
  const embed = new EmbedBuilder()
    .setColor(isDr ? 0xf1c40f : 0x5865f2)
    .setTitle(`${isDr ? '🎖️' : '📊'} ランク追跡 ${isDr ? 'DR / 闘神' : 'RP'} (直近 ${labelForDays(days)})`)
    .setFooter({ text: `投稿先: ${postChannel} | 期間: ${labelForDays(days)}` })
    .setTimestamp();

  const lines = items.map(({ tp, stat }) => {
    const url = `https://puddle.farm/player/${tp.puddle_player_id}/${tp.char_short}`;
    const displayName = escapeMarkdown(truncate(tp.display_name, 14));
    const charDisplay = escapeMarkdown(tp.char_long || tp.char_short);
    const nameLabel = `${displayName} (${charDisplay})`;
    const ratingStr = stat.latestValue !== null
      ? `**${stat.latestValue.toFixed(0)}** (${formatDelta(stat.delta)})`
      : '*(データなし)*';
    return `[${nameLabel}](${url}) — ${ratingStr}`;
  });
  embed.setDescription(lines.join('\n'));

  if (hasGraph) {
    embed.setImage(`attachment://${graphFileName}`);
  }
  // hasGraph=false の場合、各行が既に '*(データなし)*' を表示しているので
  // 別途「⏳ データ取得中」フィールドは追加しない(冗長表示の回避)。

  return embed;
}

function buildGraphForGroup(
  items: GroupItem[],
  kind: RatingKind,
  days: number,
  fileName: string,
  tiers: RankTier[],
): AttachmentBuilder | null {
  // サンプリング結果ではなく生データの有無で判定。
  // 取得済みデータがあるのにバケット範囲外で空になり「データ取得中」と
  // 誤表示するのを防ぐ(プレイヤーが選択期間より前にだけプレイした場合など)。
  const hasAnyRaw = items.some(({ stat }) =>
    stat.obs.some(o => (kind === 'DR' ? o.rating > DR_OFFSET : o.rating <= DR_OFFSET)),
  );
  if (!hasAnyRaw) return null;

  // 群内のローカルインデックスで色を割り当てる。元の allTracked のインデックスを
  // 使うと、群を跨ぐ際に PALETTE スロットが余っていても同色が衝突しうる。
  const series: GraphSeries[] = items.map(({ tp, stat }, i) => ({
    label: `${truncate(tp.display_name, 10)} (${tp.char_short})`,
    color: PALETTE[i % PALETTE.length],
    points: sampleObservations(stat.obs, days, kind),
  }));

  const buf = renderHistoryGraph(series, days, tiers);
  return new AttachmentBuilder(buf, { name: fileName });
}

export async function buildPanel(options: PanelOptions): Promise<PanelPayload> {
  const { guildId, days, filterByDiscordId, channelName } = options;

  let allTracked = await RankTrackingService.getGuildTracking(guildId);
  if (filterByDiscordId) {
    allTracked = allTracked.filter(tp => tp.added_by_discord_id === filterByDiscordId);
  }

  const config = await RankTrackingService.getPostConfig(guildId);
  const postChannel = channelName ?? (config ? `<#${config.channel_id}>` : '未設定');

  const isMineView = !!filterByDiscordId;

  // 追跡対象ゼロの場合は単独embedで案内のみ。
  if (allTracked.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`📊 ランク追跡 (直近 ${labelForDays(days)})`)
      .setFooter({ text: `投稿先: ${postChannel} | 期間: ${labelForDays(days)}` })
      .setTimestamp()
      .setDescription(
        isMineView
          ? 'あなたが登録したプレイヤーはまだありません。'
          : '追跡対象がありません。\n**追加**ボタンから puddle.farm のプレイヤーを登録してください。',
      );
    return { embeds: [embed], files: [], components: buildComponents(days, isMineView) };
  }

  const stats = await computeStats(allTracked, days);

  // RP / DR 振り分け。観測なし(kind===null) は RP 扱いで末尾に。
  const rpItems: GroupItem[] = [];
  const drItems: GroupItem[] = [];
  allTracked.forEach((tp, i) => {
    const stat = stats[i];
    const item: GroupItem = { tp, stat };
    if (stat.kind === 'DR') drItems.push(item);
    else rpItems.push(item);
  });

  // レート値降順ソート。データなし(latestValue===null)は末尾。両者nullの場合は0を返す
  // (-Infinity 同士の引き算で NaN になりエンジン依存のソートに陥るのを避ける)。
  const byValueDesc = (a: GroupItem, b: GroupItem) => {
    const av = a.stat.latestValue;
    const bv = b.stat.latestValue;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av;
  };
  rpItems.sort(byValueDesc);
  drItems.sort(byValueDesc);

  const embeds: EmbedBuilder[] = [];
  const files: AttachmentBuilder[] = [];

  if (rpItems.length > 0) {
    const fileName = 'rank-history-rp.png';
    const attachment = buildGraphForGroup(rpItems, 'RP', days, fileName, RP_RANK_TIERS);
    if (attachment) files.push(attachment);
    embeds.push(buildEmbedForGroup(rpItems, 'RP', days, postChannel, fileName, attachment !== null));
  }

  if (drItems.length > 0) {
    const fileName = 'rank-history-dr.png';
    const attachment = buildGraphForGroup(drItems, 'DR', days, fileName, DR_RANK_TIERS);
    if (attachment) files.push(attachment);
    embeds.push(buildEmbedForGroup(drItems, 'DR', days, postChannel, fileName, attachment !== null));
  }

  return { embeds, files, components: buildComponents(days, isMineView) };
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
