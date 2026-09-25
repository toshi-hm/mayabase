# 動的OGP画像の設計

## 目的

FAQ・用語集・愛用ガジェット・動画ライブラリなど、ページ固有の見出しをSNS共有画像へ焼き込み、リンク先の内容を画像だけでも把握しやすくする。

## 生成方式

- Astroのビルド時静的ルートとしてSVGを生成する。
- 外部CDNや実行時APIに依存しないため、CI・プレビュー・本番で同じ画像を配信できる。
- 1200×630pxの共通テンプレートに、ページタイトルと補足文を描画する。
- XMLエスケープとタイトルの最大3行制限を共通関数で適用する。

## 対象

固定ページは `/ogp/faq.svg`、`/ogp/glossary.svg`、`/ogp/gear.svg`、`/ogp/topics.svg`、`/ogp/videos.svg`、`/ogp/series-index.svg` を生成する。

ページの`og:image`と`twitter:image`は共通レイアウトへ渡すSVG URLを参照する。既存の動画個別ページはYouTubeサムネイルを継続利用する。
