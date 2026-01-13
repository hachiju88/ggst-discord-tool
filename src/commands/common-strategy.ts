import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { UserModel } from '../models/User';
import { CommonStrategyModel } from '../models/CommonStrategy';
import { CharacterModel } from '../models/Character';

export const data = new SlashCommandBuilder()
  .setName('ggst-common-strategy')
  .setDescription('[GGST] 全ユーザー共通の対策情報を管理します')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('共通対策情報を追加します')
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
          .setDescription('対策内容')
          .setRequired(true)
          .setMaxLength(2000)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('共通対策情報を表示します')
      .addStringOption(option =>
        option
          .setName('character')
          .setDescription('対策対象キャラクター')
          .setRequired(true)
          .setAutocomplete(true)
      )
  );

// Alias command
export const aliasData = new SlashCommandBuilder()
  .setName('gcs')
  .setDescription('[GGST] 全ユーザー共通の対策情報を管理します (ggst-common-strategy の短縮形)')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('共通対策情報を追加します')
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
          .setDescription('対策内容')
          .setRequired(true)
          .setMaxLength(2000)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('共通対策情報を表示します')
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
    const characters = await CharacterModel.getCachedNamesForAutocomplete();

    if (!focusedValue) {
      // 入力なしの場合は全キャラを返す（最大25件）
      return await interaction.respond(characters.slice(0, 25));
    }

    const filtered = characters.filter(char =>
      char.name.toLowerCase().includes(focusedValue) ||
      (char.nameEn && char.nameEn.toLowerCase().includes(focusedValue))
    );

    await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[common-strategy] Autocomplete error:', error);
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

    // 共通戦略を追加
    await CommonStrategyModel.create(character, content, userId);

    await interaction.reply({
      content: `🌐 共通対策情報を登録しました\n\n対象キャラ: ${character}\n内容: ${content}\n\nこの情報は全ユーザーの \`/ggst-match\` コマンドで表示されます。`
    });
  } else if (subcommand === 'view') {
    const character = interaction.options.getString('character', true);

    // 共通戦略を取得
    const strategies = await CommonStrategyModel.getByCharacter(character);

    if (strategies.length === 0) {
      await interaction.reply({
        content: `${character}への共通対策情報はまだ登録されていません。\n\`/ggst-common-strategy add\` で追加してください。`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`🌐 ${character}への共通対策情報`)
      .setTimestamp();

    const strategiesText = strategies.map((strat, index) => {
      const date = new Date(strat.created_at).toLocaleDateString('ja-JP');
      return `${index + 1}. [${date}]\n${strat.strategy_content}`;
    }).join('\n\n');

    embed.setDescription(strategiesText);

    await interaction.reply({ embeds: [embed] });
  }
}
