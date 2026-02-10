import { Client, GatewayIntentBits, Collection, REST, Routes, MessageFlags } from 'discord.js';
import { commandHandler } from './commands';
import * as setmychar from './commands/setmychar';
import * as addnote from './commands/addnote';
import * as history from './commands/history';
import * as strategy from './commands/strategy';
import * as commonStrategy from './commands/common-strategy';
import * as match from './commands/match';
import * as combo from './commands/combo';
import * as move from './commands/move';

export function createClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
    ],
    // REST APIのタイムアウトを延長
    rest: {
      timeout: 30000, // デフォルト: 15秒
    },
  });

  // Ready イベント（v15対応: clientReady）
  client.once('clientReady', () => {
    console.log('Discord bot logged in successfully');
    console.log(`Logged in as ${client.user?.tag}`);
  });

  // Interaction イベント（スラッシュコマンド処理）
  client.on('interactionCreate', async (interaction) => {
    // モーダル送信処理
    if (interaction.isModalSubmit()) {
      try {
        const customId = interaction.customId;

        // gps-add: で始まる場合
        if (customId.startsWith('gps-add:')) {
          await strategy.handleModalSubmit(interaction);
          return;
        }

        // gcs-add: で始まる場合
        if (customId.startsWith('gcs-add:')) {
          await commonStrategy.handleModalSubmit(interaction);
          return;
        }
      } catch (error) {
        console.error('[ModalSubmit] Error handling modal:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'モーダルの処理中にエラーが発生しました。',
            flags: MessageFlags.Ephemeral as any
          });
        }
      }
      return;
    }

    // Autocomplete処理
    if (interaction.isAutocomplete()) {
      try {
        const { commandName } = interaction;

        // コマンドモジュールのマッピング
        const commandModules: Record<string, any> = {
          'gs': setmychar,
          'gn': addnote,
          'gh': history,
          'gps': strategy,
          'gcs': commonStrategy,
          'gm': match,
          'gc': combo,
          'gmv': move
        };

        const commandModule = commandModules[commandName];

        if (!commandModule) {
          console.error(`[Autocomplete] Unknown command: ${commandName}`);
          return;
        }

        if (commandModule.autocomplete) {
          await commandModule.autocomplete(interaction);
        } else {
          console.warn(`[Autocomplete] No autocomplete handler for: ${commandName}`);
        }
      } catch (error) {
        console.error('[Autocomplete] Error handling autocomplete:', error);
        // Discordのタイムアウトを避けるため、空の配列を返すことを試みる
        // ただし、レート制限時やネットワークエラー時は何もしない
        try {
          if (!interaction.responded) {
            await interaction.respond([]);
          }
        } catch (respondError) {
          // ここでのエラーは無視する（レート制限やUnknown Interactionの可能性があるため）
          console.warn('[Autocomplete] Failed to respond with empty array (ignored):', respondError);
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

      const errorMessage = {
        content: 'コマンドの実行中にエラーが発生しました。',
        flags: MessageFlags.Ephemeral as any
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

  // 警告ハンドリング
  client.on('warn', (warning) => {
    console.warn('Discord client warning:', warning);
  });

  // デバッグハンドリング（詳細ログ）
  client.on('debug', (info) => {
    // すべてのデバッグログを出力
    console.log('[Discord Debug]', info);
  });

  // REST APIのイベント追跡
  client.rest.on('rateLimited', (info) => {
    console.warn('[REST] Rate limited:', JSON.stringify(info, null, 2));
  });

  client.rest.on('invalidRequestWarning', (info) => {
    console.warn('[REST] Invalid request warning:', JSON.stringify(info, null, 2));
  });

  client.rest.on('restDebug', (info) => {
    console.log('[REST Debug]', info);
  });

  // Shard（WebSocket接続）のイベント追跡
  client.on('shardError', (error, shardId) => {
    console.error(`[Shard ${shardId}] WebSocket error:`, error);
  });

  client.on('shardDisconnect', (event, shardId) => {
    console.warn(`[Shard ${shardId}] Disconnected:`, event);
  });

  client.on('shardReconnecting', (shardId) => {
    console.log(`[Shard ${shardId}] Reconnecting...`);
  });

  client.on('shardResume', (shardId, replayedEvents) => {
    console.log(`[Shard ${shardId}] Resumed (replayed ${replayedEvents} events)`);
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
