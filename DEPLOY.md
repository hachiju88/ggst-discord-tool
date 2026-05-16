# AWS EC2 デプロイガイド

Discord Bot を AWS EC2 t3.micro (無料枠) で運用する手順です。

## 前提条件

- AWS アカウントが作成済みであること
- ローカルに Docker がインストールされていること（動作確認用）
- SSH クライアントが使えること

---

## Step 1: EC2 インスタンスを作成する

[AWS マネジメントコンソール](https://console.aws.amazon.com/ec2/) → EC2 → 「インスタンスを起動」

| 項目 | 設定値 |
|------|--------|
| AMI | Amazon Linux 2023 (無料枠対象) |
| インスタンスタイプ | t3.micro (無料枠: 750時間/月 × 12ヶ月) |
| リージョン | ap-northeast-1 (東京) |
| ストレージ | gp3 8GB (無料枠: 30GB まで) |
| キーペア | 新規作成 → `.pem` ファイルを保存 |

**セキュリティグループの設定:**

| タイプ | ポート | ソース |
|--------|--------|--------|
| SSH | 22 | 自分の IP のみ (「マイ IP」を選択) |
| カスタム TCP | 8080 | 0.0.0.0/0 |

**推奨:** Elastic IP を作成してインスタンスに割り当てると、再起動しても IP が変わりません（割り当て中は無料）。

---

## Step 2: EC2 に SSH 接続して Docker をインストール

```bash
# ローカルで実行
chmod 400 /path/to/my-key.pem
ssh -i /path/to/my-key.pem ec2-user@<EC2のパブリックIP>
```

EC2 にログインしたら Docker をインストール:

```bash
sudo dnf update -y
sudo dnf install -y docker
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
exit  # 一度ログアウトして権限を反映
```

再度 SSH ログイン後、`docker ps` が動けば OK。

---

## Step 3: コードを EC2 に転送

まず git をインストール:

```bash
sudo dnf install -y git
```

**方法A: scp で転送（プライベートリポジトリの場合）**

```bash
# ローカルで実行
scp -i /path/to/my-key.pem -r ./ggst-discord-tool ec2-user@<EC2のIP>:~/
```

**方法B: git clone（パブリックリポジトリの場合）**

```bash
# EC2 上で実行
git clone https://github.com/hachiju88/ggst-discord-tool.git
```

---

## Step 4: 環境変数を設定してデプロイ

```bash
# EC2 上で実行
cd ggst-discord-tool

# .env ファイルを作成
cp .env.example .env
nano .env  # 各値を入力して保存 (Ctrl+X → Y → Enter)
```

`.env` に設定が必要な値:

```
DISCORD_TOKEN=your_bot_token
DISCORD_APPLICATION_ID=your_app_id
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your_turso_token
NODE_ENV=production
PORT=8080
```

Docker でビルド＆バックグラウンド起動:

```bash
docker build -t ggst-bot .
docker run -d --restart=always --env-file .env -p 8080:8080 --name ggst-bot ggst-bot

# ログ確認
docker logs ggst-bot
```

`✅ Discord bot logged in` が表示されれば成功。

---

## Step 5: スラッシュコマンドを登録（初回のみ）

```bash
# ローカルで実行（.env の値が設定された状態で）
npm run register-commands
```

---

## 運用コマンド

```bash
# コンテナの状態確認
docker ps

# ログ確認
docker logs ggst-bot

# 再起動
docker restart ggst-bot

# コード更新後の再デプロイ
docker stop ggst-bot
docker rm ggst-bot
docker build -t ggst-bot .
docker run -d --restart=always --env-file .env -p 8080:8080 --name ggst-bot ggst-bot
```

`--restart=always` の設定により、EC2 を再起動してもコンテナが自動的に起動します。

---

## コスト見込み

| 項目 | 無料枠期間 (12ヶ月) | 無料枠終了後 |
|------|-------------------|------------|
| EC2 t3.micro | $0 (750時間/月無料) | $9.93/月 |
| EBS gp3 8GB | $0 (30GB/月無料) | $0.64/月 |
| Elastic IP | $0 (割り当て中は無料) | $0 (割り当て中は無料) |
| データ転送 | $0 (100GB/月まで無料) | $0 (ほぼ転送なし) |
| **合計** | **~$0/月** | **~$10.57/月** |
