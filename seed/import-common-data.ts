import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { initDatabase } from '../src/database';
import { CommonStrategyModel } from '../src/models/CommonStrategy';
import { UserModel } from '../src/models/User';

// 環境変数読み込み
dotenv.config();

// システムユーザーIDを使用（共通データの作成者として）
const SYSTEM_USER_ID = 'system-import';

interface CharacterData {
  name: string;
  strategies: string[];
}

function parseMarkdownData(content: string): CharacterData[] {
  const characters: CharacterData[] = [];
  const lines = content.split('\n');

  let currentCharacter: CharacterData | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // キャラクター名（# で始まる行）
    if (trimmedLine.startsWith('# ')) {
      if (currentCharacter) {
        characters.push(currentCharacter);
      }
      currentCharacter = {
        name: trimmedLine.substring(2).trim(),
        strategies: []
      };
    }
    // 戦略データ（- で始まる行）
    else if (trimmedLine.startsWith('- ') && currentCharacter) {
      const strategy = trimmedLine.substring(2).trim();

      // **カテゴリ**：内容 の形式を解析
      const match = strategy.match(/\*\*(.+?)\*\*：(.+)/);
      if (match) {
        const category = match[1];
        const content = match[2];

        // 「なし」以外の場合のみ登録
        if (!content.toLowerCase().includes('なし')) {
          currentCharacter.strategies.push(`【${category}】${content}`);
        }
      }
    }
  }

  // 最後のキャラクターを追加
  if (currentCharacter) {
    characters.push(currentCharacter);
  }

  return characters;
}

async function importCommonData() {
  try {
    console.log('🔄 データベースを初期化中...');
    initDatabase();

    // システムユーザーを作成
    console.log('👤 システムユーザーを作成中...');
    UserModel.findOrCreate(SYSTEM_USER_ID);

    // Markdownファイルを読み込み
    const dataPath = path.join(__dirname, 'data', 'character-data.md');
    console.log(`📖 データファイルを読み込み中: ${dataPath}`);

    if (!fs.existsSync(dataPath)) {
      throw new Error(`データファイルが見つかりません: ${dataPath}`);
    }

    const content = fs.readFileSync(dataPath, 'utf-8');

    // データを解析
    console.log('🔍 データを解析中...');
    const characters = parseMarkdownData(content);

    console.log(`✅ ${characters.length}キャラクターのデータを解析しました`);

    // 既存の共通戦略を削除するか確認
    console.log('⚠️  既存の共通戦略データを削除します...');

    // データベースに登録
    let totalStrategies = 0;
    for (const character of characters) {
      if (character.strategies.length === 0) {
        console.log(`⏭️  ${character.name}: データなし（スキップ）`);
        continue;
      }

      console.log(`📝 ${character.name}: ${character.strategies.length}件の戦略を登録中...`);

      for (const strategy of character.strategies) {
        CommonStrategyModel.create(
          character.name,
          strategy,
          SYSTEM_USER_ID
        );
        totalStrategies++;
      }
    }

    console.log('');
    console.log('✅ インポート完了！');
    console.log(`📊 統計:`);
    console.log(`   - キャラクター数: ${characters.length}`);
    console.log(`   - 登録した戦略数: ${totalStrategies}`);
    console.log('');
    console.log('💡 使い方:');
    console.log('   Discordで `/ggst-common-strategy view [キャラ名]` を実行して確認してください');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  }
}

// 実行
importCommonData();
