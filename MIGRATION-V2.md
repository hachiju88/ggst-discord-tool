# データベースv2移行ガイド

## 概要

このドキュメントは、GGSTディスコードBotのデータベースをv1からv2へ移行する際の情報をまとめています。

## 主な変更点

### 1. キャラクター管理のDB化
- **変更前**: キャラクター名を文字列で管理（プログラム内定数）
- **変更後**: `characters`テーブルでID管理

**メリット**:
- データの一貫性向上
- キャラ追加時にプログラム修正不要
- コマンド技データとの紐付けが容易

### 2. 敗因管理機能の追加
- `common_defeat_reasons`: 共通敗因マスタ（20種類初期登録済み）
- `defeat_reasons`: ユーザー独自敗因

### 3. 対戦記録の拡張
- **勝敗**: 必須 → 任意（気軽にコメント記録可能）
- **プライオリティ**: `critical`（最重要/共有）、`important`（重要）、`recommended`（推奨）
- **敗因**: 対戦記録に敗因を紐付け可能

### 4. コンボ管理機能の追加（将来実装予定）
- `character_moves`: キャラクターのコマンド技
- `combos`: ユーザーごとのコンボ登録

## 新しいテーブル構造

### characters
```sql
id                 INTEGER PRIMARY KEY
name               TEXT NOT NULL UNIQUE      -- 例: "ソル=バッドガイ"
name_en            TEXT                       -- 例: "Sol Badguy"
display_order      INTEGER DEFAULT 0
created_at         DATETIME
```

### common_defeat_reasons
```sql
id                 INTEGER PRIMARY KEY
reason             TEXT NOT NULL UNIQUE      -- 例: "昇龍に刺された"
display_order      INTEGER DEFAULT 0
created_at         DATETIME
```

### defeat_reasons
```sql
id                 INTEGER PRIMARY KEY
user_discord_id    TEXT NOT NULL
reason             TEXT NOT NULL
created_at         DATETIME
```

### 既存テーブルの変更

#### users
- **追加**: `main_character_id INTEGER` (FK → characters)
- **保持**: `main_character TEXT` (後方互換性のため)

#### matches
- **追加**: `my_character_id INTEGER` (FK → characters)
- **追加**: `opponent_character_id INTEGER` (FK → characters)
- **追加**: `defeat_reason_id INTEGER` (FK → defeat_reasons)
- **追加**: `priority TEXT` ('critical', 'important', 'recommended')
- **変更**: `result TEXT` → NULLを許可
- **保持**: `my_character TEXT`, `opponent_character TEXT` (後方互換性のため)

#### strategies
- **追加**: `target_character_id INTEGER` (FK → characters)
- **保持**: `target_character TEXT` (後方互換性のため)

#### common_strategies
- **追加**: `target_character_id INTEGER` (FK → characters)
- **保持**: `target_character TEXT` (後方互換性のため)

## マイグレーション手順

### 前提条件
- Node.js 18以上
- 環境変数設定済み（`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`）

### 実行コマンド
```bash
npm run migrate:v2
```

### マイグレーション内容
1. 新テーブル作成（characters, defeat_reasons等）
2. 既存テーブルに新カラム追加
3. 初期データ投入（32キャラ + 20敗因）
4. 既存データ移行（キャラ名 → キャラID）

### 確認事項
マイグレーション後、以下を確認：
- ✅ 全テーブルが作成されている
- ✅ charactersテーブルに32キャラ登録済み
- ✅ common_defeat_reasonsテーブルに20敗因登録済み
- ✅ 既存ユーザーの`main_character_id`が正しく設定されている
- ✅ 既存対戦記録の`*_character_id`が正しく設定されている

## ロールバック

万が一問題が発生した場合:
1. 旧カラム（`main_character`, `my_character`等）はそのまま残っているため、データは保持されている
2. アプリケーションコードを旧バージョンに戻せば、旧カラムを使用して動作可能
3. 新カラム・新テーブルは削除可能（ただし推奨しない）

## Phase 1 実装状況

### ✅ 完了
- [x] データベースv2スキーマ設計
- [x] マイグレーションスクリプト作成
- [x] Turso本番DBへのマイグレーション実行
- [x] Characterモデル作成
- [x] DefeatReasonモデル作成
- [x] 型定義更新

### 🚧 次回実装予定
- [ ] 既存モデル更新（User, Match, Strategy, CommonStrategy）
- [ ] コマンド名エイリアス追加（`/ggst-*` → `/g*`）
- [ ] 全コマンドのキャラID対応
- [ ] Phase 2: addnoteコマンド改善（敗因・プライオリティ）
- [ ] Phase 3: matchコマンド改善（新レイアウト）
- [ ] Phase 4: コンボ管理機能

## 初期データ

### 登録済みキャラクター（32体）
1. ソル=バッドガイ
2. カイ=キスク
3. メイ
4. アクセル・ロウ
5. チップ・ザナフ
6. ポチョムキン
7. ファウスト
8. ミリア・レイジ
9. ザトー=ONE
10. ラムレザル=ヴァレンタイン
11. レオ・ホワイトファング
12. ナゴリユキ
13. ジオヴァーナ
14. アンジー
15. イノ
16. ゴールドルイス
17. ジャック・オー
18. ハッピーカオス
19. バイケン
20. テスタメント
21. ブリジット
22. シン・キスク
23. ベッドマン?
24. アスカR#
25. ジョニー
26. エルフェルト
27. A.B.A
28. スレイヤー
29. ディズィー
30. ヴェノム
31. ユニカ
32. ルーシー

### 共通敗因（20種類）
1. 昇龍に刺された
2. 崩しを喰らった
3. 固めから抜けられない
4. 対空できなかった
5. 暴れを狩られた
6. 投げ抜けできなかった
7. ゲージ管理ミス
8. 起き攻めを凌げなかった
9. 確反を入れられなかった
10. 飛び込みを通された
11. 中距離での立ち回り負け
12. 遠距離で何もできなかった
13. バーストタイミングミス
14. 待ちに対応できなかった
15. ラッシュについていけなかった
16. セットプレイに嵌められた
17. リバサに対応できなかった
18. 差し返しを喰らった
19. 択をかけられなかった
20. その他

## 今後のコマンド仕様変更予定

### コマンド名簡略化
- `/ggst-setmychar` → `/gs`
- `/ggst-match` → `/gm`
- `/ggst-addnote` → `/gn`
- `/ggst-history` → `/gh`
- `/ggst-strategy` → `/gps`
- `/ggst-common-strategy` → `/gcs`
- `/ggst-export` → `/ge`

### /gn (addnote) の引数変更
```
/gn opponent:[キャラ] result:[win/loss/なし] defeat_reason:[敗因]
    mycharacter:[キャラ] priority:[critical/important/recommended] note:[メモ]
```

- `result`: 任意（勝敗なしでもメモ可能）
- `defeat_reason`: 敗因選択（共通 + ユーザー独自）
- `priority`: コメントの重要度
  - `critical`: 最重要（みんなに共有）
  - `important`: 重要（自分用）
  - `recommended`: 推奨（自分用）

### /gm (match) の表示変更
```
【ソル vs カイ】

━━━ 共通の基本情報 ━━━
（初期データ登録済みのコメント）

━━━ 対戦成績 ━━━
総対戦数: 50戦 | 勝率: 60.0% (30勝20敗)

━━━ 敗因トップ3 ━━━
1. 昇龍に刺された (8回)
2. 崩しを喰らった (5回)
3. 固めから抜けられない (4回)

━━━ 最重要コメント（共有） ━━━
- [日付] コメント内容

━━━ 重要コメント ━━━
- [日付] コメント内容

━━━ 推奨コメント ━━━
- [日付] コメント内容
```

## 注意事項

1. **後方互換性**: 旧カラムは残っているため、段階的な移行が可能
2. **データ整合性**: 新旧両方のカラムを同期して更新する必要あり
3. **テスト**: 各機能の動作確認を十分に実施すること
4. **バックアップ**: 重要な変更前は必ずバックアップを取得すること

## 問い合わせ

不明点や問題があれば、開発者に連絡してください。
