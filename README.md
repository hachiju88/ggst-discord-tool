# ギルティギア・ストライブ対戦情報管理Bot

Discord botでGuilty Gear Striveの対戦記録と戦略を管理します。

## 機能

- メインキャラクター設定
- 対戦記録の管理（勝敗、メモ）
- 個人専用戦略メモ
- 全ユーザー共通の対策情報
- NotebookLM連携（データエクスポート）
- 対戦履歴と統計表示

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example`を`.env`にコピーして、Discord Bot TokenとApplication IDを設定してください。

```bash
cp .env.example .env
```

### 3. Discord Bot の作成

1. [Discord Developer Portal](https://discord.com/developers/applications)にアクセス
2. 新しいアプリケーションを作成
3. Bot タブから Bot Token を取得
4. OAuth2 → URL Generator で以下のスコープとパーミッションを選択:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Use Slash Commands`, `Attach Files`
5. 生成されたURLでBotをサーバーに招待

### 4. 開発環境での起動

```bash
npm run dev
```

### 5. コマンドの登録

初回起動時にDiscordにスラッシュコマンドを登録する必要があります:

```bash
npm run register-commands
```

## デプロイ (Render)

### 1. Renderアカウント作成

[Render](https://render.com/)でアカウントを作成

### 2. 新しいWeb Serviceを作成

- Repository: このGitHubリポジトリを接続
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Environment: Node

### 3. 環境変数の設定

Render Dashboardで以下の環境変数を設定:

- `DISCORD_TOKEN`
- `DISCORD_APPLICATION_ID`
- `DATABASE_PATH=/opt/render/project/data/ggst.db`
- `NODE_ENV=production`

### 4. Disk の作成

Render DashboardでDiskを作成:

- Name: `ggst-data`
- Mount Path: `/opt/render/project/data`
- Size: 1GB

## コマンド一覧

- `/ggst-setmychar [キャラ名]` - メインキャラを設定
- `/ggst-match [相手キャラ]` - 対戦開始時の情報表示
- `/ggst-addnote [相手キャラ] [勝敗] [メモ]` - 対戦記録を追加
- `/ggst-history [キャラ] [件数]` - 対戦履歴を表示
- `/ggst-strategy add [キャラ名] [内容]` - 個人戦略を追加
- `/ggst-strategy view [キャラ名]` - 個人戦略を表示
- `/ggst-common-strategy add [キャラ名] [内容]` - 共通対策を追加
- `/ggst-common-strategy view [キャラ名]` - 共通対策を表示
- `/ggst-export` - NotebookLM用にデータをエクスポート

## ライセンス

MIT
