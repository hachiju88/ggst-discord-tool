import 'dotenv/config';
import { initDatabase } from '../database';
import { CharacterMoveModel } from '../models/CharacterMove';
import { CommonMoveModel } from '../models/CommonMove';

async function testGetByCharacter() {
  // データベースを初期化
  await initDatabase();
  console.log('🧪 CharacterMoveModel.getByCharacter() テスト\n');

  const testCharacters = ['ソル=バッドガイ', 'ブリジット'];

  for (const characterName of testCharacters) {
    console.log(`\n📋 ${characterName}:`);
    console.log('─'.repeat(50));

    // キャラクター専用技を取得
    const characterMoves = await CharacterMoveModel.getByCharacter(characterName);
    console.log(`\n専用技: ${characterMoves.length}件`);
    if (characterMoves.length > 0) {
      console.log('例:');
      characterMoves.slice(0, 5).forEach(move => {
        console.log(`  - ${move.move_name} (${move.move_notation})`);
      });
    }

    // 共通技を取得
    const commonMoves = await CommonMoveModel.getAll();
    console.log(`\n共通技: ${commonMoves.length}件`);

    // 統合
    const commonMovesFormatted = commonMoves.map(cm => ({
      id: cm.id,
      character_id: 0,
      move_name: cm.move_name,
      move_name_en: cm.move_name_en,
      move_notation: cm.move_notation,
      move_type: cm.move_type,
      created_at: cm.created_at
    }));
    const movesData = [...commonMovesFormatted, ...characterMoves];

    console.log(`\n統合後の合計: ${movesData.length}件`);
    console.log(`  共通技: ${commonMovesFormatted.length}件`);
    console.log(`  専用技: ${characterMoves.length}件`);
  }
}

testGetByCharacter().catch(console.error);
