# 技術選定

MayaBase ポータルサイト(YouTube チャンネル @maya_base のプロモーションサイト)の技術選定ドキュメント。

## 前提条件

- ランタイム / パッケージマネージャは **bun**(Node.js は使わない)
- TypeScript を使用
- コンテンツ中心の静的なプロモーションサイト(ログイン・DB 不要)
- SEO スコア(Lighthouse)を最高水準にする
- YouTube 動画一覧・X ポストは自動取得できる構成が望ましいが、外部 API の制約を考慮する

## 選定結果サマリ

| 領域 | 採用 | バージョン方針 |
| --- | --- | --- |
| ランタイム / PM | bun | 1.3.x |
| フレームワーク | **Astro** | 7.0.7(完全固定) |
| 言語 | TypeScript(strict) | 完全固定 |
| スタイリング | **Tailwind CSS v4**(`@tailwindcss/vite`) | 4.3.2(完全固定) |
| カルーセル | **Embla Carousel**(+ Autoplay プラグイン) | 8.6.0(完全固定) |
| Lint / Format | **Biome**(TS/JS/JSON/CSS) + **Prettier + prettier-plugin-astro**(.astro) | 完全固定 |
| 型チェック | `astro check`(@astrojs/check) | 完全固定 |
| テスト | `bun test`(ビルトインテストランナー) | - |
| SEO | `@astrojs/sitemap`、OGP、JSON-LD、robots.txt | 完全固定 |
| CI | GitHub Actions(`oven-sh/setup-bun`) | - |

> **バージョン方針(設計レビュー反映)**: 選定時の最新バージョンを `package.json` に **exact 指定(`^`なし)** で完全固定し、`bun.lock` をコミットする。CI は `bun install --frozen-lockfile` でビルド再現性を担保する。バージョン更新は明示的な PR でのみ行う。
>
> **Astro 7 互換検証**: Astro 7 はリリース直後のメジャーのため、PR1 で「Astro 7 + @astrojs/sitemap + @astrojs/check + @tailwindcss/vite が実際にビルド・型チェック通過すること」を最小構成で先に検証する。互換問題が出た場合は直前安定メジャー(6.x 最新)へ退避することを許容する。

## 選定理由

### フレームワーク: Astro

候補: Astro / Next.js / SvelteKit / Nuxt

- **Astro を採用**。コンテンツ中心サイトに特化した SSG ファーストの FW で、デフォルトで JS ゼロ出荷(Islands Architecture)。Lighthouse の Performance / SEO でほぼ満点を取りやすい。
- カルーセルの自動切替のようなインタラクションは `client:*` ディレクティブで必要な箇所だけハイドレートできる。
- Next.js は App Router + RSC が強力だが、本件は API・サーバ機能が不要で、ランタイム JS が常時載る分 Lighthouse 満点の難度が上がる。SvelteKit / Nuxt も同様に本件ではオーバースペック。
- bun との相性も良い(`bun create astro`、`bunx --bun astro dev` が公式サポート)。

### スタイリング: Tailwind CSS v4

- v4 は CSS-first 設定(`@theme`)で設定ファイル不要、`@tailwindcss/vite` プラグインで Astro に直接統合できる。
- ビルドが高速でデッドコードゼロ。デザインは CSS 変数ベースのテーマで管理する。

### カルーセル: Embla Carousel

候補: Embla / Swiper / Splide / 自作

- **Embla を採用**。ヘッドレス&フレームワーク非依存の軽量ライブラリ(コアは依存ゼロ)。`embla-carousel-autoplay` プラグインで「一定秒数経過後に自動切替」の要件を満たす。
- Swiper は多機能だがバンドルが大きく、スタイル注入が Lighthouse に不利。Splide も良いが Embla の方がヘッドレスで Tailwind と相性が良い。
- Astro の `<script>`(バニラ TS)から直接使えるため、React 等の UI ランタイムを追加せずに済む。

### Lint / Format: Biome + Prettier(棲み分け)

- **Biome v2** を TS / JS / JSON / CSS の lint + format に採用。単一バイナリで高速、ルールも充実(a11y ルール含む)。
- `.astro` ファイルのフォーマットは Biome が完全対応していないため、**Prettier + prettier-plugin-astro** を `.astro` 専用に併用。
- 型レベルの検査は `astro check` で担保。
- すべて `bun run lint` / `bun run format` / `bun run check` に集約し、CI で強制する。

### データ取得戦略(重要な設計判断)

- **YouTube**: API キー不要の **RSS フィード**(`https://www.youtube.com/feeds/videos.xml?channel_id=...`)を**ビルド時**に取得する。
  - **channelId は `site.ts` に確定値をハードコードするのが一次手段**(channelId は不変値)。未設定の場合のみ、初回取得の補助としてチャンネルページの `externalId` から解決を試みる(スクレイピングはマークアップ変更で壊れ得るため補助扱い)。
  - **RSS は最新 15 件のみ返す制約**があるため、コミット済み `videos.json` と RSS 結果を**マージ**し、RSS から溢れた過去動画も表示枠(各最大 6 件)の補充に使う。
  - **横動画 / Shorts の分離**: RSS には区別がないため、各動画の `https://www.youtube.com/shorts/{id}` へのリクエスト(Shorts なら 200、横動画なら watch へリダイレクト)で判定する。判定結果は `videos.json` に**永続キャッシュ**し、既知 ID は再判定しない。判定失敗時は前回値を維持する(非公式挙動依存のためビルド毎の揺れを防ぐ)。
  - 取得失敗時(オフライン CI 等)は **コミット済みフォールバック JSON** にフォールバックし、ビルドは決して落とさない。
- **X(Twitter)**: 無料の公式 API が事実上使えないため、**リポジトリ内の JSON データ**(`src/data/x-posts.json`)を一次ソースとする。運用者が投稿を追記する運用。oEmbed/ウィジェットはパフォーマンスと SEO を大きく損なうため採用しない。
- どちらも静的生成なので、**定期再ビルド(GitHub Actions の cron)** で鮮度を保つ拡張が可能。

### テスト: bun test

- Shorts 判定・RSS パース・日付整形などのユーティリティを `bun test` でユニットテスト。追加ランナー(Vitest 等)は不要。

## 参考(選定時の最新バージョン)

astro 7.0.7 / tailwindcss 4.3.2 / @biomejs/biome 2.5.3 / embla-carousel 8.6.0 / prettier 3.9.5 / prettier-plugin-astro 0.14.1 / @astrojs/sitemap 3.7.3(2026-07 時点)
