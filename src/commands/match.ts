import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { UserModel } from '../models/User';
import { MatchModel } from '../models/Match';
import { StrategyModel } from '../models/Strategy';
import { CommonStrategyModel } from '../models/CommonStrategy';
import { CharacterModel } from '../models/Character';
import { DefeatReasonModel } from '../models/DefeatReason';

export const data = new SlashCommandBuilder()
  .setName('gm')
  .setDescription('[GGST] 対戦開始時の情報を表示します')
  .addStringOption(option =>
    option
      .setName('opponent')
      .setDescription('対戦相手のキャラクター')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(option =>
    option
      .setName('mycharacter')
      .setDescription('使用キャラクター（未指定の場合はメインキャラ）')
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addStringOption(option =>
    option
      .setName('period')
      .setDescription('統計期間（デフォルト: 無期限）')
      .setRequired(false)
      .addChoices(
        { name: '1日', value: '1day' },
        { name: '1週間', value: '1week' },
        { name: '1ヶ月', value: '1month' },
        { name: '無期限', value: 'all' }
      )
  );

export async function autocomplete(interaction: AutocompleteInteraction) {
  try {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const characters = await CharacterModel.getCachedNamesForAutocomplete();

    if (!focusedValue) {
      // 入力なしの場合は全キャラを返す（最大25件）
      return await interaction.respond(characters.slice(0, 25));
    }

    const filtered = characters.filter(char =>
      char.name.toLowerCase().includes(focusedValue) ||
      char.value.toLowerCase().includes(focusedValue)
    );

    await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[match] Autocomplete error:', error);
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  // 重い処理のため、先に応答を延期
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const opponent = interaction.options.getString('opponent', true);
  const myCharacterInput = interaction.options.getString('mycharacter');
  const period = (interaction.options.getString('period') || 'all') as '1day' | '1week' | '1month' | 'all';

  // ユーザーを取得または作成
  const user = await UserModel.findOrCreate(userId);

  // 使用キャラを決定（指定がなければメインキャラ）
  const myCharacter = myCharacterInput || user.main_character;

  if (!myCharacter) {
    await interaction.editReply({
      content: 'まず `/gs` コマンドでメインキャラクターを設定してください。'
    });
    return;
  }

  // 対戦成績を取得（使用キャラ・期間でフィルタリング）
  const stats = await MatchModel.getStats(userId, opponent, myCharacter, period);
  const winRate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(1) : '0.0';

  // 敗因トップ3を取得（期間フィルター適用）
  const defeatReasonStats = await MatchModel.getDefeatReasonStats(userId, opponent, myCharacter, period);

  // 優先度別のコメントを取得
  const criticalComments = await MatchModel.getByUserWithPriority(userId, opponent, myCharacter, 'critical');
  const importantComments = await MatchModel.getByUserWithPriority(userId, opponent, myCharacter, 'important');
  const recommendedComments = await MatchModel.getByUserWithPriority(userId, opponent, myCharacter, 'recommended');

  // 個人戦略を取得
  const personalStrategies = await StrategyModel.getByCharacter(userId, opponent);

  // 共通戦略を取得
  const commonStrategies = await CommonStrategyModel.getByCharacter(opponent);

  // 直近の対戦記録を取得（最大5件、使用キャラ・期間でフィルタリング）
  const recentMatches = await MatchModel.getByUser(userId, 5, opponent, myCharacter, period);

  // Embed作成
  const periodMap = { '1day': '過去1日', '1week': '過去1週間', '1month': '過去1ヶ月', 'all': '全期間' };
  const periodText = period !== 'all' ? ` (${periodMap[period]})` : '';
  const embed = new EmbedBuilder()
    .setColor(0xff4500)
    .setTitle(`⚔️ ${myCharacter} vs ${opponent}${periodText}`)
    .setTimestamp();

  // 過去の戦績
  const statsText = stats.total > 0
    ? `${stats.wins}勝 ${stats.losses}敗（勝率: ${winRate}%）`
    : `まだ対戦記録がありません`;

  embed.addFields({
    name: '【戦績】',
    value: statsText,
    inline: false
  });

  // 敗因トップ3
  if (defeatReasonStats.length > 0) {
    const defeatReasonTexts: string[] = [];
    for (const stat of defeatReasonStats) {
      // defeat_reason_typeを使って直接正しい敗因を取得（効率化）
      const reasonName = await DefeatReasonModel.getReasonDisplayNameById(
        stat.defeat_reason_id,
        stat.defeat_reason_type
      );
      defeatReasonTexts.push(`${reasonName || '不明'}（${stat.count}回）`);
    }

    embed.addFields({
      name: '【敗因トップ3】',
      value: defeatReasonTexts.join('\n'),
      inline: false
    });
  }

  // 優先度別コメント - Critical
  if (criticalComments.length > 0) {
    const criticalTexts = criticalComments.slice(0, 10).map(match => {
      const note = match.note || '（メモなし）';
      return `🔴 ${note}`;
    });

    embed.addFields({
      name: '【🔴 重要（絶対に覚える）】',
      value: criticalTexts.join('\n'),
      inline: false
    });
  }

  // 優先度別コメント - Important
  if (importantComments.length > 0) {
    const importantTexts = importantComments.slice(0, 10).map(match => {
      const note = match.note || '（メモなし）';
      return `🟡 ${note}`;
    });

    embed.addFields({
      name: '【🟡 大事（できれば覚える）】',
      value: importantTexts.join('\n'),
      inline: false
    });
  }

  // 優先度別コメント - Recommended
  if (recommendedComments.length > 0) {
    const recommendedTexts = recommendedComments.slice(0, 10).map(match => {
      const note = match.note || '（メモなし）';
      return `🟢 ${note}`;
    });

    embed.addFields({
      name: '【🟢 推奨（余裕があれば）】',
      value: recommendedTexts.join('\n'),
      inline: false
    });
  }

  // 共通対策情報
  if (commonStrategies.length > 0) {
    const commonText = commonStrategies.slice(0, 10).map(strat =>
      strat.strategy_content
    ).join('\n');

    embed.addFields({
      name: '【共通対策】',
      value: commonText,
      inline: false
    });
  }

  // 個人戦略
  if (personalStrategies.length > 0) {
    const personalText = personalStrategies.slice(0, 10).map(strat =>
      strat.strategy_content
    ).join('\n');

    embed.addFields({
      name: '【個人戦略】',
      value: personalText,
      inline: false
    });
  }

  // 直近の対戦メモ
  if (recentMatches.length > 0) {
    const recentText = recentMatches.map(match => {
      const date = new Date(match.match_date).toLocaleDateString('ja-JP', {
        month: '2-digit',
        day: '2-digit'
      });
      const resultEmoji = match.result === 'win' ? '✅' : match.result === 'loss' ? '❌' : '📝';
      const resultText = match.result === 'win' ? '勝' : match.result === 'loss' ? '敗' : '-';
      let text = `[${date}] ${resultEmoji}${resultText}`;
      if (match.note) {
        text += `: ${match.note}`;
      }
      return text;
    }).join('\n');

    embed.addFields({
      name: '【直近5戦】',
      value: recentText,
      inline: false
    });
  }

  embed.setFooter({ text: '頑張ってください！🔥' });

  await interaction.editReply({ embeds: [embed] });
}
