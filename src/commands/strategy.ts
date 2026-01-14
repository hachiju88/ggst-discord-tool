import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { UserModel } from '../models/User';
import { StrategyModel } from '../models/Strategy';
import { CharacterModel } from '../models/Character';

export const data = new SlashCommandBuilder()
  .setName('gps')
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
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('edit')
      .setDescription('個人戦略を編集します')
      .addIntegerOption(option =>
        option
          .setName('id')
          .setDescription('戦略ID（/gps view で確認）')
          .setRequired(true)
          .setMinValue(1)
      )
      .addStringOption(option =>
        option
          .setName('content')
          .setDescription('新しい戦略内容')
          .setRequired(true)
          .setMaxLength(2000)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('個人戦略を削除します')
      .addIntegerOption(option =>
        option
          .setName('id')
          .setDescription('戦略ID（/gps view で確認）')
          .setRequired(true)
          .setMinValue(1)
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
    console.error('[strategy] Autocomplete error:', error);
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
      content: `💡 個人戦略を登録しました\n\n対象キャラ: ${character}\n内容: ${content}\n\nこの情報は次回の \`/gm\` コマンドで自動表示されます。`,
      flags: MessageFlags.Ephemeral
    });
  } else if (subcommand === 'view') {
    const character = interaction.options.getString('character', true);

    // 個人戦略を取得
    const strategies = await StrategyModel.getByCharacter(userId, character);

    if (strategies.length === 0) {
      await interaction.reply({
        content: `${character}への個人戦略はまだ登録されていません。\n\`/gps add\` で追加してください。`,
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
      return `**ID:${strat.id}** [${date}]\n${strat.strategy_content}`;
    }).join('\n\n');

    embed.setDescription(strategiesText);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  } else if (subcommand === 'edit') {
    const id = interaction.options.getInteger('id', true);
    const content = interaction.options.getString('content', true);

    // 個人戦略を更新
    const updated = await StrategyModel.update(id, userId, content);

    if (!updated) {
      await interaction.reply({
        content: '❌ 戦略が見つからないか、編集権限がありません。',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // キャラクター名を取得
    const character = await CharacterModel.getById(updated.target_character_id);
    const characterName = character?.name || updated.target_character || '不明';

    await interaction.reply({
      content: `✅ 個人戦略を更新しました (ID: ${id})\n\n対象キャラ: ${characterName}\n内容: ${content}`,
      flags: MessageFlags.Ephemeral
    });

  } else if (subcommand === 'delete') {
    const id = interaction.options.getInteger('id', true);

    // 個人戦略を削除
    const deleted = await StrategyModel.delete(id, userId);

    if (!deleted) {
      await interaction.reply({
        content: '❌ 戦略が見つからないか、削除権限がありません。',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.reply({
      content: `✅ 個人戦略を削除しました (ID: ${id})`,
      flags: MessageFlags.Ephemeral
    });
  }
}
