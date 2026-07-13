# MayaBase ポータルサイト

YouTube チャンネル [@maya_base](https://youtube.com/@maya_base) の公式ポータルサイトです。
最新動画・Shorts・X([@MayaBaseJP](https://x.com/MayaBaseJP))の投稿をまとめて紹介します。

## 技術スタック

- **bun**(ランタイム / パッケージマネージャ。Node.js 不使用)
- **Astro 7** + TypeScript(strict)— 静的生成、JS は最小限
- **Tailwind CSS v4** — CSS-first テーマ(`src/styles/global.css` の `@theme`)
- **Embla Carousel** — 自動切替カルーセル(WCAG 2.2.2 準拠の一時停止ボタン付き)
- **Biome**(TS/JSON/CSS)+ **Prettier**(.astro)— lint / format
- **Lighthouse CI** — Performance / Accessibility / Best Practices / SEO をゲート(SEO は 100 必須)

詳細は [docs/01-tech-stack.md](docs/01-tech-stack.md) と [docs/02-design.md](docs/02-design.md) を参照してください。

## セットアップ

```bash
bun install          # 依存関係のインストール
bun run dev          # 開発サーバ(http://localhost:4321)
```

### 主なコマンド

| コマンド | 内容 |
| --- | --- |
| `bun run fetch` | YouTube RSS から動画一覧を取得し `src/data/videos.json` を更新 |
| `bun run build` | 静的ビルド(fetch なし・ネットワーク非依存) |
| `bun run build:full` | fetch + ビルド(本番デプロイ用) |
| `bun test` | ユニットテスト |
| `bun run lint` / `lint:fix` | Biome によるチェック / 自動修正 |
| `bun run format` / `format:check` | Prettier(.astro)+ Biome フォーマット |
| `bun run check` | `astro check`(型チェック) |

## 運用

### 初回設定(重要)

1. **チャンネル ID の設定**: `src/config/site.ts` の `youtube.channelId` に `UC` で始まるチャンネル ID を設定してください(YouTube Studio → 設定 → チャンネル → 詳細設定)。未設定でもチャンネルページから自動解決を試みますが、確定値の設定を推奨します。
2. **プロフィールの編集**: `src/config/site.ts` の `profile`(名前・肩書き・自己紹介)を実際の内容に書き換えてください。
3. **本番 URL の設定**: デプロイ先が決まったら `astro.config.mjs` の `SITE_URL` を本番 URL に変更してください(canonical / sitemap / OGP に使われます)。

### 動画データの更新

取得経路は 2 系統あり、`YOUTUBE_API_KEY` の有無で自動的に切り替わります。

| 経路 | 条件 | 取得範囲 |
| --- | --- | --- |
| **YouTube Data API v3** | `YOUTUBE_API_KEY` を設定 | **全動画**(uploads プレイリストを全ページ取得) |
| **RSS** | 未設定(デフォルト) | 最新 15 件のみ(過去動画は日々のマージで徐々に蓄積) |

- **全動画をサイトに載せたい場合は API キーの設定を推奨します。** RSS は仕様上、最新 15 件しか返さないため、過去の動画をまとめて取得できません。
- API 取得に失敗した場合は自動的に RSS へフォールバックし、全経路が失敗しても既存の `videos.json` を維持します(ビルドは決して落としません)。

#### YouTube Data API キーの設定手順

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成し、「YouTube Data API v3」を有効化する。
2. 認証情報から API キーを発行する(キーの制限で YouTube Data API v3 のみに絞ると安全)。
3. ローカル実行: `YOUTUBE_API_KEY=xxxxx bun run fetch`
4. GitHub Actions(定期更新): リポジトリの **Settings → Secrets and variables → Actions** に `YOUTUBE_API_KEY` を登録する(ワークフローは登録済みなら自動で使用します)。

> クォータ目安: 全取得は概ね「(動画数 ÷ 50)units」程度で、無料枠(1 日 10,000 units)に対して十分小さい規模です。

#### その他

- ビルド時に `bun run build:full` を使うと自動で最新化されます。
- GitHub Actions の「動画データの定期更新」ワークフローが毎日 6:00(JST)に取得し、変更があれば `videos.json` をコミットします(手動実行も可)。
  - この自動コミットは通常の CI / Lighthouse を経由しません(GITHUB_TOKEN によるプッシュは他のワークフローをトリガーしない GitHub の仕様)。fetch スクリプトは失敗時に既存データを維持するため、壊れたデータが混入するリスクは低い設計です。
  - main にブランチ保護(直接プッシュ禁止)を設定する場合は、bot を除外するか PR ベースのフローに変更してください。
- 横動画 / Shorts の判定は自動で行われ、判定結果はキャッシュされます。
- 削除・非公開にした動画は自動では消えません。`src/data/videos.json` から該当エントリを手動で削除してください。

### X ポストの更新

`src/data/x-posts.json` に手動で追記します(X API が無料で使えないため)。

```json
{
  "account": "MayaBaseJP",
  "posts": [
    {
      "id": "1234567890123456789",
      "text": "投稿本文",
      "date": "2026-07-11T20:00:00+09:00"
    }
  ]
}
```

- `id` はポスト URL(`https://x.com/MayaBaseJP/status/{id}`)の末尾の数字です。
- 表示は新しい順・最大 6 件。形式ミスはビルド時にエラーとして検出されます。

### カルーセルの調整

`src/config/site.ts` の `carousel` で自動切替の間隔(既定 5 秒)と最大表示件数(既定 6 件)を変更できます。

## デプロイ

静的サイトなので Cloudflare Pages / Netlify / Vercel / GitHub Pages などにそのままデプロイできます。

- ビルドコマンド: `bun run build:full`(ビルド環境から youtube.com へアクセスできない場合は `bun run build`)
- 出力ディレクトリ: `dist`

## CI

Pull Request ごとに lint → format チェック → 型チェック → テスト → ビルド → **Lighthouse CI** が実行されます。

- ゲート: SEO = 100、Accessibility / Best Practices ≥ 95、Performance ≥ 85
- Performance の閾値だけ低めなのは、GitHub の共有ランナーの処理速度の揺らぎでスコアが変動するためです(実測ではローカル環境で 4 カテゴリすべて 100)。3 回実行の中央値で判定します。
