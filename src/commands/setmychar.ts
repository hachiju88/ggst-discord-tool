import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { UserModel } from '../models/User';
import { CharacterModel } from '../models/Character';

export const data = new SlashCommandBuilder()
  .setName('gs')
  .setDescription('[GGST] メインキャラクターを設定します')
  .addStringOption(option =>
    option
      .setName('character')
      .setDescription('あなたのメインキャラクター')
      .setRequired(true)
      .setAutocomplete(true)
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
    console.error('[setmychar] Autocomplete error:', error);
  }
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const character = interaction.options.getString('character', true);
  const userId = interaction.user.id;

  // キャラクター名のバリデーション
  const characterData = await CharacterModel.getByName(character);
  if (!characterData) {
    await interaction.reply({
      content: `❌ 無効なキャラクター名です。正しいキャラクター名を入力してください。`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  // ユーザーを取得または作成
  await UserModel.findOrCreate(userId);

  // メインキャラクターを設定
  await UserModel.setMainCharacter(userId, character);

  await interaction.reply({
    content: `✅ メインキャラクターを「${character}」に設定しました！`,
    flags: MessageFlags.Ephemeral
  });
}
