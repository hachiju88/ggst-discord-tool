import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { GGST_CHARACTERS } from '../config/constants';
import { UserModel } from '../models/User';
import { MatchModel } from '../models/Match';
import { StrategyModel } from '../models/Strategy';
import { CommonStrategyModel } from '../models/CommonStrategy';

export const data = new SlashCommandBuilder()
  .setName('ggst-match')
  .setDescription('[GGST] 対戦開始時の情報を表示します')
  .addStringOption(option =>
    option
      .setName('opponent')
      .setDescription('対戦相手のキャラクター')
      .setRequired(true)
      .setAutocomplete(true)
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
  const opponent = interaction.options.getString('opponent', true);

  // ユーザーを取得または作成
  const user = await UserModel.findOrCreate(userId);
  const mainChar = user.main_character;

  if (!mainChar) {
    await interaction.reply({
      content: 'まず `/ggst-setmychar` コマンドでメインキャラクターを設定してください。',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  // 対戦成績を取得
  const stats = await MatchModel.getStats(userId, opponent);
  const winRate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(1) : '0.0';

  // 直近の対戦記録を取得（最大5件）
  const recentMatches = await MatchModel.getByUser(userId, 5, opponent);

  // 個人戦略を取得
  const personalStrategies = await StrategyModel.getByCharacter(userId, opponent);

  // 共通戦略を取得
  const commonStrategies = await CommonStrategyModel.getByCharacter(opponent);

  // Embed作成
  const embed = new EmbedBuilder()
    .setColor(0xff4500)
    .setTitle(`⚔️ vs ${opponent} の対戦情報`)
    .setTimestamp();

  // 自分のキャラ
  embed.addFields({
    name: '【あなたのキャラ】',
    value: mainChar,
    inline: false
  });

  // 過去の戦績
  const statsText = stats.total > 0
    ? `総対戦数: ${stats.total}戦\n勝利: ${stats.wins}勝 / 敗北: ${stats.losses}敗\n勝率: ${winRate}%`
    : `まだ対戦記録がありません`;

  embed.addFields({
    name: '【過去の戦績】',
    value: statsText,
    inline: false
  });

  // 個人戦略
  if (personalStrategies.length > 0) {
    const personalText = personalStrategies.map((strat, i) =>
      `${i + 1}. ${strat.strategy_content}`
    ).join('\n');

    embed.addFields({
      name: '【あなたの戦略メモ】',
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
      const resultEmoji = match.result === 'win' ? '✅' : '❌';
      const resultText = match.result === 'win' ? '勝利' : '敗北';
      let text = `[${date}] ${resultEmoji}${resultText}`;
      if (match.note) {
        text += `: ${match.note}`;
      }
      return text;
    }).join('\n');

    embed.addFields({
      name: '【直近の対戦メモ】',
      value: recentText,
      inline: false
    });
  }

  embed.setFooter({ text: '頑張ってください！🔥' });

  await interaction.reply({ embeds: [embed] });

  // 共通対策情報をテキストで送信（読み上げ用）
  if (commonStrategies.length > 0) {
    const commonText = commonStrategies.map(strat =>
      strat.strategy_content
    ).join(' ');

    await interaction.followUp({ content: commonText });
  }
}
