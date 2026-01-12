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
- [今後の実装予定](#今後の実装予定)
- [トラブルシューティング](#トラブルシューティング)

---

## 主な機能

### ✅ 現在利用可能

- **対戦記録管理**
  - 勝敗・メモの記録
  - 使用キャラクター別の記録
  - 対戦相手別の統計
  - キャラクター別勝率表示

- **戦略管理**
  - 個人専用戦略メモ（自分だけに表示）
  - 全ユーザー共通の対策情報（全員に表示）
  - キャラクター別に整理

- **NotebookLM連携**
  - 対戦データをMarkdown形式でエクスポート
  - NotebookLMにアップロードしてAI分析
  - 分析結果を個人戦略として保存

- **オートコンプリート最適化**
  - キャラクター名の高速入力補完
  - 約10倍の速度改善（キャッシュ機構）
  - 空入力時の即座応答

### 🚧 実装中（v2アップデート）

- **敗因分析機能**
  - 共通敗因マスタ（20種類）
  - ユーザー独自敗因登録
  - 敗因トップ3の自動集計

- **プライオリティ機能**
  - `critical` - 最重要（全員に共有）
  - `important` - 重要（自分用）
  - `recommended` - 推奨（自分用）

- **コマンド簡略化**
  - 音声入力対応を見据えた短縮コマンド
  - `/ggst-match` → `/gm` など

### 📅 今後実装予定

- **コンボ管理機能**
  - キャラクター別コンボ登録
  - 場所・ゲージ・始動別の整理
  - コマンド技の入力補完

---

## 技術スタック

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| **Runtime** | Node.js 18+ | 実行環境 |
| **Language** | TypeScript 5.3 | 型安全な開発 |
| **Bot Framework** | discord.js v14 | Discord Bot API |
| **Database** | Turso (libSQL) | クラウドSQLiteデータベース |
| **Web Server** | Express 5 | ヘルスチェックエンドポイント |
| **Hosting** | Render (Free Tier) | デプロイ環境 |
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

v2スキーマでは、キャラクター名を文字列からID管理に変更し、敗因管理・プライオリティ機能・コンボ管理の基盤を追加しました。

#### 主要テーブル

| テーブル | 説明 | レコード数 |
|---------|------|----------|
| `characters` | キャラクターマスタ | 32 |
| `users` | ユーザー情報 | - |
| `matches` | 対戦記録 | - |
| `strategies` | 個人戦略 | - |
| `common_strategies` | 共通対策 | - |
| `defeat_reasons` | ユーザー独自敗因 | - |
| `common_defeat_reasons` | 共通敗因マスタ | 20 |
| `character_moves` | コマンド技 (未使用) | 0 |
| `combos` | コンボ情報 (未使用) | 0 |

#### ER図（簡略版）

```
users                    characters
┌──────────────┐        ┌──────────────┐
│discord_id PK │        │id PK         │
│main_char_id  │───────▶│name          │
└──────────────┘        │name_en       │
       │                └──────────────┘
       │                       ▲
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

### 7. コマンド登録

```bash
npm run register-commands
```

### 8. 起動

```bash
# 開発モード（ホットリロード）
npm run dev

# 本番モード
npm run build
npm start
```

---

## コマンド一覧

### 現在利用可能なコマンド

| コマンド | 説明 | オプション |
|---------|------|----------|
| `/ggst-setmychar` | メインキャラを設定 | `character`(必須) |
| `/ggst-match` | 対戦開始時の情報表示 | `opponent`(必須), `mycharacter`(任意) |
| `/ggst-addnote` | 対戦記録を追加 | `opponent`(必須), `result`(必須), `mycharacter`(任意), `note`(任意) |
| `/ggst-history` | 対戦履歴を表示 | `opponent`(任意), `mycharacter`(任意), `limit`(任意) |
| `/ggst-strategy add` | 個人戦略を追加 | `character`(必須), `content`(必須) |
| `/ggst-strategy view` | 個人戦略を表示 | `character`(必須) |
| `/ggst-common-strategy add` | 共通対策を追加 | `character`(必須), `content`(必須) |
| `/ggst-common-strategy view` | 共通対策を表示 | `character`(必須) |
| `/ggst-export` | NotebookLM用エクスポート | なし |

### 使用例

```
# 初回セットアップ
/ggst-setmychar character:ソル=バッドガイ

# 対戦前に情報確認
/ggst-match opponent:カイ=キスク mycharacter:ソル=バッドガイ

# 対戦後に記録
/ggst-addnote opponent:カイ=キスク result:win note:昇龍対策が効いた

# 対戦履歴確認
/ggst-history opponent:カイ=キスク limit:10

# NotebookLM連携
/ggst-export
→ ファイルをダウンロード → NotebookLMにアップロード → 分析
→ 得た知見を /ggst-strategy add で登録
```

### 今後追加予定のコマンド（v2完成後）

| コマンド | 説明 |
|---------|------|
| `/gs` | `/ggst-setmychar`の短縮版 |
| `/gm` | `/ggst-match`の短縮版 |
| `/gn` | `/ggst-addnote`の短縮版（敗因・プライオリティ追加） |
| `/gh` | `/ggst-history`の短縮版 |
| `/gps` | `/ggst-strategy`の短縮版 |
| `/gcs` | `/ggst-common-strategy`の短縮版 |
| `/ge` | `/ggst-export`の短縮版 |
| `/gc add` | コンボ追加 |
| `/gc view` | コンボ表示 |

---

## 開発ガイド

### プロジェクト構造

```
ggst-discord-tool/
├── src/
│   ├── index.ts              # エントリーポイント
│   ├── bot.ts                # Discord Client初期化
│   ├── config/
│   │   └── constants.ts      # 定数定義
│   ├── database/
│   │   ├── index.ts          # DB接続
│   │   ├── schema-v2.sql     # 現行スキーマ
│   │   ├── seed-data.sql     # 初期データ
│   │   └── migrate-to-v2.ts  # マイグレーション
│   ├── models/
│   │   ├── Character.ts      # キャラクターモデル
│   │   ├── DefeatReason.ts   # 敗因モデル
│   │   ├── User.ts           # ユーザーモデル
│   │   ├── Match.ts          # 対戦記録モデル
│   │   ├── Strategy.ts       # 個人戦略モデル
│   │   └── CommonStrategy.ts # 共通戦略モデル
│   ├── commands/
│   │   ├── index.ts          # コマンドルーティング
│   │   ├── setmychar.ts
│   │   ├── match.ts
│   │   ├── addnote.ts
│   │   ├── history.ts
│   │   ├── strategy.ts
│   │   ├── common-strategy.ts
│   │   └── export.ts
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

# Renderでログ確認
# Render Dashboard → Logs タブ

# データベース確認
turso db shell ggst-discord-bot
> SELECT * FROM characters;
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

### Renderへのデプロイ

#### 1. Render アカウント作成

[Render](https://render.com/)でアカウントを作成（無料）

#### 2. 新しいWeb Serviceを作成

1. Dashboard → 「New +」 → 「Web Service」
2. GitHubリポジトリを接続
3. 以下を設定:

```yaml
Name: ggst-discord-bot
Environment: Node
Build Command: npm install && npm run build
Start Command: npm start
Plan: Free
```

#### 3. 環境変数を設定

| Key | Value |
|-----|-------|
| `DISCORD_TOKEN` | Discord Bot Token |
| `DISCORD_APPLICATION_ID` | Discord Application ID |
| `TURSO_DATABASE_URL` | `libsql://xxx.turso.io` |
| `TURSO_AUTH_TOKEN` | `eyJhbG...` |
| `NODE_ENV` | `production` |

#### 4. デプロイ

「Manual Deploy」→「Deploy latest commit」

#### 5. マイグレーション実行（初回のみ）

Render Shell（Dashboard → Shell タブ）で：

```bash
npm run migrate:v2
```

#### 6. コマンド登録（初回のみ）

```bash
npm run register-commands
```

### スリープ対策（オプション）

Renderの無料プランは15分無通信でスリープします。
[Uptime Robot](https://uptimerobot.com/)で5分間隔のヘルスチェックを設定すると、常時起動を維持できます。

**監視URL**: `https://your-service.onrender.com/health`

---

## 今後の実装予定

### Phase 1: 基盤整備 ✅ (完了)
- [x] データベースv2スキーマ設計
- [x] マイグレーションスクリプト
- [x] キャラクターDB化
- [x] Characterモデル
- [x] DefeatReasonモデル

### Phase 1: 残作業 🚧 (次回実装)
- [ ] 既存モデル更新（User, Match, Strategy, CommonStrategy）
- [ ] コマンド名エイリアス追加
- [ ] 全コマンドのキャラID対応

### Phase 2: addnoteコマンド改善
- [ ] 勝敗を任意化
- [ ] 敗因フィールド追加
- [ ] プライオリティ追加（critical/important/recommended）
- [ ] 引数順序変更

### Phase 3: matchコマンド改善
- [ ] 新レイアウト実装
- [ ] 敗因トップ3表示
- [ ] プライオリティ別コメント表示
- [ ] 共通の基本情報表示

### Phase 4: コンボ管理機能
- [ ] `/gc add` - コンボ追加
- [ ] `/gc view` - コンボ表示
- [ ] キャラクターコマンド技データ準備
- [ ] コマンド技の入力補完

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
3. Render環境とローカル環境で異なるDBを使っていないか確認

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
**バージョン**: 2.0.0 (Phase 1 Foundation Complete)
**最終更新**: 2026-01-12
