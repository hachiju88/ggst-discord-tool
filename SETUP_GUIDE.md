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

## 2. ローカル開発環境のセットアップ

### 2.1 依存関係のインストール

```bash
cd ggst-discord-tool
npm install
```

### 2.2 環境変数の設定

`.env.example`を`.env`にコピー:

```bash
cp .env.example .env
```

`.env`ファイルを編集して、以下を設定:

```env
DISCORD_TOKEN=<Discord Developer PortalのBot Token>
DISCORD_APPLICATION_ID=<Discord Developer PortalのApplication ID>
DATABASE_PATH=./data/ggst.db
NODE_ENV=development
LOG_LEVEL=info
```

### 2.3 コマンドの登録

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

### 2.4 Botの起動

開発モード（ファイル変更を自動検知）:

```bash
npm run dev
```

本番モード:

```bash
npm run build
npm start
```

## 3. Renderへのデプロイ（本番環境）

### 3.1 GitHubリポジトリの準備

1. GitHubに新しいリポジトリを作成
2. ローカルのコードをプッシュ:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 3.2 Renderでサービスを作成

1. [Render](https://render.com/)にログイン
2. 「New +」→「Web Service」を選択
3. GitHubリポジトリを接続
4. 以下の設定を入力:

   - **Name**: ggst-discord-bot（任意）
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

### 3.3 環境変数の設定

Render Dashboardで以下の環境変数を設定:

| Key | Value |
|-----|-------|
| `DISCORD_TOKEN` | Discord Bot Token |
| `DISCORD_APPLICATION_ID` | Discord Application ID |
| `DATABASE_PATH` | `/opt/render/project/data/ggst.db` |
| `NODE_ENV` | `production` |

### 3.4 Diskの作成（データ永続化）

1. Render Dashboardで作成したサービスを開く
2. 「Disks」タブを選択
3. 「Add Disk」をクリック
4. 以下を設定:
   - **Name**: `ggst-data`
   - **Mount Path**: `/opt/render/project/data`
   - **Size**: 1 GB

### 3.5 デプロイ

1. 「Manual Deploy」→「Deploy latest commit」をクリック
2. ログを確認してデプロイが成功したか確認

### 3.6 コマンドの登録（Render上で実行）

Renderのシェルから一度だけコマンド登録を実行:

```bash
npm run register-commands
```

または、ローカルで実行（`.env`にRenderの環境変数を設定する必要があります）

## 4. 使い方

### 4.1 基本的な流れ

1. `/ggst-setmychar [キャラ名]` - 自分のメインキャラを設定
2. `/ggst-match [相手キャラ]` - 対戦開始時に過去データを確認
3. 対戦後に `/ggst-addnote [相手キャラ] [勝敗] [メモ]` - 記録を追加
4. `/ggst-history` - 自分の対戦履歴を確認
5. `/ggst-export` - NotebookLM用にデータをエクスポート

### 4.2 戦略管理

- `/ggst-strategy add [キャラ名] [内容]` - 個人専用の戦略を追加
- `/ggst-strategy view [キャラ名]` - 個人戦略を表示
- `/ggst-common-strategy add [キャラ名] [内容]` - 全員で共有する対策情報を追加
- `/ggst-common-strategy view [キャラ名]` - 共通対策を表示

### 4.3 NotebookLM連携

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
- DISCORD_TOKENとDISCORD_APPLICATION_IDが正しいか確認
- `npm install`を実行して依存関係をインストール

### Renderでデータが消える

- Diskが正しく設定されているか確認
- Mount Pathが`/opt/render/project/data`になっているか確認
- 環境変数`DATABASE_PATH`が正しく設定されているか確認

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。
