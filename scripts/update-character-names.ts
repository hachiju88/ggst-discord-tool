import 'dotenv/config';
import { createClient } from '@libsql/client';

// キャラクター名を更新
async function updateCharacterNames() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set');
    process.exit(1);
  }

  const db = createClient({ url, authToken });
  console.log('Connected to database\n');

  try {
    // 現在のキャラクター名を確認
    console.log('📋 Current character names:');
    const current = await db.execute('SELECT id, name FROM characters ORDER BY id');
    for (const row of current.rows) {
      console.log(`  ${(row as any).id}: ${(row as any).name}`);
    }
    console.log();

    // 必要な更新を実行
    console.log('🔄 Updating character names...');
    await db.execute("UPDATE characters SET name = 'ミリア=レイジ' WHERE id = 8");
    await db.execute("UPDATE characters SET name = '御津闇慈' WHERE id = 14");
    await db.execute("UPDATE characters SET name = '梅喧' WHERE id = 19");
    await db.execute("UPDATE characters SET name = 'シン=キスク' WHERE id = 22");
    await db.execute("UPDATE characters SET name = 'アスカ' WHERE id = 24");
    console.log('   ✅ Updated character names\n');

    // 更新後のキャラクター名を確認
    console.log('📋 Updated character names:');
    const updated = await db.execute('SELECT id, name FROM characters ORDER BY id');
    for (const row of updated.rows) {
      console.log(`  ${(row as any).id}: ${(row as any).name}`);
    }

    console.log('\n✅ Update completed successfully');
  } catch (error) {
    console.error('❌ Update failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

updateCharacterNames();
