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
          .setDescription('メモ（任意）')
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
          .setDescription('メモ（任意）')
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

      // 最後の部分に一致する技をフィルタ
      const filtered = moves.filter(move =>
        move.name.toLowerCase().includes(lastPart) ||
        move.value.toLowerCase().includes(lastPart)
      );

      if (filtered.length === 0) {
        return await interaction.respond(moves.slice(0, 25));
      }

      return await interaction.respond(filtered.slice(0, 25));
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
      response += `メモ: ${note}\n`;
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
      const locationEmoji = combo.location === 'center' ? '🔵' : '🔴';
      const starterEmoji = combo.starter === 'counter' ? '⚡' : '⭕';

      let fieldName = `${locationEmoji} ${starterEmoji} テンション${combo.tension_gauge}%`;
      if (combo.damage) {
        fieldName += ` (${combo.damage}dmg)`;
      }

      let fieldValue = combo.combo_notation;
      if (combo.note) {
        fieldValue += `\n💭 ${combo.note}`;
      }

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
  }
}
