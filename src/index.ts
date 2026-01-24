import dotenv from 'dotenv';
import express from 'express';
import { createClient } from './bot';
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
    console.log('Environment variables loaded');

    // データベース初期化
    console.log('Initializing database...');
    await initDatabase();
    console.log('Database initialized');

    // 自動マイグレーション実行
    await autoMigrate();

    // Expressサーバーを先に起動（Renderのポートスキャン対応）
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

    // Webサーバー起動後にDiscord Botをログイン
    console.log('Starting Discord bot client...');
    const client = createClient();

    // Graceful shutdown handlers
    const shutdown = async () => {
      console.log('Shutting down...');
      server.close();
      client.destroy();
      await closeDatabase();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Discord botログイン（非同期、詳細ログ付き）
    console.log('Attempting to login to Discord...');
    console.log('DISCORD_TOKEN is set:', process.env.DISCORD_TOKEN ? 'YES' : 'NO');
    if (process.env.DISCORD_TOKEN) {
      console.log('Token length:', process.env.DISCORD_TOKEN.length);
      console.log('Token prefix:', process.env.DISCORD_TOKEN.substring(0, 10) + '...');

      // トークン形式の検証
      const token = process.env.DISCORD_TOKEN;
      const tokenParts = token.split('.');
      console.log('Token has correct format (3 parts):', tokenParts.length === 3 ? 'YES' : `NO (${tokenParts.length} parts)`);

      // Base64デコードして最初の部分がBot IDか確認
      try {
        const botId = Buffer.from(tokenParts[0], 'base64').toString();
        console.log('Bot ID from token:', botId);
      } catch (e) {
        console.error('Failed to decode token first part:', e);
      }
    }

    // タイムアウト設定（60秒、警告のみ）
    console.log('Setting 60-second login timeout warning...');
    const loginTimeout = setTimeout(() => {
      console.error('⚠️ Discord login taking longer than 60 seconds');
      console.error('Waiting for error details from Discord.js...');
      console.error('Please check:');
      console.error('1. DISCORD_TOKEN is valid');
      console.error('2. Network connectivity to Discord API');
      console.error('3. Bot is not banned or restricted');
      // process.exit(1) を削除 - エラー詳細を待つ
    }, 60000);
    console.log('Timeout set, timer ID:', loginTimeout);

    // Discord Gateway接続テスト（WebSocket）
    console.log('Testing Discord Gateway connectivity...');
    try {
      const https = await import('https');
      const testReq = https.get('https://discord.com/api/gateway', (res) => {
        console.log('Discord API Gateway endpoint response:', res.statusCode);
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          console.log('Gateway URL from API:', data);
        });
      });
      testReq.on('error', (err) => {
        console.error('Failed to reach Discord API Gateway endpoint:', err.message);
      });
      testReq.setTimeout(10000, () => {
        console.error('Discord API Gateway endpoint timeout after 10 seconds');
        testReq.destroy();
      });
    } catch (e) {
      console.error('Gateway connectivity test failed:', e);
    }

    console.log('Calling client.login()...');
    client.login(process.env.DISCORD_TOKEN)
      .then(() => {
        clearTimeout(loginTimeout);
        console.log('✅ Discord bot login successful');
      })
      .catch((error) => {
        clearTimeout(loginTimeout);
        console.error('❌ Failed to login to Discord:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        if (error.code) {
          console.error('Error code:', error.code);
        }
        if (error.message) {
          console.error('Error message:', error.message);
        }
        process.exit(1);
      });

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
