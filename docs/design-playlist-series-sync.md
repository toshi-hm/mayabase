# シリーズページとYouTube再生リストの連動(#408)

## 課題

`src/data/series.json` のシリーズは動画タイトルの `keyword` 一致でのみ判定しており、YouTube Studio 側で整理した再生リストとサイトのシリーズページが連動していなかった。企画が増えるたびにキーワードの追加・調整という手作業が発生する。

## 方針

`SeriesItem` に任意の `youtubePlaylistId` を追加する。設定すると、`scripts/fetch-videos.ts` が `YOUTUBE_API_KEY` 設定時にその再生リストの所属動画IDを `playlistItems.list` で取得し、`src/data/playlists.json` に永続化する。シリーズと動画の紐付けは `keyword` 一致 OR 再生リスト所属で判定する(`isVideoInSeries`)。

- `keyword` と `youtubePlaylistId` は併用でき、どちらか一方でも該当すれば対象動画に含める。既存のキーワードのみのシリーズはそのまま動作する(後方互換)。
- スラッグ・タイトル・紹介文は引き続き `series.json` で人間が編集する(SEO上、任意のプレイリストタイトルからスラッグを自動生成すると URL の質が落ちるため、全チャンネルの再生リストを自動的にページ化する完全自動化はスコープ外とした)。
- API クォータを抑えるため、チャンネルの全再生リストではなく `series.json` が実際に参照している `youtubePlaylistId` だけを取得する。
- 個別の再生リスト取得に失敗した場合は、その ID の `playlists.json` 内の既存値を維持し、ビルドを止めない(videos.json の isShort 判定などと同じ方針)。

## データ

`src/data/playlists.json`:

```json
{
  "fetchedAt": "2026-01-01T00:00:00.000Z",
  "playlists": [{ "id": "PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "videoIds": ["abc123", "def456"] }]
}
```

## 影響範囲

`getSeriesWithVideos` / `isVideoInSeries`(`src/lib/series.ts`)を使う全ページ(シリーズ一覧・シリーズ詳細・シリーズOGP・シリーズRSS・動画詳細の「このシリーズの動画」・トップの featured シリーズ導線)が、`src/data/playlists.json` を読み込んで再生リスト所属動画も対象に含めるようになる。`youtubePlaylistId` を設定していない既存シリーズの挙動は変わらない。
