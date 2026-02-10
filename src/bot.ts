import { Client, GatewayIntentBits, REST, Routes, MessageFlags } from 'discord.js';
import { commandHandler, getAutocompleteHandler, getModalSubmitHandler } from './commands';

export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
    ],
    rest: {
      timeout: 30000,
    },
  });

  // Ready イベント
  client.once('clientReady', () => {
    console.log(`Discord bot logged in as ${client.user?.tag}`);
  });

  // Interaction イベント（スラッシュコマンド処理）
  client.on('interactionCreate', async (interaction) => {
    // モーダル送信処理
    if (interaction.isModalSubmit()) {
      try {
        const handler = getModalSubmitHandler(interaction.customId);
        if (handler) {
          await handler(interaction);
        }
      } catch (error) {
        console.error('[ModalSubmit] Error:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'モーダルの処理中にエラーが発生しました。',
            flags: MessageFlags.Ephemeral
          });
        }
      }
      return;
    }

    // Autocomplete処理
    if (interaction.isAutocomplete()) {
      try {
        const handler = getAutocompleteHandler(interaction.commandName);
        if (handler) {
          await handler(interaction);
        }
      } catch (error) {
        console.error('[Autocomplete] Error:', error);
        try {
          if (!interaction.responded) {
            await interaction.respond([]);
          }
        } catch {
          // タイムアウトやUnknown Interactionは無視
        }
      }
      return;
    }

    // スラッシュコマンド処理
    if (!interaction.isChatInputCommand()) return;

    try {
      await commandHandler(interaction);
    } catch (error) {
      console.error('Error handling command:', error);

      const errorContent = 'コマンドの実行中にエラーが発生しました。';

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorContent, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: errorContent, flags: MessageFlags.Ephemeral });
      }
    }
  });

  // エラー・警告ハンドリング
  client.on('error', (error) => {
    console.error('Discord client error:', error);
  });

  client.on('warn', (warning) => {
    console.warn('Discord client warning:', warning);
  });

  // レート制限ハンドリング
  client.rest.on('rateLimited', (info) => {
    console.warn('[REST] Rate limited:', JSON.stringify(info));
  });

  // Shard（WebSocket接続）のエラー追跡
  client.on('shardError', (error, shardId) => {
    console.error(`[Shard ${shardId}] WebSocket error:`, error);
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

  const commandsJson = commandsData.map((cmd: any) => cmd.toJSON());

  await rest.put(
    Routes.applicationCommands(applicationId),
    { body: commandsJson },
  );

  console.log(`Registered ${commandsJson.length} application commands.`);
}
