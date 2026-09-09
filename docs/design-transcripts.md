# 動画文字起こしの掲載設計（#281）

字幕は YouTube Studio から運営者が手動エクスポートし、動画IDをキーに src/data/transcripts.json へ登録する。YouTube Data API の captions.download は動画所有者OAuthが必要で、現行のAPIキーだけでは実行できないため、認証情報の追加を前提にしない。

専用パーサで動画ID・言語・本文長を検証し、動画詳細ページにデータがある場合だけ details の折りたたみ表示を追加する。同じ本文を VideoObject の transcript に反映する。未登録動画は既存表示のままとし、動画データを自動削除・改変しない。
