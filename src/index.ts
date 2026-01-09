import dotenv from 'dotenv';
import express from 'express';
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
    await initDatabase();

    // Botクライアント作成・ログイン
    console.log('Starting bot...');
    const client = createClient();
    await client.login(process.env.DISCORD_TOKEN);

    // Expressサーバーの起動（スリープ対策）
    const app = express();
    const port = process.env.PORT || 3000;

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

    const server = app.listen(port, () => {
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
