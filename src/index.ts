import dotenv from 'dotenv';
import express from 'express';
import { createClient, registerCommands } from './bot';
import { initDatabase, closeDatabase } from './database';
import { autoMigrate } from './database/auto-migrate';

// 環境変数の読み込み
dotenv.config();

async function main() {
  try {
    console.log('Starting GGST Discord Bot...');

    // 環境変数のチェック
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN is not set in environment variables');
    }

    // データベース初期化
    await initDatabase();

    // 自動マイグレーション実行
    await autoMigrate();

    // Expressサーバーを起動
    const app = express();
    const port = parseInt(process.env.PORT || '3000', 10);

    app.get('/', (_req, res) => {
      res.send('GGST Discord Bot is running!');
    });

    app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`Web server listening on port ${port}`);
    });

    // Discord Botクライアント作成
    const client = createClient();

    // Graceful shutdown
    const shutdown = async () => {
      console.log('Shutting down...');
      server.close();
      client.destroy();
      await closeDatabase();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // タイムアウト警告（60秒）
    const loginTimeout = setTimeout(() => {
      console.error('⚠️ Discord login taking longer than 60 seconds. Check DISCORD_TOKEN and network connectivity.');
    }, 60000);

    // 指数バックオフでリトライ（レート制限対策）
    let retryCount = 0;
    const maxRetries = 5;

    const attemptLogin = async () => {
      try {
        await client.login(process.env.DISCORD_TOKEN);
        clearTimeout(loginTimeout);
        console.log('✅ Discord bot login successful');

        // コマンド登録
        await registerCommands();
        console.log('✅ Slash commands registered');
      } catch (error: any) {
        clearTimeout(loginTimeout);

        // レート制限エラーの場合はリトライ
        if ((error.code === 'RATE_LIMITED' || error.httpStatus === 429) && retryCount < maxRetries) {
          retryCount++;
          const waitTime = Math.min(2 ** retryCount * 5000, 300000);
          console.warn(`⚠️ Rate limited. Retrying in ${waitTime / 1000}s... (${retryCount}/${maxRetries})`);
          setTimeout(attemptLogin, waitTime);
          return;
        }

        console.error('❌ Failed to login to Discord:', error.message || error);
        if (error.httpStatus !== 429) {
          process.exit(1);
        }
      }
    };

    attemptLogin();

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
