import 'dotenv/config';
import { createClient } from '@libsql/client';

// 既存の技データを全削除してから再シード
async function reseedMoves() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
    process.exit(1);
  }

  const db = createClient({ url, authToken });
  console.log('Connected to database');

  try {
    // 既存の技データを全削除
    console.log('🗑️  Deleting existing character moves...');
    const deleteResult = await db.execute('DELETE FROM character_moves');
    console.log(`   Deleted ${deleteResult.rowsAffected} moves\n`);

    // database/index.ts のdbをセット
    const { setDatabase } = require('../src/database/index.ts');
    setDatabase(db);

    // 新しいデータを投入
    console.log('📝 Seeding new character moves...');
    const { seedCharacterMoves } = require('../src/database/seed-character-moves.ts');
    await seedCharacterMoves();

    console.log('\n✅ Reseed completed successfully');
  } catch (error) {
    console.error('❌ Reseed failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

reseedMoves();
