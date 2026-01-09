import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { GGST_CHARACTERS } from '../config/constants';
import { UserModel } from '../models/User';
import { StrategyModel } from '../models/Strategy';

export const data = new SlashCommandBuilder()
  .setName('ggst-strategy')
  .setDescription('[GGST] 個人専用の戦略を管理します')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('個人戦略を追加します')
      .addStringOption(option =>
        option
          .setName('character')
          .setDescription('対策対象キャラクター')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('content')
          .setDescription('戦略内容')
          .setRequired(true)
          .setMaxLength(2000)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('個人戦略を表示します')
      .addStringOption(option =>
        option
          .setName('character')
          .setDescription('対策対象キャラクター')
          .setRequired(true)
          .setAutocomplete(true)
      )
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
  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  // ユーザーを取得または作成
  await UserModel.findOrCreate(userId);

  if (subcommand === 'add') {
    const character = interaction.options.getString('character', true);
    const content = interaction.options.getString('content', true);

    // 個人戦略を追加
    await StrategyModel.create(userId, character, content, 'user');

    await interaction.reply({
      content: `💡 個人戦略を登録しました\n\n対象キャラ: ${character}\n内容: ${content}\n\nこの情報は次回の \`/ggst-match\` コマンドで自動表示されます。`,
      flags: MessageFlags.Ephemeral
    });
  } else if (subcommand === 'view') {
    const character = interaction.options.getString('character', true);

    // 個人戦略を取得
    const strategies = await StrategyModel.getByCharacter(userId, character);

    if (strategies.length === 0) {
      await interaction.reply({
        content: `${character}への個人戦略はまだ登録されていません。\n\`/ggst-strategy add\` で追加してください。`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xffaa00)
      .setTitle(`💡 ${character}への個人戦略`)
      .setTimestamp();

    const strategiesText = strategies.map((strat, index) => {
      const date = new Date(strat.created_at).toLocaleDateString('ja-JP');
      return `${index + 1}. [${date}]\n${strat.strategy_content}`;
    }).join('\n\n');

    embed.setDescription(strategiesText);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
