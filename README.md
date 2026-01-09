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

`.env.example`をコピーして設定します：

```bash
cp .env.example .env
```

必須の環境変数：
- `DISCORD_TOKEN` - Discord Developer PortalのBot Token
- `DISCORD_APPLICATION_ID` - Discord Developer PortalのApplication ID
- `TURSO_DATABASE_URL` - TursoのDatabase URL
- `TURSO_AUTH_TOKEN` - TursoのAuth Token

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

### 1. Tursoデータベースの準備

1. [Turso](https://turso.tech/)でアカウントを作成
2. 新しいdatabaseを作成
3. Database URLとAuth Tokenを取得

### 2. Renderアカウント作成

[Render](https://render.com/)でアカウントを作成

### 3. 新しいWeb Serviceを作成

1. Render Dashboardで「New +」→「Web Service」を選択
2. GitHubリポジトリを接続
3. 以下の設定を入力:

   - **Name**: ggst-discord-bot（任意）
   - **Environment**: Node
   - **Region**: Oregon（推奨）
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Free（無料）

### 4. 環境変数の設定

Render Dashboardで以下の環境変数を設定:

| Key | Value |
|-----|-------|
| `DISCORD_TOKEN` | Discord Bot Token |
| `DISCORD_APPLICATION_ID` | Discord Application ID |
| `TURSO_DATABASE_URL` | Turso Database URL |
| `TURSO_AUTH_TOKEN` | Turso Auth Token |
| `NODE_ENV` | `production` |

### 5. デプロイ

1. 「Manual Deploy」→「Deploy latest commit」をクリック
2. ログを確認してデプロイが成功したか確認

### 6. Uptime Robot設定（スリープ対策）

Renderの無料プランはリクエストがない状態で15分以上経つとスリープ状態になります。これを防ぐため、Uptime Robotでヘルスチェックを設定します：

1. [Uptime Robot](https://uptimerobot.com/)でアカウントを作成
2. 「Add New Monitor」をクリック
3. 以下の設定を入力:

   - **Monitor Type**: HTTP(s)
   - **URL**: `https://<your-render-service-url>/health`
   - **Friendly Name**: GGST Discord Bot
   - **Check Interval**: 5分（推奨）

4. 「Create Monitor」をクリック

### 7. コマンドの登録（Render環境）

一度だけコマンド登録を実行します：

```bash
npm run register-commands
```

環境変数が正しく設定されていれば、ローカルまたはRender shellから実行できます。

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

## トラブルシューティング

### Botが起動しない

- `.env`ファイルが正しく設定されているか確認
- `TURSO_DATABASE_URL`と`TURSO_AUTH_TOKEN`が正しいか確認
- Tursoのtoken有効期限を確認

### コマンドが表示されない

- `npm run register-commands`を実行したか確認
- Discord側の反映に数分かかる場合があります
- Discordアプリを再起動してみてください

## ライセンス

MIT