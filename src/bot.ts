import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { commandHandler } from './commands';

export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
    ],
  });

  // Ready イベント
  client.once('ready', () => {
    console.log(`Logged in as ${client.user?.tag}`);
  });

  // Interaction イベント（スラッシュコマンド処理）
  client.on('interactionCreate', async (interaction) => {
    // Autocomplete処理
    if (interaction.isAutocomplete()) {
      try {
        const { commandName } = interaction;
        // コマンド名からファイル名へのマッピング
        const commandFileMap: Record<string, string> = {
          'ggst-setmychar': 'setmychar',
          'ggst-addnote': 'addnote',
          'ggst-history': 'history',
          'ggst-strategy': 'strategy',
          'ggst-common-strategy': 'common-strategy',
          'ggst-match': 'match',
          'ggst-export': 'export'
        };

        const fileName = commandFileMap[commandName];
        if (!fileName) {
          console.error(`Unknown command: ${commandName}`);
          return;
        }

        const command = await import(`./commands/${fileName}`);

        if (command.autocomplete) {
          await command.autocomplete(interaction);
        }
      } catch (error) {
        console.error('Error handling autocomplete:', error);
      }
      return;
    }

    // スラッシュコマンド処理
    if (!interaction.isChatInputCommand()) return;

    try {
      await commandHandler(interaction);
    } catch (error) {
      console.error('Error handling command:', error);

      const errorMessage = {
        content: 'コマンドの実行中にエラーが発生しました。',
        ephemeral: true
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  });

  // エラーハンドリング
  client.on('error', (error) => {
    console.error('Discord client error:', error);
  });

  return client;
}

// コマンド登録関数
export async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const applicationId = process.env.DISCORD_APPLICATION_ID;

  if (!token || !applicationId) {
    throw new Error('DISCORD_TOKEN or DISCORD_APPLICATION_ID is not set');
  }

  const { commands: commandsData } = await import('./commands');
  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log('Started refreshing application (/) commands.');

    const commandsJson = commandsData.map((cmd: any) => cmd.toJSON());

    await rest.put(
      Routes.applicationCommands(applicationId),
      { body: commandsJson },
    );

    console.log(`Successfully reloaded ${commandsJson.length} application (/) commands.`);
  } catch (error) {
    console.error('Error registering commands:', error);
    throw error;
  }
}
