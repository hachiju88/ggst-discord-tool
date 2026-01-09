import dotenv from 'dotenv';
import { createClient } from './bot';
import { initDatabase, closeDatabase } from './database';

// 環境変数の読み込み
dotenv.config();

async function main() {
  try {
    // 環境変数のチェック
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN is not set in environment variables');
    }

    // データベース初期化
    console.log('Initializing database...');
    initDatabase();

    // Botクライアント作成・ログイン
    console.log('Starting bot...');
    const client = createClient();
    await client.login(process.env.DISCORD_TOKEN);

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('Shutting down...');
      client.destroy();
      closeDatabase();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('Shutting down...');
      client.destroy();
      closeDatabase();
      process.exit(0);
    });

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
