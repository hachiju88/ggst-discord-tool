# Google Cloud Run デプロイガイド

Discord BotをGoogle Cloud Run（スケーラブルなコンテナ基盤）にデプロイする手順です。

## 前提条件

- Google Cloud Projectが作成済みであること
- `gcloud` CLIがインストールされ、ログイン済みであること (`gcloud auth login`)
- Dockerがローカルで動作していること（ビルド確認用）

## 0. Google Cloud Projectの作成

まだプロジェクトがない場合は、以下の手順で作成します。

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 画面上部のプロジェクト選択プルダウンをクリック
3. 「新しいプロジェクト」をクリック
4. プロジェクト名を入力（例: `ggst-discord-bot`）
   - **場所（組織）**: 「組織なし」のままでOKです
5. 「作成」をクリック
6. 作成完了まで数秒待ち、通知から「プロジェクトを選択」をクリック

これでプロジェクトが有効になります。

## 1. APIの有効化

Cloud RunとContainer Registry（またはArtifact Registry）を使用するためにAPIを有効化します。

```bash
gcloud services enable run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com
```

## 2. デプロイ手順

### 方法A: ソースから直接デプロイ（推奨・簡単）

Google Cloud Buildが自動でコンテナをビルドしてデプロイしてくれます。

```bash
# 1. プロジェクトIDを設定（自分のプロジェクトIDに置き換えてください）
export PROJECT_ID=your-project-id
gcloud config set project $PROJECT_ID

# 2. デプロイ実行
gcloud run deploy ggst-discord-bot \
  --source . \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production"
```

※初回のデプロイ時に、Artifact Registryのリポジトリ作成を求められる場合があります。「y」を押して作成してください。

### 方法B: 環境変数の設定

デプロイコマンドで `--set-env-vars` を使って設定するか、デプロイ後にコンソールから設定します。
Botを動かすには以下の変数が必須です：

- `DISCORD_TOKEN`: (Bot Token)
- `DISCORD_APPLICATION_ID`: (App ID)
- `TURSO_DATABASE_URL`: (Turso URL)
- `TURSO_AUTH_TOKEN`: (Turso Token)

**コマンドで一括設定する例:**

```bash
gcloud run deploy ggst-discord-bot \
  --region asia-northeast1 \
  --update-env-vars="DISCORD_TOKEN=xxx,DISCORD_APPLICATION_ID=yyy,TURSO_DATABASE_URL=libsql://...,TURSO_AUTH_TOKEN=..."
```

## 3. 動作確認

デプロイが完了すると Service URL が表示されます（例: `https://ggst-discord-bot-xxxxx-an.a.run.app`）。

1. ブラウザでそのURLにアクセスし、「GGST Discord Bot is running!」と表示されればOK。
2. `/health` にアクセスしてステータスを確認。

## 4. スラッシュコマンドの登録

Cloud Run上のBotには、ローカルから登録コマンドを実行すれば反映されます（Discord APIを叩くだけなので）。

```bash
npm run register-commands
```

## 補足: 常時起動について

Cloud Runもデフォルトではリクエストがないとインスタンス数が0になります（コールドスタート発生）。
Discord Botは即応性が求められるため、**最小インスタンス数を1にする**ことを強く推奨します。

```bash
gcloud run deploy ggst-discord-bot \
  --region asia-northeast1 \
  --min-instances 1 \
  --no-cpu-throttling
```

※ **重要**: `no-cpu-throttling` は、HTTPリクエスト処理中以外もCPUを割り当てる設定です。Discord Gateway（WebSocket）接続を維持するためにこの設定が推奨されます。
※最小インスタンス1にすると、その分の料金（月額数百円〜）が発生します。無料枠内である程度収まる場合もありますが、課金状況を確認してください。
