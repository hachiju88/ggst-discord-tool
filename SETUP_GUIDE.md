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
Successfully reloaded 9 application (/) commands.
Commands registered:
  - /gs
  - /gm
  - /gn
  - /gh
  - /gps
  - /gcs
  - /ge
  - /gc
  - /gmv
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

## 4. Google Cloud Runへのデプロイ（本番環境）

詳細は [DEPLOY.md](./DEPLOY.md) を参照してください。

## 5. 使い方

### 5.1 基本的な流れ

1. `/gs [キャラ名]` - 自分のメインキャラを設定
2. `/gm [相手キャラ]` - 対戦開始時に過去データを確認
3. 対戦後に `/gn [相手キャラ] [勝敗] [メモ]` - 記録を追加
4. `/gh` - 自分の対戦履歴を確認
5. `/ge` - NotebookLM用にデータをエクスポート

### 5.2 戦略管理

- `/gps add [キャラ名] [内容]` - 個人専用の戦略を追加
- `/gps view [キャラ名]` - 個人戦略を表示
- `/gcs add [キャラ名] [内容]` - 全員で共有する対策情報を追加
- `/gcs view [キャラ名]` - 共通対策を表示

### 5.3 NotebookLM連携

1. `/ge` でデータをダウンロード
2. [NotebookLM](https://notebooklm.google.com/)にアクセス
3. ダウンロードしたMarkdownファイルをアップロード
4. AIに質問して戦略を立てる
5. 得た戦略を `/gps add` または `/gcs add` で登録

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

### Cloud Runでエラーが表示される

- Cloud Run Logsを確認
- 環境変数が正しく設定されているか確認
- Tursoのtoken有効期限を確認

### データベース関連のエラー

- Turso認証情報が正しいか確認
- Tursoのtoken有効期限を確認
- スキーマが正しく作成されているか確認

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。