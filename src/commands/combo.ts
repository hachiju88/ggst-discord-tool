import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { LOCATION_CHOICES, TENSION_GAUGE_CHOICES, STARTER_CHOICES } from '../config/constants';
import { UserModel } from '../models/User';
import { ComboModel } from '../models/Combo';
import { CharacterModel } from '../models/Character';
import { CharacterMoveModel } from '../models/CharacterMove';

export const data = new SlashCommandBuilder()
  .setName('ggst-combo')
  .setDescription('[GGST] コンボを管理します')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('コンボを追加します')
      .addStringOption(option =>
        option
          .setName('character')
          .setDescription('キャラクター')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('location')
          .setDescription('位置')
          .setRequired(true)
          .addChoices(...LOCATION_CHOICES)
      )
      .addIntegerOption(option =>
        option
          .setName('tension')
          .setDescription('テンションゲージ')
          .setRequired(true)
          .addChoices(...TENSION_GAUGE_CHOICES)
      )
      .addStringOption(option =>
        option
          .setName('starter')
          .setDescription('始動')
          .setRequired(true)
          .addChoices(...STARTER_CHOICES)
      )
      .addStringOption(option =>
        option
          .setName('combo')
          .setDescription('コンボ入力（例: 5K > 6H > 623H）')
          .setRequired(true)
          .setMaxLength(500)
          .setAutocomplete(true)
      )
      .addIntegerOption(option =>
        option
          .setName('damage')
          .setDescription('ダメージ量')
          .setRequired(false)
          .setMinValue(0)
      )
      .addStringOption(option =>
        option
          .setName('note')
          .setDescription('コメント（任意）')
          .setRequired(false)
          .setMaxLength(500)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('コンボを表示します')
      .addStringOption(option =>
        option
          .setName('character')
          .setDescription('キャラクター')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('location')
          .setDescription('位置でフィルタ')
          .setRequired(false)
          .addChoices(...LOCATION_CHOICES)
      )
      .addIntegerOption(option =>
        option
          .setName('tension')
          .setDescription('テンションゲージでフィルタ')
          .setRequired(false)
          .addChoices(...TENSION_GAUGE_CHOICES)
      )
      .addStringOption(option =>
        option
          .setName('starter')
          .setDescription('始動でフィルタ')
          .setRequired(false)
          .addChoices(...STARTER_CHOICES)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('edit')
      .setDescription('コンボを編集します')
      .addIntegerOption(option =>
        option
          .setName('id')
          .setDescription('コンボID（/gc viewで確認）')
          .setRequired(true)
          .setMinValue(1)
      )
      .addStringOption(option =>
        option
          .setName('combo')
          .setDescription('新しいコンボ入力')
          .setRequired(false)
          .setMaxLength(500)
      )
      .addIntegerOption(option =>
        option
          .setName('damage')
          .setDescription('新しいダメージ量')
          .setRequired(false)
          .setMinValue(0)
      )
      .addStringOption(option =>
        option
          .setName('note')
          .setDescription('新しいコメント')
          .setRequired(false)
          .setMaxLength(500)
      )
      .addStringOption(option =>
        option
          .setName('location')
          .setDescription('新しい位置')
          .setRequired(false)
          .addChoices(...LOCATION_CHOICES)
      )
      .addIntegerOption(option =>
        option
          .setName('tension')
          .setDescription('新しいテンションゲージ')
          .setRequired(false)
          .addChoices(...TENSION_GAUGE_CHOICES)
      )
      .addStringOption(option =>
        option
          .setName('starter')
          .setDescription('新しい始動')
          .setRequired(false)
          .addChoices(...STARTER_CHOICES)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('コンボを削除します')
      .addIntegerOption(option =>
        option
          .setName('id')
          .setDescription('コンボID（/gc viewで確認）')
          .setRequired(true)
          .setMinValue(1)
      )
  );

// Alias command
export const aliasData = new SlashCommandBuilder()
  .setName('gc')
  .setDescription('[GGST] コンボを管理します (ggst-combo の短縮形)')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('コンボを追加します')
      .addStringOption(option =>
        option
          .setName('character')
          .setDescription('キャラクター')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('location')
          .setDescription('位置')
          .setRequired(true)
          .addChoices(...LOCATION_CHOICES)
      )
      .addIntegerOption(option =>
        option
          .setName('tension')
          .setDescription('テンションゲージ')
          .setRequired(true)
          .addChoices(...TENSION_GAUGE_CHOICES)
      )
      .addStringOption(option =>
        option
          .setName('starter')
          .setDescription('始動')
          .setRequired(true)
          .addChoices(...STARTER_CHOICES)
      )
      .addStringOption(option =>
        option
          .setName('combo')
          .setDescription('コンボ入力（例: 5K > 6H > 623H）')
          .setRequired(true)
          .setMaxLength(500)
          .setAutocomplete(true)
      )
      .addIntegerOption(option =>
        option
          .setName('damage')
          .setDescription('ダメージ量')
          .setRequired(false)
          .setMinValue(0)
      )
      .addStringOption(option =>
        option
          .setName('note')
          .setDescription('コメント（任意）')
          .setRequired(false)
          .setMaxLength(500)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('コンボを表示します')
      .addStringOption(option =>
        option
          .setName('character')
          .setDescription('キャラクター')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('location')
          .setDescription('位置でフィルタ')
          .setRequired(false)
          .addChoices(...LOCATION_CHOICES)
      )
      .addIntegerOption(option =>
        option
          .setName('tension')
          .setDescription('テンションゲージでフィルタ')
          .setRequired(false)
          .addChoices(...TENSION_GAUGE_CHOICES)
      )
      .addStringOption(option =>
        option
          .setName('starter')
          .setDescription('始動でフィルタ')
          .setRequired(false)
          .addChoices(...STARTER_CHOICES)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('edit')
      .setDescription('コンボを編集します')
      .addIntegerOption(option =>
        option
          .setName('id')
          .setDescription('コンボID（/gc viewで確認）')
          .setRequired(true)
          .setMinValue(1)
      )
      .addStringOption(option =>
        option
          .setName('combo')
          .setDescription('新しいコンボ入力')
          .setRequired(false)
          .setMaxLength(500)
      )
      .addIntegerOption(option =>
        option
          .setName('damage')
          .setDescription('新しいダメージ量')
          .setRequired(false)
          .setMinValue(0)
      )
      .addStringOption(option =>
        option
          .setName('note')
          .setDescription('新しいコメント')
          .setRequired(false)
          .setMaxLength(500)
      )
      .addStringOption(option =>
        option
          .setName('location')
          .setDescription('新しい位置')
          .setRequired(false)
          .addChoices(...LOCATION_CHOICES)
      )
      .addIntegerOption(option =>
        option
          .setName('tension')
          .setDescription('新しいテンションゲージ')
          .setRequired(false)
          .addChoices(...TENSION_GAUGE_CHOICES)
      )
      .addStringOption(option =>
        option
          .setName('starter')
          .setDescription('新しい始動')
          .setRequired(false)
          .addChoices(...STARTER_CHOICES)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('コンボを削除します')
      .addIntegerOption(option =>
        option
          .setName('id')
          .setDescription('コンボID（/gc viewで確認）')
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
        char.name.toLowerCase().includes(focusedValue) ||
        (char.nameEn && char.nameEn.toLowerCase().includes(focusedValue))
      );

      return await interaction.respond(filtered.slice(0, 25));
    }

    // comboフィールドのオートコンプリート（技名サジェスト）
    if (focusedOption.name === 'combo') {
      // 選択されているキャラクターを取得
      const characterName = interaction.options.getString('character');

      if (!characterName) {
        return await interaction.respond([
          { name: 'まず「character」を選択してください', value: '' }
        ]);
      }

      // そのキャラの技リストを取得
      const moves = await CharacterMoveModel.getMovesForAutocomplete(characterName);

      if (moves.length === 0) {
        return await interaction.respond([
          { name: '（このキャラの技データが未登録です）', value: focusedValue }
        ]);
      }

      // 入力中の最後の部分を取得（" > " で分割）
      const parts = focusedValue.split('>').map(p => p.trim());
      const lastPart = parts[parts.length - 1];

      // 既存の入力（最後の部分を除く）
      const prefix = parts.slice(0, -1).join(' > ');
      const prefixWithSeparator = prefix ? prefix + ' > ' : '';

      // 最後の部分に一致する技をフィルタ
      const filtered = moves.filter(move =>
        move.name.toLowerCase().includes(lastPart) ||
        move.value.toLowerCase().includes(lastPart)
      );

      // 選択肢のvalueに既存入力 + 技名 + " > " を含める
      const suggestions = (filtered.length > 0 ? filtered : moves).slice(0, 25).map(move => ({
        name: move.name,
        value: prefixWithSeparator + move.value + ' > '
      }));

      return await interaction.respond(suggestions);
    }

    await interaction.respond([]);
  } catch (error) {
    console.error('[combo] Autocomplete error:', error);
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  // ユーザーを取得または作成
  await UserModel.findOrCreate(userId);

  if (subcommand === 'add') {
    const character = interaction.options.getString('character', true);
    const location = interaction.options.getString('location', true) as 'center' | 'corner';
    const tension = interaction.options.getInteger('tension', true) as 0 | 50 | 100;
    const starter = interaction.options.getString('starter', true) as 'counter' | 'normal';
    const combo = interaction.options.getString('combo', true);
    const damage = interaction.options.getInteger('damage');
    const note = interaction.options.getString('note');

    // キャラクターの存在確認
    const characterData = await CharacterModel.getByName(character);
    if (!characterData) {
      await interaction.reply({
        content: `❌ 無効なキャラクター名です: ${character}`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // コンボを追加
    await ComboModel.create(
      userId,
      character,
      location,
      tension,
      starter,
      combo,
      damage,
      note
    );

    const locationText = location === 'center' ? '画面中央' : '画面端';
    const starterText = starter === 'counter' ? 'カウンター' : '通常';

    let response = `💥 コンボを登録しました\n\n`;
    response += `キャラ: ${character}\n`;
    response += `位置: ${locationText}\n`;
    response += `テンション: ${tension}%\n`;
    response += `始動: ${starterText}\n`;
    response += `コンボ: ${combo}\n`;
    if (damage) {
      response += `ダメージ: ${damage}\n`;
    }
    if (note) {
      response += `コメント: ${note}\n`;
    }

    await interaction.reply({
      content: response,
      flags: MessageFlags.Ephemeral
    });

  } else if (subcommand === 'view') {
    const character = interaction.options.getString('character', true);
    const location = interaction.options.getString('location') as 'center' | 'corner' | null;
    const tension = interaction.options.getInteger('tension') as 0 | 50 | 100 | null;
    const starter = interaction.options.getString('starter') as 'counter' | 'normal' | null;

    // キャラクターの存在確認
    const characterData = await CharacterModel.getByName(character);
    if (!characterData) {
      await interaction.reply({
        content: `❌ 無効なキャラクター名です: ${character}`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // コンボを取得
    const combos = await ComboModel.getByConditions(
      userId,
      character,
      location || undefined,
      tension ?? undefined,
      starter || undefined
    );

    if (combos.length === 0) {
      let message = `${character}のコンボはまだ登録されていません。`;
      if (location || tension !== null || starter) {
        message = `指定された条件のコンボが見つかりませんでした。`;
      }
      await interaction.reply({
        content: message,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x00aaff)
      .setTitle(`💥 ${character}のコンボ一覧`)
      .setTimestamp();

    // フィルタ情報を追加
    let filterText = '';
    if (location) {
      filterText += `位置: ${location === 'center' ? '画面中央' : '画面端'} `;
    }
    if (tension !== null) {
      filterText += `テンション: ${tension}% `;
    }
    if (starter) {
      filterText += `始動: ${starter === 'counter' ? 'カウンター' : '通常'}`;
    }

    if (filterText) {
      embed.setDescription(`フィルタ: ${filterText}`);
    }

    // コンボをフィールドに追加（最大10件）
    const displayCombos = combos.slice(0, 10);
    for (const combo of displayCombos) {
      const locationText = combo.location === 'center' ? '画面中央' : '画面端';
      const starterText = combo.starter === 'counter' ? 'カウンター' : '通常始動';

      let fieldName = `ID:${combo.id} [${locationText}][${combo.tension_gauge}%][${starterText}]`;
      if (combo.note) {
        fieldName += `[${combo.note}]`;
      }
      if (combo.damage) {
        fieldName += ` (${combo.damage}dmg)`;
      }

      let fieldValue = combo.combo_notation;

      embed.addFields({
        name: fieldName,
        value: fieldValue,
        inline: false
      });
    }

    if (combos.length > 10) {
      embed.setFooter({ text: `他${combos.length - 10}件のコンボがあります` });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  } else if (subcommand === 'edit') {
    const id = interaction.options.getInteger('id', true);
    const combo = interaction.options.getString('combo');
    const damage = interaction.options.getInteger('damage');
    const note = interaction.options.getString('note');
    const location = interaction.options.getString('location') as 'center' | 'corner' | null;
    const tension = interaction.options.getInteger('tension') as 0 | 50 | 100 | null;
    const starter = interaction.options.getString('starter') as 'counter' | 'normal' | null;

    // 少なくとも1つのフィールドが指定されているか確認
    if (!combo && damage === null && note === null && !location && tension === null && !starter) {
      await interaction.reply({
        content: '❌ 少なくとも1つのフィールドを更新してください。',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // コンボを更新
    const updates: any = {};
    if (combo !== null) updates.comboNotation = combo;
    if (damage !== null) updates.damage = damage;
    if (note !== null) updates.note = note;
    if (location !== null) updates.location = location;
    if (tension !== null) updates.tensionGauge = tension;
    if (starter !== null) updates.starter = starter;

    const updatedCombo = await ComboModel.update(id, userId, updates);

    if (!updatedCombo) {
      await interaction.reply({
        content: '❌ コンボが見つからないか、編集権限がありません。',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // キャラクター名を取得
    const character = await CharacterModel.getById(updatedCombo.character_id);
    const characterName = character?.name || '不明';

    const locationText = updatedCombo.location === 'center' ? '画面中央' : '画面端';
    const starterText = updatedCombo.starter === 'counter' ? 'カウンター' : '通常';

    let response = `✅ コンボを更新しました (ID: ${id})\n\n`;
    response += `キャラ: ${characterName}\n`;
    response += `位置: ${locationText}\n`;
    response += `テンション: ${updatedCombo.tension_gauge}%\n`;
    response += `始動: ${starterText}\n`;
    response += `コンボ: ${updatedCombo.combo_notation}\n`;
    if (updatedCombo.damage) {
      response += `ダメージ: ${updatedCombo.damage}\n`;
    }
    if (updatedCombo.note) {
      response += `コメント: ${updatedCombo.note}\n`;
    }

    await interaction.reply({
      content: response,
      flags: MessageFlags.Ephemeral
    });

  } else if (subcommand === 'delete') {
    const id = interaction.options.getInteger('id', true);

    // コンボを削除
    const deleted = await ComboModel.delete(id, userId);

    if (!deleted) {
      await interaction.reply({
        content: '❌ コンボが見つからないか、削除権限がありません。',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.reply({
      content: `✅ コンボを削除しました (ID: ${id})`,
      flags: MessageFlags.Ephemeral
    });
  }
}
