import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { CharacterModel } from '../models/Character';
import { CharacterMoveModel } from '../models/CharacterMove';

export const data = new SlashCommandBuilder()
  .setName('ggst-move')
  .setDescription('[GGST] キャラクターの技データを管理します')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('技を追加します')
      .addStringOption(option =>
        option
          .setName('character')
          .setDescription('キャラクター')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('move_name')
          .setDescription('技名（例: ガンフレイム）')
          .setRequired(true)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('move_notation')
          .setDescription('技の表記（例: 236P）')
          .setRequired(true)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('move_type')
          .setDescription('技のタイプ（任意）')
          .setRequired(false)
          .setMaxLength(50)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('キャラクターの技一覧を表示します')
      .addStringOption(option =>
        option
          .setName('character')
          .setDescription('キャラクター')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('edit')
      .setDescription('技を編集します')
      .addIntegerOption(option =>
        option
          .setName('move_id')
          .setDescription('技ID（/move view で確認）')
          .setRequired(true)
          .setMinValue(1)
      )
      .addStringOption(option =>
        option
          .setName('move_name')
          .setDescription('新しい技名（任意）')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('move_notation')
          .setDescription('新しい技の表記（任意）')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('move_type')
          .setDescription('新しい技のタイプ（任意）')
          .setRequired(false)
          .setMaxLength(50)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('技を削除します')
      .addIntegerOption(option =>
        option
          .setName('move_id')
          .setDescription('技ID（/move view で確認）')
          .setRequired(true)
          .setMinValue(1)
      )
  );

// Alias command
export const aliasData = new SlashCommandBuilder()
  .setName('gmv')
  .setDescription('[GGST] 技データを管理します (ggst-move の短縮形)')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('技を追加します')
      .addStringOption(option =>
        option
          .setName('character')
          .setDescription('キャラクター')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('move_name')
          .setDescription('技名（例: ガンフレイム）')
          .setRequired(true)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('move_notation')
          .setDescription('技の表記（例: 236P）')
          .setRequired(true)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('move_type')
          .setDescription('技のタイプ（任意）')
          .setRequired(false)
          .setMaxLength(50)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('キャラクターの技一覧を表示します')
      .addStringOption(option =>
        option
          .setName('character')
          .setDescription('キャラクター')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('edit')
      .setDescription('技を編集します')
      .addIntegerOption(option =>
        option
          .setName('move_id')
          .setDescription('技ID（/move view で確認）')
          .setRequired(true)
          .setMinValue(1)
      )
      .addStringOption(option =>
        option
          .setName('move_name')
          .setDescription('新しい技名（任意）')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('move_notation')
          .setDescription('新しい技の表記（任意）')
          .setRequired(false)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName('move_type')
          .setDescription('新しい技のタイプ（任意）')
          .setRequired(false)
          .setMaxLength(50)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('技を削除します')
      .addIntegerOption(option =>
        option
          .setName('move_id')
          .setDescription('技ID（/move view で確認）')
          .setRequired(true)
          .setMinValue(1)
      )
  );

export async function autocomplete(interaction: AutocompleteInteraction) {
  try {
    const focusedOption = interaction.options.getFocused(true);
    const focusedValue = focusedOption.value.toLowerCase();

    // characterフィールドのオートコンプリート
    if (focusedOption.name === 'character') {
      const characters = await CharacterModel.getCachedNamesForAutocomplete();

      if (!focusedValue) {
        return await interaction.respond(characters.slice(0, 25));
      }

      const filtered = characters.filter(char =>
        char.name.toLowerCase().includes(focusedValue)
      );

      return await interaction.respond(filtered.slice(0, 25));
    }

    await interaction.respond([]);
  } catch (error) {
    console.error('[move] Autocomplete error:', error);
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'add') {
    const character = interaction.options.getString('character', true);
    const moveName = interaction.options.getString('move_name', true);
    const moveNotation = interaction.options.getString('move_notation', true);
    const moveType = interaction.options.getString('move_type');

    // キャラクターの存在確認
    const characterData = await CharacterModel.getByName(character);
    if (!characterData) {
      await interaction.reply({
        content: `❌ 無効なキャラクター名です: ${character}`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // 技を追加
    try {
      await CharacterMoveModel.create(character, moveName, moveNotation, moveType);

      let response = `✅ 技を登録しました\n\n`;
      response += `キャラ: ${character}\n`;
      response += `技名: ${moveName}\n`;
      response += `表記: ${moveNotation}\n`;
      if (moveType) {
        response += `タイプ: ${moveType}\n`;
      }

      await interaction.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error('[move] Error creating move:', error);
      await interaction.reply({
        content: '❌ 技の登録中にエラーが発生しました。',
        flags: MessageFlags.Ephemeral
      });
    }

  } else if (subcommand === 'view') {
    const character = interaction.options.getString('character', true);

    // キャラクターの存在確認
    const characterData = await CharacterModel.getByName(character);
    if (!characterData) {
      await interaction.reply({
        content: `❌ 無効なキャラクター名です: ${character}`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // 技を取得
    const moves = await CharacterMoveModel.getByCharacter(character);

    if (moves.length === 0) {
      await interaction.reply({
        content: `${character}の技はまだ登録されていません。`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x00aaff)
      .setTitle(`🥋 ${character}の技一覧`)
      .setDescription(`登録されている技: ${moves.length}件`)
      .setTimestamp();

    // 技を25件ずつ表示（Discordのフィールド数制限）
    const displayMoves = moves.slice(0, 25);
    for (const move of displayMoves) {
      let fieldValue = `表記: ${move.move_notation}`;
      if (move.move_type) {
        fieldValue += `\nタイプ: ${move.move_type}`;
      }
      fieldValue += `\nID: ${move.id}`;

      embed.addFields({
        name: move.move_name,
        value: fieldValue,
        inline: true
      });
    }

    if (moves.length > 25) {
      embed.setFooter({ text: `他${moves.length - 25}件の技があります` });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  } else if (subcommand === 'edit') {
    const moveId = interaction.options.getInteger('move_id', true);
    const moveName = interaction.options.getString('move_name');
    const moveNotation = interaction.options.getString('move_notation');
    const moveType = interaction.options.getString('move_type');

    // 編集する内容が少なくとも1つ指定されているか確認
    if (!moveName && !moveNotation && moveType === null) {
      await interaction.reply({
        content: '❌ 編集する内容を少なくとも1つ指定してください。',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // 技の存在確認
    const existingMove = await CharacterMoveModel.getById(moveId);
    if (!existingMove) {
      await interaction.reply({
        content: `❌ ID ${moveId} の技が見つかりません。`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // 技を更新
    try {
      await CharacterMoveModel.update(
        moveId,
        moveName || undefined,
        moveNotation || undefined,
        moveType !== null ? moveType : undefined
      );

      let response = `✅ 技を更新しました\n\n`;
      response += `技ID: ${moveId}\n`;
      if (moveName) response += `新しい技名: ${moveName}\n`;
      if (moveNotation) response += `新しい表記: ${moveNotation}\n`;
      if (moveType !== null) response += `新しいタイプ: ${moveType || '(なし)'}\n`;

      await interaction.reply({
        content: response,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error('[move] Error updating move:', error);
      await interaction.reply({
        content: '❌ 技の更新中にエラーが発生しました。',
        flags: MessageFlags.Ephemeral
      });
    }

  } else if (subcommand === 'delete') {
    const moveId = interaction.options.getInteger('move_id', true);

    // 技の存在確認
    const existingMove = await CharacterMoveModel.getById(moveId);
    if (!existingMove) {
      await interaction.reply({
        content: `❌ ID ${moveId} の技が見つかりません。`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // 技を削除
    try {
      const deleted = await CharacterMoveModel.delete(moveId);

      if (deleted) {
        await interaction.reply({
          content: `✅ 技を削除しました（ID: ${moveId}, 技名: ${existingMove.move_name}）`,
          flags: MessageFlags.Ephemeral
        });
      } else {
        await interaction.reply({
          content: `❌ 技の削除に失敗しました。`,
          flags: MessageFlags.Ephemeral
        });
      }
    } catch (error) {
      console.error('[move] Error deleting move:', error);
      await interaction.reply({
        content: '❌ 技の削除中にエラーが発生しました。',
        flags: MessageFlags.Ephemeral
      });
    }
  }
}
