# 設計ドキュメント

MayaBase ポータルサイトの全体設計。

## 1. サイト構成

シングルページ(`/`)のポータルサイト。セクション構成:

1. **ファーストビュー**: チャンネル名・紹介・CTA と最新横動画カルーセルを一体表示
2. **Shorts**: カルーセル(新しい順・最大 6 件、縦型カードで表示)
3. **X ポスト**: カルーセル(新しい順・最大 6 件・自動切替)
4. **プロフィール**: 運営者プロフィール(画像・自己紹介・リンク)をページ末尾に表示
5. **フッター**: 各 SNS リンク・コピーライト

すべて日本語。`lang="ja"`。

## 2. ディレクトリ構成

```
mayabase/
├── docs/                       # 設計ドキュメント
├── public/                     # favicon, OGP画像, robots.txt
├── scripts/
│   └── fetch-videos.ts         # ビルド前に YouTube RSS を取得(bun で実行)
├── src/
│   ├── config/site.ts          # サイト設定(チャンネルハンドル、Xアカウント、プロフィール文言)
│   ├── data/
│   │   ├── videos.json         # 取得済み動画データ(フォールバック兼キャッシュ、コミットする)
│   │   └── x-posts.json        # X ポストデータ(手動管理)
│   ├── lib/
│   │   ├── youtube.ts          # RSSパース・Shorts判定・型定義
│   │   ├── youtube.test.ts
│   │   ├── format.ts           # 日付整形など
│   │   └── format.test.ts
│   ├── components/
│   │   ├── Hero.astro
│   │   ├── Profile.astro
│   │   ├── VideoCard.astro     # 横動画カード
│   │   ├── ShortCard.astro     # Shorts カード(縦)
│   │   ├── PostCard.astro      # X ポストカード
│   │   ├── Carousel.astro      # Embla ラッパー(自動切替、a11y対応)
│   │   └── SectionHeading.astro
│   ├── layouts/Base.astro      # <head> 一式(meta/OGP/JSON-LD)
│   ├── styles/global.css       # Tailwind v4 テーマ(@theme)
│   └── pages/index.astro
├── astro.config.mjs
├── biome.json
├── .prettierrc / .prettierignore
├── package.json
└── .github/workflows/ci.yml
```

## 3. データ層設計

### 3.1 型定義(`src/lib/youtube.ts`)

```ts
interface Video {
  id: string;          // YouTube video ID
  title: string;
  description: string; // RSS media:description(JSON-LD VideoObject の必須プロパティ)
  url: string;         // watch or shorts URL
  thumbnail: string;   // https://i.ytimg.com/vi/{id}/hq720.jpg(16:9。表示側で hqdefault にフォールバック)
  publishedAt: string; // ISO 8601
  isShort: boolean;
}
```

### 3.2 取得フロー(`scripts/fetch-videos.ts`)

1. `site.ts` の `channelId`(確定値・一次手段)を使用。未設定時のみチャンネルページ HTML の `externalId` から解決を試みる(補助手段)。
2. `https://www.youtube.com/feeds/videos.xml?channel_id={id}` を取得し、XML をパース。`media:description` も取り込む(**RSS は最新 15 件のみ**)。
3. **既存 `videos.json` とマージ**: RSS から消えた過去動画も保持し、表示枠の補充に使う。
4. **Shorts 判定は新規 ID のみ**: `https://www.youtube.com/shorts/{id}` へ `HEAD`(redirect: manual)。200 → Shorts、3xx → 横動画。405 等 HEAD 不許可時は `GET` + `redirect: manual` にフォールバック。判定失敗時は前回値を維持(初回不明時は横動画扱い + `unknown` フラグで次回再判定)。並列上限 4、失敗時は 300ms 後に 1 回リトライ。
5. 公開日時の降順に整列し、`src/data/videos.json` に全件書き込み(整形して diff が読みやすい形で)。**最大 6 件への制限は表示側(ページ)で行う**。
6. **失敗時**: 既存の `videos.json` を残して警告のみ出し、exit 0(ビルドを落とさない)。テストはライブ通信禁止(コミット済みフィクスチャで検証)。

追加の堅牢化(実装レビュー反映):

- **3xx リダイレクトは Location ヘッダを検証**: `/watch` を指す場合のみ横動画と確定。consent ページ等への 3xx は判定不能(null)として次回再判定(EU 圏の同意リダイレクトによる誤判定対策)。
- **原子的書き込み**: `videos.json.tmp` へ書いてから rename(中断時に壊れた JSON を残さない)。
- **読み込み時のスキーマ検証**: 壊れた/不正な `videos.json` は具体的な警告を出して空データから再構築。
- **トレードオフ(意図的な仕様)**: 削除・非公開化された動画は RSS から消えても `videos.json` に残り続ける。表示から外したい場合は `videos.json` を手動編集する(将来的には oEmbed 等での生存確認を検討)。
- Shorts 判定のリトライは固定 300ms・1 回のみで、429 の `Retry-After` は考慮しない(対象は新規動画のみで並列上限 4 のため実害は小さい)。

`package.json` の `build` は `astro build` のみ(fetch はネットワーク非依存の CI のためスキップ)。本番デプロイでは `build:full`(`bun run fetch && astro build`)を使う。

### 3.3 X ポスト(`src/data/x-posts.json`)

```json
{
  "account": "MayaBaseJP",
  "posts": [
    { "id": "1234567890", "text": "…", "date": "2026-07-01T12:00:00+09:00" }
  ]
}
```

- URL は `https://x.com/MayaBaseJP/status/{id}` を生成。新しい順・最大 6 件表示。
- 将来 API / スクレイピングに置き換えられるよう、UI はこの JSON の型にのみ依存する。

## 4. カルーセル設計(`Carousel.astro`)

- Embla Carousel + Autoplay プラグイン。**5 秒**間隔で自動切替(`site.ts` で変更可能)。
- Astro コンポーネント内の `<script>`(バニラ TS)で初期化。UI ランタイム不要。
- スロットに任意のカード(`VideoCard` / `ShortCard` / `PostCard`)を受け取るヘッドレス設計。
- **アクセシビリティ / UX**(WCAG 2.2.2 Pause, Stop, Hide 準拠):
  - **常時表示の再生 / 一時停止ボタン**(`aria-label` + `aria-pressed`)を必須とする(ホバー不能なタッチ・SR ユーザーへの停止手段)
  - 前へ / 次へボタン(`aria-label` 付き)とドットインジケータ
  - カルーセル領域に `aria-roledescription="カルーセル"`、各スライドに `role="listitem"` + `aria-roledescription="スライド"` + `aria-label="n / m"`。`role="status"` 要素は自動切替中には更新せず、停止中の手動操作時のみ現在位置を通知(読み上げ連発の防止)
  - hover / focus の一時停止はプラグイン任せにせず自前実装(ユーザーの明示停止を mouseleave / focusout が上書きしないようにするため)
  - ホバー・フォーカス中は自動切替を一時停止(`stopOnMouseEnter` / `stopOnFocusIn`)
  - `prefers-reduced-motion: reduce` の場合は自動切替を初期無効化
  - キーボード操作対応(Embla 標準 + Tab フォーカス)
- JS 無効環境では横スクロール(CSS `overflow-x`)で全カードが閲覧可能なプログレッシブエンハンスメント。

## 5. SEO 設計

- **メタ情報**: `Base.astro` に title / description / canonical / OGP を集約。`og:type=website`、`og:locale=ja_JP`、`twitter:card=summary_large_image`、`twitter:site=@MayaBaseJP`、`og:image` は絶対 URL。
- **JSON-LD**: `WebSite` + `Person`(運営者)+ `ItemList`(動画一覧、`VideoObject`)を出力。`VideoObject` は Google 必須の `name` / `description` / `thumbnailUrl` / `uploadDate` を必ず含め、推奨の `embedUrl`(`https://www.youtube.com/embed/{id}`)も付与する。`duration` は RSS から取得不能のため出力しない。
- **サイトマップ**: `@astrojs/sitemap`。`robots.txt` から参照。
- **パフォーマンス**:
  - ファーストビューの主要画像(ヒーロー・先頭サムネイル)は `loading="eager"` + `fetchpriority="high"`、それ以外は `loading="lazy"`(LCP 対策)
  - すべての画像に明示的な width/height(CLS 対策)
  - `<head>` に `<link rel="preconnect" href="https://i.ytimg.com">` を追加
  - フォントはシステムフォントスタック(Web フォント不使用)で FOUT ゼロ
- **a11y**: セマンティック HTML(section/h2)、コントラスト比 AA 以上、Biome の a11y ルール有効化。
- 目標: Lighthouse Performance / Accessibility / Best Practices / SEO 全て 95 以上(SEO は 100)。

## 6. デザイン方針

- 明るいニュートラルカラーを基調に、コーラル・ミント・イエローを用途別に使うモダンなトーン。
- 実コンテンツをファーストビューの主役にし、セクションごとの背景色とレイアウト変化で探索のリズムを作る。
- CSS 変数(Tailwind v4 `@theme`)でカラー・フォントを一元管理(角丸・余白は Tailwind デフォルトスケールを使用)。
- レスポンシブ: モバイルファースト。カルーセルは 1 → 2 → 3 カラム(Shorts は 2 → 3 → 6)。

## 7. PR 分割計画(直列)

| PR | 内容 | ブランチ |
| --- | --- | --- |
| PR1 | プロジェクト基盤: Astro + TS + Tailwind + Biome/Prettier + CI + Base レイアウト | `claude/youtube-portal-site-t7k4h6` |
| PR2 | データ層: fetch スクリプト、youtube.ts、x-posts.json、テスト | `claude/youtube-portal-site-t7k4h6-pr2` |
| PR3 | UI: プロフィール、動画/Shorts/X カルーセル | `claude/youtube-portal-site-t7k4h6-pr3` |
| PR4 | SEO 仕上げ: sitemap、JSON-LD、OGP、README | `claude/youtube-portal-site-t7k4h6-pr4` |

各 PR は専門家レビュー(サブエージェント)→ 指摘対応 → マージ後に次へ進む。

CI(全 PR 共通): `bun install --frozen-lockfile` → lint(Biome)→ format チェック(Prettier)→ `astro check` → `bun test` → `astro build`(fetch はスキップし、コミット済み `videos.json` でビルド=ネットワーク非依存)。PR4 で Lighthouse CI(SEO=100、Perf/A11y/BP≥95 の assertion)をゲートとして追加する。

## 8. 運用

- プロフィール文言・リンクは `src/config/site.ts` を編集(ダミー文言はデプロイ前に要差し替え)。
- X ポストは `src/data/x-posts.json` に追記。
- 動画はビルドごとに自動更新。GitHub Actions の cron(例: 毎日)で定期再ビルド可能(PR4 で任意追加)。
