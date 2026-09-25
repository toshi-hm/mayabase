# 「次に見たい動画テーマ」投票機能の設計

## 目的

動画ライブラリに、今後取り上げてほしいテーマへの投票UIを追加する。投票結果は動画企画の参考にし、ログインを必須にせず、訪問者ごとに1テーマ1票へ制限する。

## テーマ定義

候補テーマは \`src/data/topic-requests.json\` で管理する。テーマを追加・変更する場合は、slug・タイトル・説明文を編集し、\`topicRequests.ts\` の検証を通す。

## API

- \`GET /api/topic-request?topicSlugs=ai-workflow,smart-home\`
  - 複数テーマの件数を \`counts\` オブジェクトで返す。
- \`POST /api/topic-request\`
  - \`{"slug":"ai-workflow"}\` を受け取り、件数を1つ加算する。
- KV未設定時は503、入力不正時は400、過剰アクセス時は429を返す。

動画リアクションAPIと同じKVバインディング・レート制限・訪問者Cookieを利用する。集計キーは \`topic:{slug}\`、重複防止マーカーは \`topic:{slug}:visitor:{visitorId}\` とする。pending/committedのマーカーを使い、KV書き込みの部分失敗時は同じCookieの再送で復旧できるようにする。

## クライアント側

投票済みテーマのslugを \`localStorage\` に保存し、同一ブラウザからの不要な再送を抑止する。サーバー側でも訪問者Cookieを検証するため、localStorageだけに依存しない。静的プレビュー環境ではAPI呼び出しを行わず、動画閲覧を妨げない。
