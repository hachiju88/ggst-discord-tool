import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { RESULT_CHOICES, PRIORITY_CHOICES } from '../config/constants';
import { UserModel } from '../models/User';
import { MatchModel } from '../models/Match';
import { CharacterModel } from '../models/Character';
import { DefeatReasonModel } from '../models/DefeatReason';

export const data = new SlashCommandBuilder()
  .setName('gn')
  .setDescription('[GGST] 対戦記録とメモを追加します')
  .addStringOption(option =>
    option
      .setName('opponent')
      .setDescription('対戦相手のキャラクター')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption(option =>
    option
      .setName('result')
      .setDescription('勝敗（未指定の場合は記録なし）')
      .setRequired(false)
      .addChoices(...RESULT_CHOICES)
  )
  .addStringOption(option =>
    option
      .setName('defeat_reason')
      .setDescription('敗因（敗北時のみ）')
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addStringOption(option =>
    option
      .setName('priority')
      .setDescription('メモの重要度')
      .setRequired(false)
      .addChoices(...PRIORITY_CHOICES)
  )
  .addStringOption(option =>
    option
      .setName('note')
      .setDescription('メモ')
      .setRequired(false)
      .setMaxLength(1000)
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
    const focusedOption = interaction.options.getFocused(true);
    const focusedValue = focusedOption.value.toLowerCase();

    // defeat_reasonのオートコンプリート
    if (focusedOption.name === 'defeat_reason') {
      const userId = interaction.user.id;
      const reasons = await DefeatReasonModel.getReasonsForAutocomplete(userId);

      if (!focusedValue) {
        return await interaction.respond(reasons.slice(0, 25));
      }

      const filtered = reasons.filter(reason =>
        reason.name.toLowerCase().includes(focusedValue)
      );

      return await interaction.respond(filtered.slice(0, 25));
    }

    // opponent, mycharacterのオートコンプリート
    const characters = await CharacterModel.getCachedNamesForAutocomplete();

    if (!focusedValue) {
      return await interaction.respond(characters.slice(0, 25));
    }

    const filtered = characters.filter(char =>
      char.name.toLowerCase().includes(focusedValue) ||
      char.value.toLowerCase().includes(focusedValue)
    );

    await interaction.respond(filtered.slice(0, 25));
  } catch (error) {
    console.error('[addnote] Autocomplete error:', error);
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const opponent = interaction.options.getString('opponent', true);
  const note = interaction.options.getString('note');
  const resultInput = interaction.options.getString('result');
  const defeatReasonInput = interaction.options.getString('defeat_reason');
  const priorityInput = interaction.options.getString('priority');
  const myCharacterInput = interaction.options.getString('mycharacter');

  // ユーザーを取得または作成
  const user = await UserModel.findOrCreate(userId);

  // 使用キャラを決定（指定がなければメインキャラ）
  const myCharacter = myCharacterInput || user.main_character;

  // resultをnullable型に変換
  const result: 'win' | 'loss' | null = resultInput ? (resultInput as 'win' | 'loss') : null;

  // priorityをnullable型に変換
  const priority: 'critical' | 'important' | 'recommended' | null =
    priorityInput ? (priorityInput as 'critical' | 'important' | 'recommended') : null;

  // defeat_reasonをIDに変換
  let defeatReasonId: number | null = null;
  if (defeatReasonInput) {
    const parsed = DefeatReasonModel.parseReasonValue(defeatReasonInput);
    if (parsed) {
      // "common:1" or "user:5" の形式なので、IDを取得
      // MatchModelのdefeat_reason_idカラムには実際のID値を格納
      // 共通敗因と独自敗因を区別する必要がある場合は、別のロジックが必要
      // ここでは単純にIDを使用
      defeatReasonId = parsed.id;
    }
  }

  // 対戦記録を追加
  await MatchModel.create(
    userId,
    myCharacter,
    opponent,
    result,
    note || undefined,
    defeatReasonId,
    priority
  );

  // 通算成績を取得
  const stats = await MatchModel.getStats(userId, opponent);
  const winRate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(1) : '0.0';

  // レスポンスを構築
  let response = `📝 対戦記録を追加しました\n\n`;

  if (myCharacter) {
    response += `使用キャラ: ${myCharacter}\n`;
  }

  if (result) {
    const resultText = result === 'win' ? '勝利' : '敗北';
    const emoji = result === 'win' ? '✅' : '❌';
    response += `${emoji} vs ${opponent}: ${resultText}\n`;
  } else {
    response += `vs ${opponent}\n`;
  }

  if (note) {
    response += `メモ: ${note}\n`;
  }

  if (defeatReasonInput) {
    const reasonName = await DefeatReasonModel.getReasonDisplayName(defeatReasonInput);
    if (reasonName) {
      response += `敗因: ${reasonName}\n`;
    }
  }

  if (priority) {
    const priorityEmoji = priority === 'critical' ? '🔴' : priority === 'important' ? '🟡' : '🟢';
    const priorityText = priority === 'critical' ? '重要' : priority === 'important' ? '大事' : '推奨';
    response += `優先度: ${priorityEmoji} ${priorityText}\n`;
  }

  response += `\n【${opponent}との通算成績】\n`;
  response += `${stats.wins}勝 ${stats.losses}敗（勝率: ${winRate}%）`;

  await interaction.reply({
    content: response,
    ephemeral: false
  });
}
