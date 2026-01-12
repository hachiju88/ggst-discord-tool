import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { GGST_CHARACTERS, RESULT_CHOICES } from '../config/constants';
import { UserModel } from '../models/User';
import { MatchModel } from '../models/Match';

// キャラクター名を事前にキャッシュ（パフォーマンス最適化）
const CHARACTERS_CACHE = GGST_CHARACTERS.map(char => ({ name: char, value: char }));

export const data = new SlashCommandBuilder()
  .setName('ggst-addnote')
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
      .setDescription('勝敗')
      .setRequired(true)
      .addChoices(...RESULT_CHOICES)
  )
  .addStringOption(option =>
    option
      .setName('mycharacter')
      .setDescription('使用キャラクター（未指定の場合はメインキャラ）')
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addStringOption(option =>
    option
      .setName('note')
      .setDescription('メモ（任意）')
      .setRequired(false)
      .setMaxLength(1000)
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
    console.error('[addnote] Autocomplete error:', error);
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const opponent = interaction.options.getString('opponent', true);
  const result = interaction.options.getString('result', true) as 'win' | 'loss';
  const myCharacterInput = interaction.options.getString('mycharacter');
  const note = interaction.options.getString('note');

  // ユーザーを取得または作成
  const user = await UserModel.findOrCreate(userId);

  // 使用キャラを決定（指定がなければメインキャラ）
  const myCharacter = myCharacterInput || user.main_character;

  // 対戦記録を追加
  await MatchModel.create(userId, myCharacter, opponent, result, note || undefined);

  // 通算成績を取得
  const stats = await MatchModel.getStats(userId, opponent);
  const winRate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(1) : '0.0';

  const resultText = result === 'win' ? '勝利' : '敗北';
  const emoji = result === 'win' ? '✅' : '❌';

  let response = `📝 対戦記録を追加しました\n\n`;
  if (myCharacter) {
    response += `使用キャラ: ${myCharacter}\n`;
  }
  response += `${emoji} vs ${opponent}: ${resultText}\n`;
  if (note) {
    response += `メモ: ${note}\n`;
  }
  response += `\n【${opponent}との通算成績】\n`;
  response += `${stats.wins}勝 ${stats.losses}敗（勝率: ${winRate}%）`;

  await interaction.reply({
    content: response,
    ephemeral: false
  });
}
