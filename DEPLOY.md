# デプロイチェックリスト

## 🚀 Renderへのデプロイ手順

### 事前準備

#### 1. Discord Bot設定
- [ ] Discord Developer Portalでアプリケーション作成済み
- [ ] Bot Tokenを取得済み (`DISCORD_TOKEN`)
- [ ] Application IDを取得済み (`DISCORD_APPLICATION_ID`)
- [ ] Botをテストサーバーに招待済み
- [ ] Bot Permissions設定済み:
  - Send Messages
  - Embed Links
  - Attach Files
  - Use Slash Commands

#### 2. Tursoデータベース設定
- [ ] Tursoアカウント作成済み
- [ ] データベース作成済み (`turso db create ggst-discord-bot`)
- [ ] Database URLを取得済み
- [ ] Auth Tokenを取得済み

### Renderセットアップ

#### 3. Render準備
- [ ] Renderアカウント作成済み
- [ ] GitHubリポジトリをRenderに接続

#### 4. Web Service作成
Render Dashboard → New + → Web Service

設定項目：
- **Name**: `ggst-discord-bot`
- **Environment**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Plan**: `Free`

#### 5. 環境変数設定
Render Dashboard → Environment → Environment Variables

| Key | Value | 説明 |
|-----|-------|------|
| `NODE_ENV` | `production` | 本番環境 |
| `DISCORD_TOKEN` | `YOUR_TOKEN` | Discord Bot Token |
| `DISCORD_APPLICATION_ID` | `YOUR_APP_ID` | Discord Application ID |
| `TURSO_DATABASE_URL` | `libsql://xxx.turso.io` | Turso Database URL |
| `TURSO_AUTH_TOKEN` | `eyJhbG...` | Turso Auth Token |

#### 6. デプロイ実行
- [ ] 「Manual Deploy」→「Deploy latest commit」をクリック
- [ ] ビルドログを確認（5-10分程度）
- [ ] デプロイ成功を確認

### 初回セットアップ（Render Shell）

Render Dashboard → Shell タブ

#### 7. データベースマイグレーション

```bash
npm run migrate:v2
```

確認事項：
- [ ] 全テーブル作成完了
- [ ] 32キャラクター登録完了
- [ ] 20種類の共通敗因登録完了

#### 8. キャラクター技データ登録（オプション）

```bash
npm run seed:moves
```

確認事項：
- [ ] 564+技データ登録完了

#### 9. Discordコマンド登録

```bash
npm run register-commands
```

確認事項：
- [ ] 18コマンド登録完了

### 動作確認

#### 10. 基本動作テスト

Discordサーバーで以下を実行：

```bash
# 1. メインキャラ設定
/gs character:ソル=バッドガイ
# 期待結果: 設定完了メッセージ

# 2. 対戦情報表示
/gm opponent:カイ=キスク
# 期待結果: Embedで情報表示（初回は戦績なし）

# 3. 対戦記録追加
/gn opponent:カイ=キスク result:win note:テスト
# 期待結果: 記録完了メッセージ

# 4. 対戦履歴確認
/gh
# 期待結果: 先ほど追加した記録が表示される

# 5. コンボ追加
/gc add character:ソル=バッドガイ location:画面中央 tension:0 starter:通常 combo:5K > 6H damage:100
# 期待結果: コンボ登録完了

# 6. 技データ確認
/gmv view character:ソル=バッドガイ
# 期待結果: 技一覧表示（seed:moves実行済みの場合）

# 7. エクスポート
/ge
# 期待結果: Markdownファイルがダウンロード可能
```

#### 11. オートコンプリート確認
- [ ] `/gs character:` でキャラ名候補が表示される
- [ ] `/gn defeat_reason:` で敗因候補が表示される
- [ ] `/gc add combo:` で技名候補が表示される（キャラ選択後）

#### 12. エイリアス確認
- [ ] `/gs` = `/ggst-setmychar`
- [ ] `/gm` = `/ggst-match`
- [ ] `/gn` = `/ggst-addnote`
- [ ] `/gh` = `/ggst-history`
- [ ] `/gps` = `/ggst-strategy`
- [ ] `/gcs` = `/ggst-common-strategy`
- [ ] `/ge` = `/ggst-export`
- [ ] `/gc` = `/ggst-combo`
- [ ] `/gmv` = `/ggst-move`

### オプション設定

#### 13. スリープ対策（推奨）

[Uptime Robot](https://uptimerobot.com/)で監視設定：

- **Monitor Type**: HTTP(s)
- **URL**: `https://your-service.onrender.com/health`
- **Monitoring Interval**: 5 minutes
- **Monitor Timeout**: 30 seconds

これにより、Renderの15分スリープを回避できます。

### トラブルシューティング

#### ビルドエラー
- [ ] package.jsonの依存関係を確認
- [ ] Node.jsバージョン確認（18以上）
- [ ] Render Logsでエラー内容確認

#### Botが起動しない
- [ ] 環境変数が正しく設定されているか確認
- [ ] Turso接続情報を確認
- [ ] Render Logsで起動ログ確認

#### コマンドが表示されない
- [ ] `npm run register-commands`を実行したか確認
- [ ] 数分待つ（Discordの反映に時間がかかる）
- [ ] Discordアプリを再起動
- [ ] Botを再招待

#### データが保存されない
- [ ] Turso Database URLが正しいか確認
- [ ] Auth Tokenが有効か確認
- [ ] `npm run migrate:v2`を実行したか確認

### 完了確認

すべてのチェックリストが完了したら：

- [ ] README.mdの内容と実装が一致している
- [ ] 全18コマンドが動作する
- [ ] オートコンプリートが機能する
- [ ] データが正常に保存・取得できる
- [ ] Embedが正しく表示される

## 🎉 デプロイ完了！

おめでとうございます！GGST対戦情報管理Botのデプロイが完了しました。

### 次のステップ

1. **ユーザーに周知**: Discordサーバーでコマンド使い方を説明
2. **フィードバック収集**: 実際の使用感を確認
3. **データバックアップ**: 定期的に `/ge` でエクスポート
4. **モニタリング**: Render Logsで異常がないか確認

### サポート

問題が発生した場合は、以下を確認：
- README.md - セットアップガイド
- MIGRATION-V2.md - データベース詳細
- Render Logs - エラーログ
- Turso Console - データベース状態
