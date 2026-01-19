import dotenv from 'dotenv';
import express from 'express';
import { createClient } from './bot';
import { initDatabase, closeDatabase } from './database';

// 環境変数の読み込み
dotenv.config();

async function main() {
  try {
    console.log('Starting GGST Discord Bot...');

    // 環境変数のチェック
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN is not set in environment variables');
    }
    console.log('Environment variables loaded');

    // データベース初期化
    console.log('Initializing database...');
    await initDatabase();
    console.log('Database initialized');

    // Botクライアント作成・ログイン
    console.log('Starting Discord bot client...');
    const client = createClient();
    await client.login(process.env.DISCORD_TOKEN);
    console.log('Discord bot logged in successfully');

    // Expressサーバーの起動（スリープ対策）
    console.log('Starting web server...');
    const app = express();
    const port = parseInt(process.env.PORT || '3000', 10);
    console.log(`Port configured: ${port}`);

    app.get('/', (req, res) => {
      res.send('GGST Discord Bot is running!');
    });

    app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`Web server listening on port ${port}`);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      server.close();
      client.destroy();
      await closeDatabase();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Shutting down...');
      server.close();
      client.destroy();
      await closeDatabase();
      process.exit(0);
    });

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
