import { ChatInputCommandInteraction } from 'discord.js';
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
    case 'ggst-setmychar':
    case 'gs':
      await setmychar.execute(interaction);
      break;
    case 'ggst-addnote':
    case 'gn':
      await addnote.execute(interaction);
      break;
    case 'ggst-history':
    case 'gh':
      await history.execute(interaction);
      break;
    case 'ggst-strategy':
    case 'gps':
      await strategy.execute(interaction);
      break;
    case 'ggst-common-strategy':
    case 'gcs':
      await commonStrategy.execute(interaction);
      break;
    case 'ggst-match':
    case 'gm':
      await match.execute(interaction);
      break;
    case 'ggst-export':
    case 'ge':
      await exportCmd.execute(interaction);
      break;
    case 'ggst-combo':
    case 'gc':
      await combo.execute(interaction);
      break;
    case 'ggst-move':
    case 'gmv':
      await move.execute(interaction);
      break;
    default:
      await interaction.reply({
        content: 'このコマンドはまだ実装されていません。',
        ephemeral: true
      });
  }
}

// コマンド定義をエクスポート
export const commands = [
  setmychar.data,
  setmychar.aliasData,
  addnote.data,
  addnote.aliasData,
  history.data,
  history.aliasData,
  strategy.data,
  strategy.aliasData,
  commonStrategy.data,
  commonStrategy.aliasData,
  match.data,
  match.aliasData,
  exportCmd.data,
  exportCmd.aliasData,
  combo.data,
  combo.aliasData,
  move.data,
  move.aliasData
];
