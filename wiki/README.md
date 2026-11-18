# BRIDGET LAB（ブリジット攻略wiki）

Astro + Starlight で作った静的サイトです。bot 本体（リポジトリ直下）とは独立しています。

```bash
cd wiki
npm install
npm run dev      # http://localhost:4321 で確認
npm run build    # dist/ に出力
```

## 記事の書き方

`src/content/docs/<カテゴリ>/` に `.md`（コンボ表示を使うなら `.mdx`）を置きます。

| カテゴリ | フォルダ |
| --- | --- |
| 基本戦略 | `basics/` |
| 立ち回り | `neutral/` |
| コンボ | `combos/center/`, `combos/corner/` |
| 起き攻め | `okizeme/center/`, `okizeme/corner/` |
| セットプレイ | `setplay/center/`, `setplay/corner/` |
| キャラ対策 | `matchups/` |
| 練習方法 | `training/` |
| Q&A | `faq/` |

### フロントマター

```yaml
---
title: 2K始動 基本コンボ
description: 一覧に出る説明文
versions: ["2.02", "2.04"]   # 使えるバージョン（複数可・あとから追記）
position: center       # center（画面中央） / corner（画面端）
starter: 2K            # 始動技
counterHit: false      # カウンターヒット前提なら true
damage: 142            # 任意
difficulty: 1          # 1〜5（任意）
opponent: ソル         # キャラ対策のみ
tags: [初心者向け, 運び]
---
```

### バージョン管理

- `src/site.config.ts` の `VERSIONS` に、管理するバージョンを古い順に並べます。新しいパッチが出たら末尾に1つ足すだけで、それが「現行」になります。
- 記事の `versions` に、使えるバージョンを並べます。飛び飛びでもOKです（例：2.03で消えて2.04で復活 → `["2.02", "2.04"]`）。
- `versions` に現行バージョンが入っていない記事は old 扱いになり、サイドバーに `old` バッジ、本文上部に警告が出ます。
  - 新しいパッチが出たら、確認できた記事から `versions` に追記していきます。
  - 管理開始時点で使えないものは `versions: []` にします。
  - バージョンに関係しない記事は `versions` を書きません（常に表示）。
- 一覧の絞り込みで「Ver.〇〇 で使える」を選ぶと、そのバージョンが `versions` に入っている記事だけになります。
- `VERSIONS` に無いバージョンを書くとビルドエラーになるので、打ち間違いに気づけます。

### コンボ表示

```mdx
import Combo from '../../../../components/Combo.astro';

<Combo route="2K > 2D > 236K (追加) > 214S" damage={142} tension={10} note="補足" />
```

## 公開（Cloudflare Pages）

すべてCloudflareのダッシュボード上で設定します（`wrangler.toml` は置かない）。

1. **D1**：ストレージとデータベース → D1 → `bridget-wiki` を作成 → コンソールで `functions/schema.sql` を実行
2. **Pages**：Workers & Pages → 作成 → Pages → Gitに接続 → このリポジトリ
   - フレームワーク: Astro / ビルドコマンド: `npm run build` / 出力: `dist` / ルートディレクトリ: `wiki`
   - 環境変数: `NODE_VERSION` = `22`
3. **バインディング**：Pagesプロジェクト → 設定 → バインディング → D1 を変数名 `DB` で追加 → 再デプロイ
4. **Access**：Zero Trust → Access → アプリケーション → セルフホスト
   - ドメイン: `<プロジェクト名>.pages.dev` と `*.<プロジェクト名>.pages.dev`
   - ポリシー: 許可 / 見せたい人のメールアドレス / ログイン方法: ワンタイムPIN

ログインした人のメールアドレスでコメントの投稿者を識別します（画面には出ません）。自分のコメントだけ削除できます。

### 検索避け
- 全ページに `<meta name="robots" content="noindex">`
- `public/robots.txt` で全拒否
- `public/_headers` で `X-Robots-Tag: noindex`
