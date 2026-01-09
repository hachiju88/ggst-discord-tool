# セットアップガイド

## 1. Discord Botの作成

### 1.1 Discord Developer Portalでアプリケーションを作成

1. [Discord Developer Portal](https://discord.com/developers/applications)にアクセス
2. 「New Application」をクリック
3. アプリケーション名を入力（例: GGST Match Tracker）

### 1.2 Botを作成

1. 左メニューから「Bot」を選択
2. 「Add Bot」をクリック
3. 「Reset Token」をクリックしてBot Tokenを取得（後で使用）
4. 「Privileged Gateway Intents」セクションで以下を有効化:
   - PRESENCE INTENT: オフ
   - SERVER MEMBERS INTENT: オフ
   - MESSAGE CONTENT INTENT: オフ（スラッシュコマンドのみなので不要）

### 1.3 OAuth2設定

1. 左メニューから「OAuth2」→「URL Generator」を選択
2. 「SCOPES」で以下を選択:
   - `bot`
   - `applications.commands`
3. 「BOT PERMISSIONS」で以下を選択:
   - Send Messages
   - Embed Links
   - Attach Files
   - Use Slash Commands
4. 生成されたURLをコピーしてブラウザで開く
5. Botを招待したいDiscordサーバーを選択

### 1.4 Application IDを取得

1. 左メニューから「General Information」を選択
2. 「APPLICATION ID」をコピー（後で使用）

## 2. Tursoデータベースの準備

### 2.1 Tursoアカウント作成

1. [Turso](https://turso.tech/)にアクセス
2. 「Get Started」をクリック
3. GitHubアカウントでログイン（推奨）またはメールアドレスで登録

### 2.2 データベース作成

1. Turso Dashboardで「Create」をクリック
2. データベース名を入力（例: `ggst-discord-bot`）
3. リージョンを選択（`aws-ap-northeast-1`推奨：東京）
4. 「Create」をクリック

### 2.3 認証情報取得

1. 作成したDatabaseを開く
2. Database URLをコピー（例: `libsql://database-name.aws-ap-northeast-1.turso.io`）
3. 「Generate Token」をクリックしてAuth Tokenを取得
4. トークンはセキュアに保管してください

## 3. ローカル開発環境のセットアップ

### 3.1 依存関係のインストール

```bash
cd ggst-discord-tool
npm install
```

### 3.2 環境変数の設定

`.env.example`を`.env`にコピー:

```bash
cp .env.example .env
```

`.env`ファイルを編集して、以下を設定:

```env
DISCORD_TOKEN=<Discord Developer PortalのBot Token>
DISCORD_APPLICATION_ID=<Discord Developer PortalのApplication ID>
TURSO_DATABASE_URL=libsql://<database-name>.aws-ap-northeast-1.turso.io
TURSO_AUTH_TOKEN=<TursoのAuth Token>
NODE_ENV=development
LOG_LEVEL=info
```

### 3.3 コマンドの登録

Discordにスラッシュコマンドを登録:

```bash
npm run register-commands
```

成功すると以下のメッセージが表示されます:

```
Successfully reloaded 7 application (/) commands.
Commands registered:
  - /ggst-setmychar
  - /ggst-addnote
  - /ggst-history
  - /ggst-strategy
  - /ggst-common-strategy
  - /ggst-match
  - /ggst-export
```

### 3.4 Botの起動

開発モード（ファイル変更を自動検知）:

```bash
npm run dev
```

本番モード:

```bash
npm run build
npm start
```

## 4. Renderへのデプロイ（本番環境）

### 4.1 GitHubリポジトリの準備

1. GitHubに新しいリポジトリを作成
2. ローカルのコードをプッシュ:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 4.2 Renderでサービスを作成

1. [Render](https://render.com/)にログイン（GitHubアカウントで作成推奨）
2. 「New +」→「Web Service」を選択
3. GitHubリポジトリを接続
4. 以下の設定を入力:

   - **Name**: ggst-discord-bot（任意）
   - **Environment**: Node
   - **Region**: Oregon（推奨）
   - **Plan**: Free
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

### 4.3 環境変数の設定

Render Dashboardで以下の環境変数を設定:

| Key | Value |
|-----|-------|
| `DISCORD_TOKEN` | Discord Bot Token |
| `DISCORD_APPLICATION_ID` | Discord Application ID |
| `TURSO_DATABASE_URL` | Turso Database URL |
| `TURSO_AUTH_TOKEN` | Turso Auth Token |
| `NODE_ENV` | `production` |

**注意**: Token類は絶対にGitにコミットしないでください。Renderで設定した環境変数が使用されます。

### 4.4 デプロイ

1. GitHubにpushすると自動的にデプロイが開始されます
2. Render Dashboardで「Manual Deploy」→「Deploy latest commit」でも手動デプロイ可能
3. ログを確認してデプロイが成功したか確認

### 4.5 Service URLの確認

1. Render Dashboardで作成したサービスを開く
2. 「Settings」タブで「Service URL」を確認（例: `https://ggst-discord-bot.onrender.com`）
3. このURLは後でUptime Robot設定に使用します

### 4.6 コマンドの登録（Render環境）

Render上で一度だけコマンド登録を実行:

```bash
npm run register-commands
```

Render Shellから実行するか、以下のコマンドをローカルで実行（環境変数はRenderの値を使用）:

```bash
DISCORD_TOKEN=<value> DISCORD_APPLICATION_ID=<value> npm run register-commands
```

## 5. Uptime Robot設定（スリープ対策）

Renderの無料プランは15分以上リクエストがない場合、自動的にスリープ状態になります。Uptime Robotでヘルスチェックを実行してスリープを防ぎます。

### 5.1 Uptime Robotアカウント作成

1. [Uptime Robot](https://uptimerobot.com/)にアクセス
2. 「Sign Up」をクリック
3. メールアドレスでアカウント作成

### 5.2 Monitorの作成

1. Uptime Robot Dashboardで「Add New Monitor」をクリック
2. 以下の設定を入力:

   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: GGST Discord Bot
   - **URL**: `https://<your-render-service-url>/health`
     - Service URLは[4.5](#45-service-urlの確認)で確認したもの
   - **Check Interval**: 5分（推奨）
   - **Alert Contacts**: 通知先メールを設定（任意）

3. 「Create Monitor」をクリック

### 5.3 動作確認

1. Uptime Robotダッシュボードで「Uptime」が表示されたら成功
2. Renderサービスがスリープ状態から起動することを確認

## 6. 使い方

### 6.1 基本的な流れ

1. `/ggst-setmychar [キャラ名]` - 自分のメインキャラを設定
2. `/ggst-match [相手キャラ]` - 対戦開始時に過去データを確認
3. 対戦後に `/ggst-addnote [相手キャラ] [勝敗] [メモ]` - 記録を追加
4. `/ggst-history` - 自分の対戦履歴を確認
5. `/ggst-export` - NotebookLM用にデータをエクスポート

### 6.2 戦略管理

- `/ggst-strategy add [キャラ名] [内容]` - 個人専用の戦略を追加
- `/ggst-strategy view [キャラ名]` - 個人戦略を表示
- `/ggst-common-strategy add [キャラ名] [内容]` - 全員で共有する対策情報を追加
- `/ggst-common-strategy view [キャラ名]` - 共通対策を表示

### 6.3 NotebookLM連携

1. `/ggst-export` でデータをダウンロード
2. [NotebookLM](https://notebooklm.google.com/)にアクセス
3. ダウンロードしたMarkdownファイルをアップロード
4. AIに質問して戦略を立てる
5. 得た戦略を `/ggst-strategy add` または `/ggst-common-strategy add` で登録

## トラブルシューティング

### コマンドが表示されない

- コマンド登録を実行したか確認: `npm run register-commands`
- Discord側の反映に数分かかる場合があります
- Discordアプリを再起動してみてください

### Botが起動しない

- `.env`ファイルが正しく設定されているか確認
- `DISCORD_TOKEN`と`DISCORD_APPLICATION_ID`が正しいか確認
- `TURSO_DATABASE_URL`と`TURSO_AUTH_TOKEN`が正しいか確認
- `npm install`を実行して依存関係をインストール

### Renderでエラーが表示される

- Render Dashboardでログを確認
- 環境変数が正しく設定されているか確認
- Tursoのtoken有効期限を確認

### Uptime Robotの監視が機能しない

- Service URLが正しいか確認
- `/health`エンドポイントが動作しているか確認（ブラウザでアクセス）
- Renderサービスが正常に起動しているか確認

### データベース関連のエラー

- Turso認証情報が正しいか確認
- Tursoのtoken有効期限を確認
- スキーマが正しく作成されているか確認

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。