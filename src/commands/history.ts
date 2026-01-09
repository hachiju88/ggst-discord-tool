import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { GGST_CHARACTERS } from '../config/constants';
import { UserModel } from '../models/User';
import { MatchModel } from '../models/Match';

export const data = new SlashCommandBuilder()
  .setName('ggst-history')
  .setDescription('[GGST] 対戦履歴を表示します')
  .addStringOption(option =>
    option
      .setName('character')
      .setDescription('特定のキャラクターに絞り込み（任意）')
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addIntegerOption(option =>
    option
      .setName('limit')
      .setDescription('表示件数（デフォルト: 10、最大: 50）')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(50)
  );

export async function autocomplete(interaction: AutocompleteInteraction) {
  try {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const filtered = GGST_CHARACTERS.filter(char =>
      char.toLowerCase().includes(focusedValue)
    );
    await interaction.respond(
      filtered.slice(0, 25).map(char => ({ name: char, value: char }))
    );
  } catch (error) {
    // Autocomplete エラーは無視（タイムアウトなど）
    console.error('Autocomplete error:', error);
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const characterFilter = interaction.options.getString('character');
  const limit = interaction.options.getInteger('limit') || 10;

  // ユーザーを取得または作成
  const user = await UserModel.findOrCreate(userId);

  // 対戦履歴を取得
  const matches = await MatchModel.getByUser(userId, limit, characterFilter || undefined);

  if (matches.length === 0) {
    await interaction.reply({
      content: characterFilter
        ? `${characterFilter}との対戦記録がありません。`
        : '対戦記録がありません。`/ggst-addnote`コマンドで記録を追加してください。',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  // 全体統計を取得
  const overallStats = await MatchModel.getStats(userId);
  const overallWinRate = overallStats.total > 0
    ? ((overallStats.wins / overallStats.total) * 100).toFixed(1)
    : '0.0';

  // キャラクター別成績を取得
  const charStats = await MatchModel.getStatsByCharacter(userId);

  // Embed作成
  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle(`📊 ${interaction.user.username}の対戦履歴`)
    .setTimestamp();

  // 全体統計
  embed.addFields({
    name: '【全体統計】',
    value: `総対戦数: ${overallStats.total}戦\n勝利: ${overallStats.wins}勝 / 敗北: ${overallStats.losses}敗\n勝率: ${overallWinRate}%`,
    inline: false
  });

  // キャラクター別成績（上位5件）
  if (charStats.length > 0 && !characterFilter) {
    const charStatsText = charStats.slice(0, 5).map(stat =>
      `vs ${stat.character}: ${stat.wins}勝 ${stat.losses}敗 (${stat.winRate.toFixed(1)}%)`
    ).join('\n');

    embed.addFields({
      name: '【キャラ別成績（上位5件）】',
      value: charStatsText,
      inline: false
    });
  }

  // 直近の対戦
  const recentMatchesText = matches.map((match, index) => {
    const date = new Date(match.match_date).toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    const resultEmoji = match.result === 'win' ? '✅' : '❌';
    const resultText = match.result === 'win' ? '勝利' : '敗北';
    let text = `${index + 1}. [${date}] vs ${match.opponent_character} ${resultEmoji}${resultText}`;
    if (match.note) {
      text += `\n   「${match.note}」`;
    }
    return text;
  }).join('\n\n');

  embed.addFields({
    name: characterFilter ? `【vs ${characterFilter}の直近${matches.length}戦】` : `【直近${matches.length}戦】`,
    value: recentMatchesText,
    inline: false
  });

  await interaction.reply({ embeds: [embed] });
}
