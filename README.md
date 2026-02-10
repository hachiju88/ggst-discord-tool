# ギルティギア・ストライブ対戦情報管理Bot

Discord botでGuilty Gear Striveの対戦記録・戦略・コンボを包括的に管理します。音声入力に最適化された簡潔なコマンド設計と、NotebookLM連携によるAI分析機能を搭載。

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-blue.svg)](https://www.typescriptlang.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-14.14.1-5865F2.svg)](https://discord.js.org/)
[![Turso](https://img.shields.io/badge/Database-Turso-00E699.svg)](https://turso.tech/)

---

## 📋 目次

- [主な機能](#主な機能)
- [技術スタック](#技術スタック)
- [データベース構造](#データベース構造)
- [セットアップ](#セットアップ)
- [コマンド一覧](#コマンド一覧)
- [開発ガイド](#開発ガイド)
- [マイグレーション](#マイグレーション)
- [デプロイ](#デプロイ)
- [トラブルシューティング](#トラブルシューティング)

---

## 主な機能

### ✅ 実装済み機能

#### 🎮 対戦記録管理
- 勝敗・メモの記録
- 使用キャラクター別の記録
- 対戦相手別の統計
- キャラクター別勝率表示
- **敗因分析機能**
  - 共通敗因マスタ（21種類）
  - ユーザー独自敗因登録（直接入力で自動登録）
  - 独自敗因を優先表示（オートコンプリート）
  - 敗因トップ3の自動集計・表示
- **優先度機能**
  - 🔴 重要（絶対に覚える）
  - 🟡 大事（できれば覚える）
  - 🟢 推奨（余裕があれば）

#### 📚 戦略管理
- 個人専用戦略メモ（自分だけに表示）
- 全ユーザー共通の対策情報（全員に表示）
- キャラクター別に整理
- **完全CRUD対応**（追加・表示・編集・削除）

- **完全CRUD対応**（追加・表示・編集・削除）
50: 
51: #### 🔐 権限管理 (New!)
52: - **3段階の権限システム**
53:   - **Admin (管理者)**: 全コマンド実行可、役割設定、バックアップ管理
54:   - **Editor (編集者)**: 共通データの追加・編集・削除
55:   - **General (一般)**: データの閲覧のみ
56: - **ロールベース設定**
57:   - DiscordのロールとBotの権限を紐付け (`/admin set-role`)
58:   - Discord自体の管理者権限を持つユーザーは自動的にAdmin扱い
59: 
60: #### 💾 バックアップシステム (New!)
61: - **DB保存型バックアップ**
62:   - コマンド一発で共通データをDBに保存 (`/admin backup`)
63:   - **世代管理機能**: 最新5件まで保持、古いものは自動削除
64:   - **簡単復元**: 保存されたバックアップを選択して復元 (`/admin restore`)
65: 
66: #### 🥊 コンボ管理
- キャラクター別コンボ登録
- 場所・テンションゲージ・始動タイプ別の整理
- メモの記録
- **技名オートコンプリート対応**（combo1-20フィールドで各技を選択可能）
- **共通技統合表示**（5P、RC、移動技など38種類を優先表示）
- **表示範囲フィルタ**（自分のコンボ/みんなのコンボ）
- フィルタリング機能（位置・テンション・始動・表示範囲）
- **完全CRUD対応**（追加・表示・編集・削除）

> **⚠️ オートコンプリートの制限事項**
> Discordのオートコンプリートは最大25件までしか表示されません。共通技（38種類）を優先表示するため、キャラクター専用技が初期表示に含まれない場合があります。その場合は技名やコマンド表記（例: `gun`, `236p`）を入力して絞り込んでください。

#### 🎯 技データ管理
- 全32キャラクターの技データ（564+ moves）
- **共通技システム**（全キャラ共通の36技を一元管理）
  - 通常技（5P、5K、2P、2K等）
  - 特殊技（投げ、ダスト等）
  - システム技（RC、WA、移動等）
- 技の追加・編集・削除（CRUD操作）
- コンボ入力時の技名オートコンプリート

#### 🤖 NotebookLM連携
- 対戦データをMarkdown形式でエクスポート
- NotebookLMにアップロードしてAI分析
- 分析結果を個人戦略として保存

#### ⚡ オートコンプリート最適化
- キャラクター名の高速入力補完
- 約10倍の速度改善（キャッシュ機構）
- 空入力時の即座応答

#### 🎤 音声入力対応
- **簡潔なコマンド名**（全9コマンド）
- 短くて覚えやすい: `/gs`, `/gm`, `/gn`, `/gh`, `/gps`, `/gcs`, `/ge`, `/gc`, `/gmv`
- 音声入力で素早く実行可能

---

## 技術スタック

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| **Runtime** | Node.js 18+ | 実行環境 |
| **Language** | TypeScript 5.3 | 型安全な開発 |
| **Bot Framework** | discord.js v14 | Discord Bot API |
| **Database** | Turso (libSQL) | クラウドSQLiteデータベース |
| **Web Server** | Express 5 | ヘルスチェックエンドポイント |
| **Hosting** | Google Cloud Run | デプロイ環境 |
| **Dev Tools** | tsx, tsc | 開発・ビルド |

### アーキテクチャ

```
┌─────────────────┐
│  Discord User   │
└────────┬────────┘
         │ Slash Commands
         ▼
┌─────────────────┐
│  Discord Bot    │
│  (discord.js)   │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌────────────┐
│Commands│ │   Models   │
│Handler │ │   Layer    │
└────────┘ └──────┬─────┘
                  │
                  ▼
           ┌──────────────┐
           │Turso Database│
           │   (libSQL)   │
           └──────────────┘
```

---

## データベース構造

### 現在のバージョン: v2

v2スキーマでは、キャラクター名を文字列からID管理に変更し、敗因管理・プライオリティ機能・コンボ管理・技データ管理を完全実装しました。

#### 主要テーブル

| テーブル | 説明 | レコード数 |
|---------|------|----------|
| `characters` | キャラクターマスタ | 32 |
| `users` | ユーザー情報 | 動的 |
| `matches` | 対戦記録 | 動的 |
| `strategies` | 個人戦略 | 動的 |
| `common_strategies` | 共通対策 | 動的 |
| `defeat_reasons` | ユーザー独自敗因 | 動的 |
| `common_defeat_reasons` | 共通敗因マスタ | 20 |
| `character_moves` | コマンド技データ | 564+ |
| `combos` | コンボ情報 | 動的 |

#### ER図（簡略版）

```
users                    characters
┌──────────────┐        ┌──────────────┐
│discord_id PK │        │id PK         │
│main_char_id  │───────▶│name          │
└──────────────┘        │name_en       │
       │                └──────┬───────┘
       │                       │
       │                       │
       ▼                       │
matches                        │
┌──────────────┐              │
│id PK         │              │
│user_id       │──────────────┘
│my_char_id    │──────────────┐
│opp_char_id   │──────────────┘
│result        │
│defeat_reason │
│priority      │
│note          │
└──────────────┘
       │
       ▼
combos                  character_moves
┌──────────────┐       ┌──────────────┐
│id PK         │       │id PK         │
│user_id       │       │character_id  │───┐
│character_id  │───────│move_name     │   │
│location      │       │move_notation │   │
│tension_gauge │       │move_type     │   │
│starter       │       └──────────────┘   │
│combo_notation│                          │
│damage        │                          │
│note          │                          │
└──────────────┘                          │
                                          │
                                          │
                              ┌───────────┘
                              ▼
                         characters
```

詳細は [MIGRATION-V2.md](./MIGRATION-V2.md) を参照してください。

---

## セットアップ

### 前提条件

- Node.js 18以上
- npm または yarn
- Discord Developer Portalへのアクセス
- Tursoアカウント（無料）

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd ggst-discord-tool
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

`.env.example`をコピーして`.env`を作成：

```bash
cp .env.example .env
```

必須の環境変数：

```env
# Discord Bot設定
DISCORD_TOKEN=your_discord_bot_token
DISCORD_APPLICATION_ID=your_application_id

# Turso Database設定
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your_auth_token

# 環境（開発時はdevelopment）
NODE_ENV=development
```

### 4. Discord Botの作成

1. [Discord Developer Portal](https://discord.com/developers/applications)にアクセス
2. 「New Application」をクリック
3. Bot タブから Bot Token を取得（`DISCORD_TOKEN`）
4. General Information タブから Application ID を取得（`DISCORD_APPLICATION_ID`）
5. OAuth2 → URL Generator で以下を選択:
   - **Scopes**: `bot`, `applications.commands`
   - **Bot Permissions**:
     - Send Messages
     - Embed Links
     - Attach Files
     - Use Slash Commands
6. 生成されたURLでBotをサーバーに招待

### 5. Turso Databaseの作成

```bash
# Turso CLIのインストール（初回のみ）
curl -sSfL https://get.tur.so/install.sh | bash

# ログイン
turso auth login

# データベース作成
turso db create ggst-discord-bot

# 接続情報取得
turso db show ggst-discord-bot
```

取得した`URL`と`Token`を`.env`に設定します。

### 6. データベース初期化

```bash
# v2スキーマへマイグレーション（初回のみ）
npm run migrate:v2
```

実行すると：
- 全テーブル作成
- 32キャラクター登録
- 20種類の共通敗因登録

### 7. キャラクター技データの登録（オプション）

```bash
# 全32キャラクターの技データを登録（564+ moves）
npm run seed:moves
```

### 8. コマンド登録

```bash
npm run register-commands
```

### 9. 起動

```bash
# 開発モード（ホットリロード）
npm run dev

# 本番モード
npm run build
npm start
```

---

## コマンド一覧

### 全コマンド（9コマンド）

簡潔で覚えやすいコマンド名を採用しています。

#### 基本コマンド

| コマンド | 説明 |
|---------|------|
| `/gs` | メインキャラを設定 |
| `/gm` | 対戦開始時の情報表示（敗因統計・優先度別コメント・期間フィルタ付き） |
| `/gn` | 対戦記録を追加（敗因・優先度対応） |
| `/gh` | 対戦履歴を表示（期間フィルタ付き、デフォルト: 1日） |
| `/ge` | NotebookLM用エクスポート（期間フィルタ付き、デフォルト: 1日） |

#### 戦略管理

| コマンド | サブコマンド | 説明 |
|---------|------------|------|
| `/gps` | `add` | 個人戦略を追加 |
|  | `view` | 個人戦略を表示 |
|  | `edit` | 個人戦略を編集 |
|  | `delete` | 個人戦略を削除 |
| `/gcs` | `add` | 共通対策を追加 |
|  | `view` | 共通対策を表示 |
|  | `edit` | 共通対策を編集 |
|  | `delete` | 共通対策を削除 |

#### コンボ管理

| コマンド | サブコマンド | 説明 |
|---------|------------|------|
| `/gc` | `add` | コンボを追加 |
|  | `view` | コンボを表示 |
|  | `edit` | コンボを編集 |
|  | `delete` | コンボを削除 |

#### 技データ管理

| コマンド | サブコマンド | 説明 |
|---------|------------|------|
| `/gmv` | `add` | 技を追加 |
|  | `view` | 技一覧を表示 |
|  | `edit` | 技を編集 |
|  | `delete` | 技を削除 |

| `/gmv` | `add` | 技を追加 |
358: |  | `view` | 技一覧を表示 |
359: |  | `edit` | 技を編集 |
360: |  | `delete` | 技を削除 |
361:
362: #### 管理機能 (New!)
363:
364: | コマンド | サブコマンド | 説明 |
365: |---------|------------|------|
366: | `/admin` | `set-role` | 権限ロールを設定 (Admin/Editor) |
367: |  | `view-settings` | 現在の権限設定を確認 |
368: |  | `backup` | データのバックアップを作成 |
369: |  | `restore` | バックアップからデータを復元 |
370: 
371: ### 使用例

```bash
# 初回セットアップ
/gs character:ソル=バッドガイ

# 対戦前に情報確認（敗因統計・優先度別コメント表示・期間フィルタ付き）
/gm opponent:カイ=キスク period:1週間  # 過去1週間の統計
/gm opponent:カイ=キスク  # デフォルトは全期間

# 対戦後に記録（敗因・優先度付き）
/gn opponent:カイ=キスク result:loss defeat_reason:対空が甘い priority:critical note:昇龍を確実に落とす

# 対戦履歴確認（期間フィルタ付き）
/gh period:1週間 opponent:カイ=キスク limit:10
/gh period:1ヶ月  # 過去1ヶ月の全対戦履歴
/gh  # デフォルトは過去1日の履歴

# コンボ登録（技名オートコンプリート対応）
/gc add character:ソル=バッドガイ location:画面中央 tension:50 starter:通常 note:基本コンボ combo1:5K combo2:6H combo3:623H

# コンボ表示（フィルタ可能・表示範囲選択可能）
/gc view character:ソル=バッドガイ location:画面端 tension:100 scope:みんなのコンボ

# コンボ編集
/gc edit id:1 note:改良版 combo1:cS combo2:6H combo3:623H

# 個人戦略管理
/gps add character:カイ=キスク content:RTLに注意
/gps view character:カイ=キスク  # IDを確認
/gps edit id:5 content:RTL後の確反を取る
/gps delete id:5

# 共通対策管理
/gcs add character:カイ=キスク content:6Pで昇龍に勝てる
/gcs view character:カイ=キスク  # IDを確認
/gcs edit id:10 content:6Pで昇龍に相打ち以上
/gcs delete id:10

# 技データ追加
/gmv add character:ソル=バッドガイ move_name:ガンフレイム move_notation:236P

# 技データ表示
/gmv view character:ソル=バッドガイ

# NotebookLM連携（期間フィルタ付き）
/ge period:1週間  # 過去1週間のデータをエクスポート
/ge period:無期限  # 全期間のデータをエクスポート
/ge  # デフォルトは過去1日
→ ファイルをダウンロード → NotebookLMにアップロード → 分析
→ 得た知見を /gps add で登録
```

### コマンド詳細

#### `/gn` (addnote) のパラメータ

- `opponent` (必須): 対戦相手のキャラ
- `result` (任意): 勝敗（win/loss）
- `defeat_reason` (任意): 敗因（オートコンプリート対応、直接入力で自動登録）
  - オートコンプリート：独自敗因 → 共通敗因の順で表示
  - 直接入力：自動的に独自敗因として登録
  - 共通敗因（21種類）：昇龍に刺された、崩しを喰らった、固めから抜けられない、対空できなかった、暴れを狩られた、投げ抜けできなかった、ゲージ管理ミス、起き攻めを凌げなかった、確反を入れられなかった、飛び込みを通された、中距離での立ち回り負け、遠距離で何もできなかった、バーストタイミングミス、待ちに対応できなかった、ラッシュについていけなかった、セットプレイに嵌められた、リバサに対応できなかった、差し返しを喰らった、択をかけられなかった、その他、**コンボミス**
- `priority` (任意): 優先度（critical/important/recommended）
- `note` (任意): メモ（最大1000文字）
- `mycharacter` (任意): 使用キャラ（未設定時はメインキャラ）

#### `/gm` (match) のパラメータ

- `opponent` (必須): 対戦相手のキャラクター
- `mycharacter` (任意): 使用キャラクター（未指定の場合はメインキャラ）
- `period` (任意): 統計期間（デフォルト: 無期限）
  - 選択肢: 1日 / 1週間 / 1ヶ月 / 無期限

#### `/gm` (match) の表示内容

- 📊 戦績（勝率・対戦数、期間フィルタ適用）
- 📉 敗因トップ3（敗北理由の統計、期間フィルタ適用）
- 🔴 重要（絶対に覚える）：critical優先度のコメント（最大10件）
- 🟡 大事（できれば覚える）：important優先度のコメント（最大10件）
- 🟢 推奨（余裕があれば）：recommended優先度のコメント（最大10件）
- 📚 共通対策情報（最大10件）
- 📝 個人戦略（最大10件）
- 📋 直近5戦の詳細（期間フィルタ適用）

#### `/gh` (history) のパラメータ

- `period` (任意): 検索期間（デフォルト: 1日）
  - 選択肢: 1日 / 1週間 / 1ヶ月 / 無期限
- `opponent` (任意): 対戦相手のキャラクターで絞り込み（オートコンプリート対応）
- `mycharacter` (任意): 使用キャラクターで絞り込み（オートコンプリート対応）
- `limit` (任意): 表示件数（デフォルト: 10、最大: 50）

#### `/ge` (export) のパラメータ

- `period` (任意): エクスポート期間（デフォルト: 1日）
  - 選択肢: 1日 / 1週間 / 1ヶ月 / 無期限

#### `/gc` (combo) のパラメータ

**addサブコマンド:**
- `character` (必須): キャラクター（オートコンプリート対応）
- `location` (必須): 位置（画面中央/画面端）
- `tension` (必須): テンションゲージ（0%/50%/100%）
- `starter` (必須): 始動（通常/カウンター）
- `note` (任意): コメント（最大500文字）
- `combo1` - `combo20` (combo1以降は任意): 技入力（各フィールドで技名オートコンプリート対応）

**viewサブコマンド:**
- `character` (必須): キャラクター
- `location` (任意): 位置でフィルタ
- `tension` (任意): テンションゲージでフィルタ
- `starter` (任意): 始動でフィルタ
- `scope` (任意): 表示範囲（自分のコンボのみ/みんなのコンボ）

**editサブコマンド:**
- `id` (必須): コンボID（`/gc view`で確認）
- `location` (任意): 新しい位置
- `tension` (任意): 新しいテンションゲージ
- `starter` (任意): 新しい始動
- `note` (任意): 新しいコメント
- `combo1` - `combo20` (全て任意): 新しい技入力

**deleteサブコマンド:**
- `id` (必須): コンボID

---

## 開発ガイド

### プロジェクト構造

```
ggst-discord-tool/
├── src/
│   ├── index.ts              # エントリーポイント
│   ├── bot.ts                # Discord Client初期化
│   ├── config/
│   │   └── constants.ts      # 定数定義（優先度・位置・ゲージ等）
│   ├── database/
│   │   ├── index.ts          # DB接続
│   │   ├── schema-v2.sql     # 現行スキーマ
│   │   ├── seed-data.sql     # 初期データ
│   │   ├── seed-character-moves.ts  # 技データ（32キャラ）
│   │   └── migrate-to-v2.ts  # マイグレーション
│   ├── models/
│   │   ├── Character.ts      # キャラクターモデル
│   │   ├── CharacterMove.ts  # 技データモデル
│   │   ├── Combo.ts          # コンボモデル
│   │   ├── DefeatReason.ts   # 敗因モデル
│   │   ├── User.ts           # ユーザーモデル
│   │   ├── Match.ts          # 対戦記録モデル
│   │   ├── Strategy.ts       # 個人戦略モデル
│   │   └── CommonStrategy.ts # 共通戦略モデル
│   ├── commands/
│   │   ├── index.ts          # コマンドルーティング
│   │   ├── setmychar.ts      # /gs
│   │   ├── match.ts          # /gm
│   │   ├── addnote.ts        # /gn
│   │   ├── history.ts        # /gh
│   │   ├── strategy.ts       # /gps
│   │   ├── common-strategy.ts # /gcs
│   │   ├── export.ts         # /ge
│   │   ├── combo.ts          # /gc
│   │   └── move.ts           # /gmv
│   └── types/
│       └── index.ts          # 型定義
├── dist/                     # ビルド出力
├── MIGRATION-V2.md           # マイグレーションガイド
├── package.json
├── tsconfig.json

└── README.md
```

### npm スクリプト

```bash
# 開発
npm run dev              # ホットリロード開発サーバー

# ビルド
npm run build            # TypeScriptコンパイル + SQLファイルコピー

# 実行
npm start                # 本番モード起動

# データベース
npm run migrate:v2       # v2スキーマへマイグレーション
npm run seed:moves       # キャラクター技データ登録（564+ moves）

# Discord
npm run register-commands # コマンド登録
```

### コーディング規約

- **TypeScript strict mode** を使用
- **関数はasync/await** で非同期処理
- **エラーハンドリング** は必須（try-catchまたはエラーハンドラ）
- **コミットメッセージ** は英語、わかりやすく
- **データベース操作** はモデル層を経由

### デバッグ

```bash
# ローカルでログ確認
npm run dev

# Cloud Runでログ確認
# Google Cloud Console → Cloud Run → Logs

# データベース確認
turso db shell ggst-discord-bot
> SELECT * FROM characters;
> SELECT * FROM character_moves LIMIT 10;
```

---

## マイグレーション

### v1 → v2 移行

データベースv2への移行は**自動**で実行できます。

```bash
npm run migrate:v2
```

#### 移行内容

1. ✅ 新テーブル作成
   - `characters` (32キャラ)
   - `common_defeat_reasons` (20敗因)
   - `defeat_reasons`, `character_moves`, `combos`

2. ✅ 既存テーブル拡張
   - `users`: `main_character_id`追加
   - `matches`: `my_character_id`, `opponent_character_id`, `defeat_reason_id`, `priority`追加
   - `strategies`, `common_strategies`: `target_character_id`追加

3. ✅ データ移行
   - 既存ユーザーのキャラ名 → キャラIDに変換
   - 既存対戦記録のキャラ名 → キャラIDに変換

4. ✅ 後方互換性
   - 旧カラム（`main_character`, `my_character`等）は保持
   - ロールバック可能

詳細は [MIGRATION-V2.md](./MIGRATION-V2.md) を参照。

---

## デプロイ

Google Cloud Runへのデプロイに対応しています。
詳細は [DEPLOY.md](./DEPLOY.md) を参照してください。

---

## トラブルシューティング

### Botが起動しない

**症状**: `npm start` でエラーが出る

**確認項目**:
- [ ] `.env`ファイルが存在するか
- [ ] `DISCORD_TOKEN`が正しいか
- [ ] `TURSO_DATABASE_URL`と`TURSO_AUTH_TOKEN`が正しいか
- [ ] `npm install`を実行したか
- [ ] `npm run build`を実行したか

### コマンドが表示されない

**症状**: Discordでコマンドが出てこない

**解決方法**:
1. `npm run register-commands`を実行
2. 数分待つ（Discord側の反映に時間がかかる）
3. Discordアプリを再起動
4. Botをサーバーから一度キックして再招待

### オートコンプリートが遅い・表示されない

**症状**: キャラクター名の候補が出ない/遅い

**解決方法**:
1. Renderがスリープしている可能性 → 任意のコマンドを実行して起動
2. ネットワーク遅延 → 少し待つ
3. キャッシュの問題 → Botを再起動

### キャラクター専用技がオートコンプリートに表示されない

**症状**: `/gc add`のcomboフィールドで、キャラクター専用技が表示されない

**原因**: Discordのオートコンプリートは最大25件までしか表示できません。共通技が38種類あるため、何も入力しない状態では共通技だけが表示されます。

**解決方法**:
- 技名やコマンド表記を入力して絞り込む
  - 例: `gun` と入力 → ガンフレイムが表示される
  - 例: `236p` と入力 → 236Pの技が表示される
- 日本語、英語名、コマンド表記のいずれでも検索可能

### マイグレーションエラー

**症状**: `npm run migrate:v2`でエラー

**確認項目**:
- [ ] Tursoの接続情報が正しいか
- [ ] インターネット接続があるか
- [ ] すでにマイグレーション済みでないか（2回目の実行はエラーにならないが、一部スキップされる）

**ロールバック**:
旧カラムは保持されているため、コードを旧バージョンに戻せば動作します。

### データが消えた

**症状**: 対戦記録が見えない

**確認項目**:
1. Tursoのデータベースに接続できているか確認
```bash
turso db shell ggst-discord-bot
> SELECT COUNT(*) FROM matches;
```
2. 環境変数の`TURSO_DATABASE_URL`が正しいDBを指しているか確認
3. 本番環境（Cloud Run）とローカル環境で異なるDBを使っていないか確認

---

## 実装完了状況

### ✅ Phase 1-6: 全機能実装完了

- [x] データベースv2スキーマ設計
- [x] マイグレーションスクリプト
- [x] キャラクターDB化（32キャラ）
- [x] 全モデル層実装
- [x] コマンド名簡略化（18コマンド→9コマンド）
- [x] 敗因分析機能
- [x] 優先度機能
- [x] コンボ管理機能（combo1-20フィールド分割・技名オートコンプリート対応）
- [x] 技データ管理機能（CRUD操作）
- [x] キャラクター技データ（564+ moves）
- [x] NotebookLM連携
- [x] デプロイ設定（render.yaml）

### ✅ v2.1.0: コマンドリファクタリング完了

- [x] コマンド数の削減（18→9コマンド）
- [x] コンボコマンドの大幅改善
  - combo1-20フィールド分割（各フィールドでオートコンプリート可能）
  - 技名オートコンプリート表示形式改善
  - viewサブコマンドにscopeフィルタ追加（自分/みんな）
  - フィールド順序最適化

### ✅ v2.1.1: 情報表示の最適化

- [x] /gm コマンドの表示件数拡張
  - 優先度別コメント（重要/大事/推奨）：最大3件→10件
  - 共通対策情報：最大3件→10件、番号表示削除
  - 個人戦略：最大3件→10件、番号表示削除
  - 読み上げ用TEXTメッセージ削除

### ✅ v2.2.0: 共通技システムと戦略CRUD機能

- [x] 共通技システムの実装
  - common_movesテーブル追加（全キャラ共通の36技を管理）
  - /gcコマンドで共通技を優先表示（5P、RC、移動技等）
  - 各キャラから328件の重複技を削除
- [x] 戦略管理の完全CRUD化
  - /gps edit/delete 追加（個人戦略の編集・削除）
  - /gcs edit/delete 追加（共通対策の編集・削除）
  - ID表示機能追加（view時にID表示）
- [x] UX改善
  - 全コマンド応答を自分のみ表示（ephemeral）
  - 旧コマンド名参照を完全削除

---

## ライセンス

MIT License

---

## 貢献

バグ報告・機能提案は GitHubのIssuesまでお願いします。

---

## サポート

質問がある場合は、開発者に連絡してください。

---

**開発者**: r-unit0000181
**バージョン**: 2.2.0 (Common Moves & Strategy CRUD)
**最終更新**: 2026-01-14
