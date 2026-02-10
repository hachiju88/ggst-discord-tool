import dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';
import { commands } from './index';

// 環境変数を読み込み
dotenv.config();

async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const applicationId = process.env.DISCORD_APPLICATION_ID;

  if (!token || !applicationId) {
    throw new Error('DISCORD_TOKEN or DISCORD_APPLICATION_ID is not set in environment variables');
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log('Started refreshing application (/) commands.');

    const commandsData = commands.map(cmd => cmd.toJSON());

    await rest.put(
      Routes.applicationCommands(applicationId),
      { body: commandsData },
    );

    console.log(`Successfully reloaded ${commandsData.length} application (/) commands.`);
    console.log('Commands registered:');
    commandsData.forEach(cmd => console.log(`  - /${cmd.name}`));
  } catch (error) {
    console.error('Error registering commands:', error);
    throw error;
  }
}

registerCommands();
