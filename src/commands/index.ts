import { ChatInputCommandInteraction } from 'discord.js';
import * as setmychar from './setmychar';
import * as addnote from './addnote';
import * as history from './history';
import * as strategy from './strategy';
import * as commonStrategy from './common-strategy';
import * as match from './match';
import * as exportCmd from './export';

// コマンドハンドラー
export async function commandHandler(interaction: ChatInputCommandInteraction) {
  const { commandName } = interaction;

  switch (commandName) {
    case 'ggst-setmychar':
      await setmychar.execute(interaction);
      break;
    case 'ggst-addnote':
      await addnote.execute(interaction);
      break;
    case 'ggst-history':
      await history.execute(interaction);
      break;
    case 'ggst-strategy':
      await strategy.execute(interaction);
      break;
    case 'ggst-common-strategy':
      await commonStrategy.execute(interaction);
      break;
    case 'ggst-match':
      await match.execute(interaction);
      break;
    case 'ggst-export':
      await exportCmd.execute(interaction);
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
  addnote.data,
  history.data,
  strategy.data,
  commonStrategy.data,
  match.data,
  exportCmd.data
];
