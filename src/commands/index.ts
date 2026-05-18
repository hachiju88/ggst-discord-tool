import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import type { ButtonInteraction, StringSelectMenuInteraction, ChannelSelectMenuInteraction } from 'discord.js';
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
import * as tnm from './tnm';

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
  ['tnm', tnm],
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
    'tnm-create': 'tnm',
    'tnm-char-modal': 'tnm',
    'tnm-team-create': 'tnm',
    'tnm-combined-modal': 'tnm',
    'tnm-handicap-custom-modal': 'tnm',
    'tnm-admin-fix-modal': 'tnm',
    'tnm-admin-enter-modal': 'tnm',
    'tnm-admin-team-setup-modal': 'tnm',
  };
  const commandName = prefixToCommand[prefix];
  if (commandName) {
    return commandRegistry.get(commandName)?.handleModalSubmit;
  }
  return undefined;
}

// Buttonハンドラー
export async function buttonHandler(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  if (customId.startsWith('tnm-')) {
    await tnm.handleButtonInteract(interaction);
  }
}

// SelectMenuハンドラー
export async function selectMenuHandler(interaction: StringSelectMenuInteraction): Promise<void> {
  const customId = interaction.customId;
  if (customId.startsWith('tnm-')) {
    await tnm.handleSelectMenu(interaction);
  }
}

// ChannelSelectMenuハンドラー
export async function channelSelectMenuHandler(interaction: ChannelSelectMenuInteraction): Promise<void> {
  const customId = interaction.customId;
  if (customId.startsWith('tnm-')) {
    await tnm.handleChannelSelectMenu(interaction);
  }
}

// コマンド定義をエクスポート
export const commands = Array.from(commandRegistry.values()).map(m => m.data);
