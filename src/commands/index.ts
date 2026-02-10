import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import * as setmychar from './setmychar';
import * as addnote from './addnote';
import * as history from './history';
import * as strategy from './strategy';
import * as commonStrategy from './common-strategy';
import * as match from './match';
import * as exportCmd from './export';
import * as combo from './combo';
import * as move from './move';
import * as admin from './admin';

// コマンドモジュールの型定義
interface CommandModule {
  data: any;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: any) => Promise<void>;
  handleModalSubmit?: (interaction: any) => Promise<any>;
}

// コマンドレジストリ（一元管理）
const commandRegistry = new Map<string, CommandModule>([
  ['gs', setmychar],
  ['gn', addnote],
  ['gh', history],
  ['gps', strategy],
  ['gcs', commonStrategy],
  ['gm', match],
  ['ge', exportCmd],
  ['gc', combo],
  ['gmv', move],
  ['admin', admin],
]);

// コマンドハンドラー
export async function commandHandler(interaction: ChatInputCommandInteraction) {
  const { commandName } = interaction;
  const module = commandRegistry.get(commandName);

  if (module) {
    await module.execute(interaction);
  } else {
    await interaction.reply({
      content: 'このコマンドはまだ実装されていません。',
      flags: MessageFlags.Ephemeral
    });
  }
}

// Autocompleteハンドラー
export function getAutocompleteHandler(commandName: string) {
  return commandRegistry.get(commandName)?.autocomplete;
}

// ModalSubmitハンドラー
export function getModalSubmitHandler(customId: string): ((interaction: any) => Promise<any>) | undefined {
  // customId の prefix からコマンドを特定
  const prefix = customId.split(':')[0];
  const prefixToCommand: Record<string, string> = {
    'gps-add': 'gps',
    'gcs-add': 'gcs',
  };
  const commandName = prefixToCommand[prefix];
  if (commandName) {
    return commandRegistry.get(commandName)?.handleModalSubmit;
  }
  return undefined;
}

// コマンド定義をエクスポート
export const commands = Array.from(commandRegistry.values()).map(m => m.data);
