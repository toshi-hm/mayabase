# 動画文字起こしの掲載設計（#281）

字幕は YouTube Studio から運営者が手動エクスポートし、動画IDをキーに src/data/transcripts.json へ登録する。YouTube Data API の captions.download は動画所有者OAuthが必要で、現行のAPIキーだけでは実行できないため、認証情報の追加を前提にしない。

専用パーサで動画ID・言語・本文長を検証し、動画詳細ページにデータがある場合だけ details の折りたたみ表示を追加する。同じ本文を VideoObject の transcript に反映する。未登録動画は既存表示のままとし、動画データを自動削除・改変しない。

## サイト内検索への反映（#480）

字幕がある動画のみを対象に、本文(小文字化済み)を `/video-transcripts.json`(ビルド時生成の静的JSON、`video-descriptions.json.ts` と同じ方針)として書き出す。動画ライブラリ(`videos.astro`)・カテゴリ別/シリーズ別ページ(`ArchiveFilterController.astro`)いずれのキーワード検索も、検索語が入力された時点でこのJSONを概要欄本文と並行して遅延取得し、タイトル・概要欄本文に加えて字幕本文も絞り込み対象に含める。初期表示のペイロードには影響しない。
