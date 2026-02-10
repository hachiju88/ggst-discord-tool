import { createClient } from '@libsql/client';
import dotenv from 'dotenv';

dotenv.config();

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// システムユーザーID（共通対策の作成者）
const SYSTEM_USER_ID = 'system';

const characterInfo = [
  {
    name: 'ソル=バッドガイ',
    invincible: 'あり（ヴォルカニックヴァイパー）',
    invincibleSuper: 'あり（タイランレイヴ）',
    commandGrab: 'あり（ぶっきらぼうに投げる）',
    parry: 'あり（ヘヴィモブセメタリー：GP）'
  },
  {
    name: 'カイ=キスク',
    invincible: 'あり（ヴェイパースラスト、スタンディッパー）',
    invincibleSuper: 'あり（ライド・ザ・ライトニング）',
    commandGrab: 'なし',
    parry: 'なし'
  },
  {
    name: 'メイ',
    invincible: 'なし（6Pを除く）',
    invincibleSuper: 'あり（五所川原）',
    commandGrab: 'あり（オーバーヘッドキッス）',
    parry: 'なし'
  },
  {
    name: 'アクセル・ロウ',
    invincible: 'なし',
    invincibleSuper: 'あり（百重鎌焼）',
    commandGrab: 'あり（冬蟷螂）',
    parry: 'なし'
  },
  {
    name: 'チップ・ザナフ',
    invincible: 'あり（βブレード）',
    invincibleSuper: 'あり（斬星狼牙）',
    commandGrab: 'あり（幻朧斬）',
    parry: 'なし'
  },
  {
    name: 'ポチョムキン',
    invincible: 'なし',
    invincibleSuper: 'あり（ヘブンリーポチョムキンバスター）',
    commandGrab: 'あり（ポチョムキンバスター）',
    parry: 'あり（ハンマーフォール、スライドヘッド等：アーマー）'
  },
  {
    name: 'ファウスト',
    invincible: 'なし',
    invincibleSuper: 'あり（エキサイティング骨折）',
    commandGrab: 'あり（メッタ刈り）',
    parry: 'なし'
  },
  {
    name: 'ミリア=レイジ',
    invincible: 'あり（ミラーシュ、カピエル：部位無敵）',
    invincibleSuper: 'あり（ウィンガー）',
    commandGrab: 'なし',
    parry: 'なし'
  },
  {
    name: 'ザトー=ONE',
    invincible: 'なし',
    invincibleSuper: 'なし',
    commandGrab: 'あり（ダムドファング）',
    parry: 'あり（「張り合う」：GP）'
  },
  {
    name: 'ラムレザル=ヴァレンタイン',
    invincible: 'なし',
    invincibleSuper: 'あり（モルトバート）',
    commandGrab: 'なし',
    parry: 'なし'
  },
  {
    name: 'レオ・ホワイトファング',
    invincible: 'あり（アイゼンシュトルム）',
    invincibleSuper: 'あり（ライデンシャフトディリガント）',
    commandGrab: 'あり（グレンツェンドゥンケル）',
    parry: 'あり（カーンシルト：当身、特殊技4：GP）'
  },
  {
    name: 'ナゴリユキ',
    invincible: 'あり（垂雪：上半身、不香：胸上）',
    invincibleSuper: 'あり（忘れ雪、残雪）',
    commandGrab: 'あり（Bloodsucking Universe）',
    parry: 'なし'
  },
  {
    name: 'ジオヴァーナ',
    invincible: 'あり（ソウ・ナセンテ：部位無敵）',
    invincibleSuper: 'あり（ヴェンターニア）',
    commandGrab: 'なし',
    parry: 'なし'
  },
  {
    name: '御津闇慈',
    invincible: 'あり（紅：上半身）',
    invincibleSuper: 'なし',
    commandGrab: 'なし',
    parry: 'あり（水月のハコビ：当身/GP、花鳥風月・改：当身）'
  },
  {
    name: 'イノ',
    invincible: 'なし',
    invincibleSuper: 'あり（限界フォルテッシモ）',
    commandGrab: 'あり（メガロマニア）',
    parry: 'なし'
  },
  {
    name: 'ゴールドルイス',
    invincible: 'なし',
    invincibleSuper: 'あり（ダウン・ウィズ・ザ・システム）',
    commandGrab: 'なし',
    parry: 'なし'
  },
  {
    name: 'ジャック・オー',
    invincible: 'なし',
    invincibleSuper: 'あり（フォーエヴァーエリシオンドライバー）',
    commandGrab: 'あり（フォーエヴァーエリシオンドライバー）',
    parry: 'なし'
  },
  {
    name: 'ハッピーカオス',
    invincible: 'なし（前転の上半身無敵などを除く）',
    invincibleSuper: 'なし',
    commandGrab: 'なし',
    parry: 'なし'
  },
  {
    name: '梅喧',
    invincible: 'なし（6Pを除く）',
    invincibleSuper: 'あり（連ね三途渡し）',
    commandGrab: 'なし',
    parry: 'あり（柊：当身）'
  },
  {
    name: 'テスタメント',
    invincible: 'なし',
    invincibleSuper: 'あり（カラミティ・ワン）',
    commandGrab: 'なし',
    parry: 'なし'
  },
  {
    name: 'ブリジット',
    invincible: 'あり（スターシップ）',
    invincibleSuper: 'なし',
    commandGrab: 'あり（ロック ザ ベイビー）',
    parry: 'なし'
  },
  {
    name: 'シン=キスク',
    invincible: 'あり（ホークベイカー）',
    invincibleSuper: 'あり（R.T.L）',
    commandGrab: 'なし',
    parry: 'なし'
  },
  {
    name: 'ベッドマン?',
    invincible: 'なし',
    invincibleSuper: 'あり（4CC）',
    commandGrab: 'なし',
    parry: 'なし'
  },
  {
    name: 'アスカ',
    invincible: 'あり（アクィラメトロン、ゴートゥマーカー）',
    invincibleSuper: 'なし',
    commandGrab: 'なし',
    parry: 'なし'
  },
  {
    name: 'ジョニー',
    invincible: 'なし',
    invincibleSuper: 'あり（それが俺の名だ）',
    commandGrab: 'なし',
    parry: 'なし'
  },
  {
    name: 'エルフェルト',
    invincible: 'なし',
    invincibleSuper: 'あり（ジュガント ダ パルフェーオ）',
    commandGrab: 'あり（ボンボニエール：投げ部分）',
    parry: 'なし'
  },
  {
    name: 'A.B.A',
    invincible: 'あり（牽引：部位無敵）',
    invincibleSuper: 'なし',
    commandGrab: 'なし',
    parry: 'あり（逆上と驚愕：当身/GP、断罪と情動：GP）'
  },
  {
    name: 'スレイヤー',
    invincible: 'なし',
    invincibleSuper: 'あり（スーパーマッパハンチ）',
    commandGrab: 'あり（血を吸う宇宙）',
    parry: 'なし'
  },
  {
    name: 'ディズィー',
    invincible: 'なし',
    invincibleSuper: 'あり（インペリアルレイ）',
    commandGrab: 'なし',
    parry: 'なし'
  },
  {
    name: 'ヴェノム',
    invincible: 'なし',
    invincibleSuper: 'なし',
    commandGrab: 'あり（トリアンバカ：投げ無敵あり）',
    parry: 'なし'
  },
  {
    name: 'ユニカ',
    invincible: 'あり（ブラストオフ）',
    invincibleSuper: 'あり（メガデス・バスター）',
    commandGrab: 'なし',
    parry: 'なし'
  },
  {
    name: 'ルーシー',
    invincible: 'あり（モノワイヤー：ブレイクアウト）',
    invincibleSuper: 'あり（ライブワイヤー）',
    commandGrab: 'なし',
    parry: 'なし'
  }
];

async function seedCharacterInfo() {
  try {
    // systemユーザーを作成（存在しない場合）
    await db.execute({
      sql: 'INSERT OR IGNORE INTO users (discord_id, main_character_id) VALUES (?, ?)',
      args: [SYSTEM_USER_ID, null]
    });
    console.log('System user ensured');

    // キャラクターIDマッピングを取得
    const charactersResult = await db.execute('SELECT id, name FROM characters ORDER BY display_order');
    const characterMap = new Map();
    for (const char of charactersResult.rows) {
      characterMap.set(char.name, char.id);
    }

    console.log(`Found ${charactersResult.rows.length} characters in database`);

    // 既存の共通対策を削除（システムユーザーが作成したもののみ）
    await db.execute({
      sql: 'DELETE FROM common_strategies WHERE created_by_discord_id = ?',
      args: [SYSTEM_USER_ID]
    });
    console.log('Deleted existing system common strategies');

    let insertedCount = 0;

    // 各キャラクターの情報を登録
    for (const info of characterInfo) {
      const characterId = characterMap.get(info.name);
      if (!characterId) {
        console.log(`Warning: Character not found: ${info.name}`);
        continue;
      }

      // 共通対策テキストを作成
      const strategyContent = `【無敵技】${info.invincible}
【無敵覚醒】${info.invincibleSuper}
【コマ投げ】${info.commandGrab}
【当て身】${info.parry}`;

      await db.execute({
        sql: `
          INSERT INTO common_strategies (target_character, target_character_id, strategy_content, created_by_discord_id)
          VALUES (?, ?, ?, ?)
        `,
        args: [info.name, characterId, strategyContent, SYSTEM_USER_ID]
      });

      console.log(`✓ Inserted info for ${info.name} (ID: ${characterId})`);
      insertedCount++;
    }

    console.log(`\n✅ Successfully inserted ${insertedCount} character info records`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    db.close();
  }
}

seedCharacterInfo();
