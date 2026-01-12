import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { GGST_CHARACTERS } from '../config/constants';
import { UserModel } from '../models/User';
import { MatchModel } from '../models/Match';
import { StrategyModel } from '../models/Strategy';
import { CommonStrategyModel } from '../models/CommonStrategy';

// キャラクター名を事前にキャッシュ（パフォーマンス最適化）
const CHARACTERS_CACHE = GGST_CHARACTERS.map(char => ({ name: char, value: char }));

export const data = new SlashCommandBuilder()
  .setName('ggst-match')
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
  );

export async function autocomplete(interaction: AutocompleteInteraction) {
  try {
    const focusedValue = interaction.options.getFocused().toLowerCase();

    if (!focusedValue) {
      // 入力なしの場合は全キャラを返す（最大25件）
      return await interaction.respond(CHARACTERS_CACHE.slice(0, 25));
    }

    const filtered = CHARACTERS_CACHE.filter(char =>
      char.name.toLowerCase().includes(focusedValue)
    );

    await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[match] Autocomplete error:', error);
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const opponent = interaction.options.getString('opponent', true);
  const myCharacterInput = interaction.options.getString('mycharacter');

  // ユーザーを取得または作成
  const user = await UserModel.findOrCreate(userId);

  // 使用キャラを決定（指定がなければメインキャラ）
  const myCharacter = myCharacterInput || user.main_character;

  if (!myCharacter) {
    await interaction.reply({
      content: 'まず `/ggst-setmychar` コマンドでメインキャラクターを設定してください。',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  // 対戦成績を取得（使用キャラでフィルタリング）
  const stats = await MatchModel.getStats(userId, opponent, myCharacter);
  const winRate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(1) : '0.0';

  // 直近の対戦記録を取得（最大5件、使用キャラでフィルタリング）
  const recentMatches = await MatchModel.getByUser(userId, 5, opponent, myCharacter);

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
    value: myCharacter,
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
