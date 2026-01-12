import { createClient } from '@libsql/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

/**
 * データベースをv2スキーマに移行
 *
 * 移行内容:
 * 1. 新しいテーブル作成 (characters, defeat_reasons, etc.)
 * 2. キャラクターデータと共通敗因の初期投入
 * 3. 既存データの移行 (キャラ名 → キャラID)
 * 4. 古いカラムのクリーンアップ
 */
async function migrate() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
  }

  console.log('🚀 Starting migration to v2 schema...\n');
  const db = createClient({ url, authToken });

  try {
    // ===================================
    // Step 1: 既存データのバックアップ確認
    // ===================================
    console.log('📊 Step 1: Checking existing data...');

    const usersCount = await db.execute('SELECT COUNT(*) as count FROM users');
    const matchesCount = await db.execute('SELECT COUNT(*) as count FROM matches');
    const strategiesCount = await db.execute('SELECT COUNT(*) as count FROM strategies');
    const commonStrategiesCount = await db.execute('SELECT COUNT(*) as count FROM common_strategies');

    console.log(`   Users: ${(usersCount.rows[0] as any).count}`);
    console.log(`   Matches: ${(matchesCount.rows[0] as any).count}`);
    console.log(`   Strategies: ${(strategiesCount.rows[0] as any).count}`);
    console.log(`   Common Strategies: ${(commonStrategiesCount.rows[0] as any).count}\n`);

    // ===================================
    // Step 2: 新テーブル作成
    // ===================================
    console.log('🔨 Step 2: Creating new tables...');

    const schemaPath = path.join(__dirname, 'schema-v2.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // スキーマを個別のステートメントに分割して実行
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      await db.execute(statement);
    }
    console.log('   ✅ Tables created\n');

    // ===================================
    // Step 3: 初期データ投入
    // ===================================
    console.log('📝 Step 3: Inserting seed data...');

    const seedPath = path.join(__dirname, 'seed-data.sql');
    const seedData = fs.readFileSync(seedPath, 'utf-8');

    const seedStatements = seedData
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of seedStatements) {
      await db.execute(statement);
    }
    console.log('   ✅ Seed data inserted\n');

    // ===================================
    // Step 4: 既存データの移行
    // ===================================
    console.log('🔄 Step 4: Migrating existing data...');

    // 4-1: usersテーブルの移行
    console.log('   📌 Migrating users...');
    const users = await db.execute('SELECT discord_id, main_character FROM users WHERE main_character IS NOT NULL');

    for (const user of users.rows) {
      const discordId = (user as any).discord_id;
      const mainCharacter = (user as any).main_character;

      // キャラ名からIDを取得
      const charResult = await db.execute({
        sql: 'SELECT id FROM characters WHERE name = ?',
        args: [mainCharacter]
      });

      if (charResult.rows.length > 0) {
        const charId = (charResult.rows[0] as any).id;
        await db.execute({
          sql: 'UPDATE users SET main_character_id = ? WHERE discord_id = ?',
          args: [charId, discordId]
        });
      }
    }
    console.log(`   ✅ Migrated ${users.rows.length} users\n`);

    // 4-2: matchesテーブルの移行
    console.log('   📌 Migrating matches...');
    const matches = await db.execute('SELECT id, my_character, opponent_character FROM matches');

    let migratedMatches = 0;
    for (const match of matches.rows) {
      const matchId = (match as any).id;
      const myCharacter = (match as any).my_character;
      const opponentCharacter = (match as any).opponent_character;

      let myCharId = null;
      let opponentCharId = null;

      // 自キャラIDを取得
      if (myCharacter) {
        const charResult = await db.execute({
          sql: 'SELECT id FROM characters WHERE name = ?',
          args: [myCharacter]
        });
        if (charResult.rows.length > 0) {
          myCharId = (charResult.rows[0] as any).id;
        }
      }

      // 相手キャラIDを取得
      const opponentResult = await db.execute({
        sql: 'SELECT id FROM characters WHERE name = ?',
        args: [opponentCharacter]
      });
      if (opponentResult.rows.length > 0) {
        opponentCharId = (opponentResult.rows[0] as any).id;
      }

      // 更新
      if (opponentCharId) {
        await db.execute({
          sql: 'UPDATE matches SET my_character_id = ?, opponent_character_id = ? WHERE id = ?',
          args: [myCharId, opponentCharId, matchId]
        });
        migratedMatches++;
      }
    }
    console.log(`   ✅ Migrated ${migratedMatches} matches\n`);

    // 4-3: strategiesテーブルの移行
    console.log('   📌 Migrating strategies...');
    const strategies = await db.execute('SELECT id, target_character FROM strategies');

    let migratedStrategies = 0;
    for (const strategy of strategies.rows) {
      const strategyId = (strategy as any).id;
      const targetCharacter = (strategy as any).target_character;

      const charResult = await db.execute({
        sql: 'SELECT id FROM characters WHERE name = ?',
        args: [targetCharacter]
      });

      if (charResult.rows.length > 0) {
        const charId = (charResult.rows[0] as any).id;
        await db.execute({
          sql: 'UPDATE strategies SET target_character_id = ? WHERE id = ?',
          args: [charId, strategyId]
        });
        migratedStrategies++;
      }
    }
    console.log(`   ✅ Migrated ${migratedStrategies} strategies\n`);

    // 4-4: common_strategiesテーブルの移行
    console.log('   📌 Migrating common strategies...');
    const commonStrategies = await db.execute('SELECT id, target_character FROM common_strategies');

    let migratedCommonStrategies = 0;
    for (const strategy of commonStrategies.rows) {
      const strategyId = (strategy as any).id;
      const targetCharacter = (strategy as any).target_character;

      const charResult = await db.execute({
        sql: 'SELECT id FROM characters WHERE name = ?',
        args: [targetCharacter]
      });

      if (charResult.rows.length > 0) {
        const charId = (charResult.rows[0] as any).id;
        await db.execute({
          sql: 'UPDATE common_strategies SET target_character_id = ? WHERE id = ?',
          args: [charId, strategyId]
        });
        migratedCommonStrategies++;
      }
    }
    console.log(`   ✅ Migrated ${migratedCommonStrategies} common strategies\n`);

    // ===================================
    // Step 5: 古いカラムの削除（オプション）
    // ===================================
    console.log('🗑️  Step 5: Cleaning up old columns...');
    console.log('   ⚠️  Skipping column deletion for safety.');
    console.log('   ℹ️  Old columns (main_character, my_character, opponent_character, target_character) are kept for rollback purposes.');
    console.log('   ℹ️  You can manually drop them later if needed.\n');

    // ===================================
    // 完了
    // ===================================
    console.log('✅ Migration completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - Users migrated: ${users.rows.length}`);
    console.log(`   - Matches migrated: ${migratedMatches}`);
    console.log(`   - Strategies migrated: ${migratedStrategies}`);
    console.log(`   - Common strategies migrated: ${migratedCommonStrategies}`);
    console.log('\n⚠️  Important: Update your application code to use the new *_id columns.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    db.close();
  }
}

migrate().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
