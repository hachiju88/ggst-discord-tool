import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { LOCATION_CHOICES, TENSION_GAUGE_CHOICES, STARTER_CHOICES, COMBO_SCOPE_CHOICES } from '../config/constants';
import { UserModel } from '../models/User';
import { ComboModel } from '../models/Combo';
import { CharacterModel } from '../models/Character';
import { CharacterMoveModel } from '../models/CharacterMove';

export const data = new SlashCommandBuilder()
  .setName('gc')
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
          .setName('note')
          .setDescription('コメント（任意）')
          .setRequired(false)
          .setMaxLength(500)
      )
      .addStringOption(option =>
        option
          .setName('combo1')
          .setDescription('技1（例: 5K）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo2')
          .setDescription('技2（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo3')
          .setDescription('技3（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo4')
          .setDescription('技4（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo5')
          .setDescription('技5（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo6')
          .setDescription('技6（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo7')
          .setDescription('技7（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo8')
          .setDescription('技8（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo9')
          .setDescription('技9（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo10')
          .setDescription('技10（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo11')
          .setDescription('技11（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo12')
          .setDescription('技12（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo13')
          .setDescription('技13（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo14')
          .setDescription('技14（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo15')
          .setDescription('技15（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo16')
          .setDescription('技16（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo17')
          .setDescription('技17（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo18')
          .setDescription('技18（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo19')
          .setDescription('技19（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo20')
          .setDescription('技20（任意）')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
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
      .addStringOption(option =>
        option
          .setName('scope')
          .setDescription('表示範囲')
          .setRequired(false)
          .addChoices(...COMBO_SCOPE_CHOICES)
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
      .addStringOption(option =>
        option
          .setName('note')
          .setDescription('新しいコメント')
          .setRequired(false)
          .setMaxLength(500)
      )
      .addStringOption(option =>
        option
          .setName('combo1')
          .setDescription('技1')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo2')
          .setDescription('技2')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo3')
          .setDescription('技3')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo4')
          .setDescription('技4')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo5')
          .setDescription('技5')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo6')
          .setDescription('技6')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo7')
          .setDescription('技7')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo8')
          .setDescription('技8')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo9')
          .setDescription('技9')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo10')
          .setDescription('技10')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo11')
          .setDescription('技11')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo12')
          .setDescription('技12')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo13')
          .setDescription('技13')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo14')
          .setDescription('技14')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo15')
          .setDescription('技15')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo16')
          .setDescription('技16')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo17')
          .setDescription('技17')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo18')
          .setDescription('技18')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo19')
          .setDescription('技19')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option
          .setName('combo20')
          .setDescription('技20')
          .setRequired(false)
          .setMaxLength(50)
          .setAutocomplete(true)
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
        char.value.toLowerCase().includes(focusedValue)
      );

      return await interaction.respond(filtered.slice(0, 25));
    }

    // comboフィールドのオートコンプリート（技名サジェスト）
    if (focusedOption.name === 'combo' || focusedOption.name.startsWith('combo')) {
      // サブコマンドを取得
      const subcommand = interaction.options.getSubcommand();
      let characterName: string | null = null;

      // editサブコマンドの場合：idからキャラクターを取得
      if (subcommand === 'edit') {
        const comboId = interaction.options.getInteger('id');
        if (comboId) {
          const combo = await ComboModel.getById(comboId);
          if (combo && combo.character_id) {
            const character = await CharacterModel.getById(combo.character_id);
            if (character) {
              characterName = character.name;
            }
          }
        }
      } else {
        // addサブコマンドの場合：characterフィールドから取得
        characterName = interaction.options.getString('character');
      }

      if (!characterName) {
        return await interaction.respond([
          { name: 'まず「character」または「id」を選択してください', value: '' }
        ]);
      }

      // そのキャラの技の生データを取得
      const movesData = await CharacterMoveModel.getByCharacter(characterName);

      if (movesData.length === 0) {
        return await interaction.respond([
          { name: '（このキャラの技データが未登録です）', value: focusedValue }
        ]);
      }

      // comboフィールド（aliasコマンド用）の場合
      if (focusedOption.name === 'combo') {
        // 入力中の最後の部分を取得（" > " で分割）
        const parts = focusedValue.split('>').map(p => p.trim());
        const lastPart = parts[parts.length - 1].toLowerCase();

        // 既存の入力（最後の部分を除く）
        const prefix = parts.slice(0, -1).join(' > ');
        const prefixWithSeparator = prefix ? prefix + ' > ' : '';

        // 最後の部分に一致する技をフィルタ（日本語名・英語名・表記で検索）
        const filtered = movesData.filter(move =>
          move.move_name.toLowerCase().includes(lastPart) ||
          move.move_notation.toLowerCase().includes(lastPart) ||
          (move.move_name_en && move.move_name_en.toLowerCase().includes(lastPart))
        );

        // オートコンプリート用の表示形式に変換
        const suggestions = (filtered.length > 0 ? filtered : movesData).slice(0, 25).map(move => {
          // ドロップダウン表示用（日本語名/英語名を含む）
          const dropdownName = move.move_name_en
            ? `${move.move_name} / ${move.move_name_en} (${move.move_notation})`
            : `${move.move_name} (${move.move_notation})`;

          // 入力フィールド表示用（日本語名 (コマンド)）
          const inputValue = prefixWithSeparator + `${move.move_name} (${move.move_notation})` + ' >';

          return {
            name: dropdownName,
            value: inputValue
          };
        });

        return await interaction.respond(suggestions);
      }

      // combo1-combo20フィールド（通常コマンド用）の場合
      // 入力値に一致する技をフィルタ
      const filtered = movesData.filter(move =>
        move.move_name.toLowerCase().includes(focusedValue) ||
        move.move_notation.toLowerCase().includes(focusedValue) ||
        (move.move_name_en && move.move_name_en.toLowerCase().includes(focusedValue))
      );

      // オートコンプリート用の表示形式に変換
      const suggestions = (filtered.length > 0 ? filtered : movesData).slice(0, 25).map(move => {
        // ドロップダウン表示用（日本語名/英語名を含む）
        const dropdownName = move.move_name_en
          ? `${move.move_name} / ${move.move_name_en} (${move.move_notation})`
          : `${move.move_name} (${move.move_notation})`;

        // 入力フィールド表示用（日本語名 (コマンド)）
        const inputValue = `${move.move_name} (${move.move_notation})`;

        return {
          name: dropdownName,
          value: inputValue
        };
      });

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
    const note = interaction.options.getString('note');

    // combo1-20を連結
    const comboParts: string[] = [];
    for (let i = 1; i <= 20; i++) {
      const comboPart = interaction.options.getString(`combo${i}`);
      if (comboPart) {
        comboParts.push(comboPart);
      }
    }
    const combo = comboParts.join(' > ');

    // コンボが1つも入力されていない場合はエラー
    if (comboParts.length === 0) {
      await interaction.reply({
        content: '❌ 少なくとも1つのコンボ技を入力してください。',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

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
      null,
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
    const scope = interaction.options.getString('scope') as 'mine' | 'all' | null;

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
      starter || undefined,
      scope || undefined
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
    if (scope) {
      filterText += `表示範囲: ${scope === 'mine' ? '自分のコンボのみ' : 'みんなのコンボ'} `;
    }
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
    const note = interaction.options.getString('note');
    const location = interaction.options.getString('location') as 'center' | 'corner' | null;
    const tension = interaction.options.getInteger('tension') as 0 | 50 | 100 | null;
    const starter = interaction.options.getString('starter') as 'counter' | 'normal' | null;

    // combo1-20を連結
    const comboParts: string[] = [];
    for (let i = 1; i <= 20; i++) {
      const comboPart = interaction.options.getString(`combo${i}`);
      if (comboPart) {
        comboParts.push(comboPart);
      }
    }
    const combo = comboParts.length > 0 ? comboParts.join(' > ') : null;

    // 少なくとも1つのフィールドが指定されているか確認
    if (!combo && note === null && !location && tension === null && !starter) {
      await interaction.reply({
        content: '❌ 少なくとも1つのフィールドを更新してください。',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // コンボを更新
    const updates: any = {};
    if (combo !== null) updates.comboNotation = combo;
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
