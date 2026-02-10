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

// コマンドハンドラー
export async function commandHandler(interaction: ChatInputCommandInteraction) {
  const { commandName } = interaction;

  switch (commandName) {
    case 'gs':
      await setmychar.execute(interaction);
      break;
    case 'gn':
      await addnote.execute(interaction);
      break;
    case 'gh':
      await history.execute(interaction);
      break;
    case 'gps':
      await strategy.execute(interaction);
      break;
    case 'gcs':
      await commonStrategy.execute(interaction);
      break;
    case 'gm':
      await match.execute(interaction);
      break;
    case 'ge':
      await exportCmd.execute(interaction);
      break;
    case 'gc':
      await combo.execute(interaction);
      break;
    case 'gmv':
      await move.execute(interaction);
      break;
    default:
      await interaction.reply({
        content: 'このコマンドはまだ実装されていません。',
        flags: MessageFlags.Ephemeral as any
      });
  }
}

// コマンド定義をエクスポート
export const commands = [
  setmychar.data,
  addnote.data,
  history.data,
  strategy.data,
  commonStrategy.data,
  match.data,
  exportCmd.data,
  combo.data,
  move.data
];
