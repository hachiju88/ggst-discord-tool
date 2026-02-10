import { SlashCommandBuilder, EmbedBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction, ModalSubmitInteraction } from 'discord.js';
import { UserModel } from '../models/User';
import { CommonStrategyModel } from '../models/CommonStrategy';
import { CharacterModel } from '../models/Character';
import { checkPermission, PermissionLevel } from '../utils/permissions';




export const data = new SlashCommandBuilder()
  .setName('gcs')
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
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('edit')
      .setDescription('共通対策情報を編集します')
      .addIntegerOption(option =>
        option
          .setName('id')
          .setDescription('対策ID（/gcs view で確認）')
          .setRequired(true)
          .setMinValue(1)
      )
      .addStringOption(option =>
        option
          .setName('content')
          .setDescription('新しい対策内容')
          .setRequired(true)
          .setMaxLength(2000)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('共通対策情報を削除します')
      .addIntegerOption(option =>
        option
          .setName('id')
          .setDescription('対策ID（/gcs view で確認）')
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
    console.error('[common-strategy] Autocomplete error:', error);
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  // ユーザーを取得または作成
  await UserModel.findOrCreate(userId);

  // 権限チェック (add/edit/delete)
  if (['add', 'edit', 'delete'].includes(subcommand)) {
    // 編集権限(EDITOR)が必要
    const hasPermission = await checkPermission(interaction, PermissionLevel.EDITOR);
    if (!hasPermission) return;
  }

  if (subcommand === 'add') {
    const character = interaction.options.getString('character', true);

    // モーダルを作成
    const modal = new ModalBuilder()
      .setCustomId(`gcs-add:${character}`)
      .setTitle(`${character}への共通対策を追加`);

    const contentInput = new TextInputBuilder()
      .setCustomId('content')
      .setLabel('対策内容（複数行OK）')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(2000)
      .setRequired(true)
      .setPlaceholder('対策内容を入力してください...');

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  } else if (subcommand === 'view') {
    const character = interaction.options.getString('character', true);

    // 共通戦略を取得
    const strategies = await CommonStrategyModel.getByCharacter(character);

    if (strategies.length === 0) {
      await interaction.reply({
        content: `${character}への共通対策情報はまだ登録されていません。\n\`/gcs add\` で追加してください。`,
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
      return `**ID:${strat.id}** [${date}]\n${strat.strategy_content}`;
    }).join('\n\n');

    embed.setDescription(strategiesText);

    // ViewコマンドはEphemeralに戻す
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  } else if (subcommand === 'edit') {
    const id = interaction.options.getInteger('id', true);
    const content = interaction.options.getString('content', true);

    // 共通対策を更新
    const updated = await CommonStrategyModel.update(id, content);

    if (!updated) {
      await interaction.reply({
        content: '❌ 対策情報が見つかりません。',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // キャラクター名を取得
    const character = await CharacterModel.getById(updated.target_character_id);
    const characterName = character?.name || updated.target_character || '不明';

    await interaction.reply({
      content: `✅ 共通対策情報を更新しました (ID: ${id})\n\n対象キャラ: ${characterName}\n内容: ${content}`,
      // Publicにするためフラグ削除
    });

  } else if (subcommand === 'delete') {
    const id = interaction.options.getInteger('id', true);

    // 共通対策を削除
    const deleted = await CommonStrategyModel.delete(id);

    if (!deleted) {
      await interaction.reply({
        content: '❌ 対策情報が見つかりません。',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.reply({
      content: `✅ 共通対策情報を削除しました (ID: ${id})`,
      // Publicにするためフラグ削除
    });
  }
}

export async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  const [action, character] = interaction.customId.split(':');

  if (action !== 'gcs-add') return false;

  const userId = interaction.user.id;
  const content = interaction.fields.getTextInputValue('content');

  // ユーザーを取得または作成
  await UserModel.findOrCreate(userId);

  // 共通戦略を追加
  await CommonStrategyModel.create(character, content, userId);

  await interaction.reply({
    content: `🌐 共通対策情報を登録しました\n\n対象キャラ: ${character}\n内容:\n${content}\n\nこの情報は全ユーザーの \`/gm\` コマンドで表示されます。`,
    // Publicにするためフラグ削除
  });

  return true;
}
