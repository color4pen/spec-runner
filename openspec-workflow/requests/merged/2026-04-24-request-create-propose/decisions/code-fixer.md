# Code Fixer Decisions

## Fix History (Iteration 1)

### #1 (HIGH) — encodeURIComponent on path パラメータを除去する
`getDirectoryContents()` と `getFileContent()` の URL 生成で `encodeURIComponent(path)` を除去する :: GitHub Contents API の `{path}` セグメントは `/` をエンコードしてはならない。`openspec/changes/{slug}` のようなパスを `%2F` でエンコードすると GitHub API が 404 を返すため、path はそのまま結合する。`ref` の `encodeURIComponent` は維持する（ブランチ名に `#` 等が入りうるため）。

### #2 (HIGH) — getChangeFolderFileContent() にパストラバーサル検証を追加する
`filePath` が changeFolderPath プレフィックスで始まること、かつ `..` を含まないことを検証する :: ownership は確認済みだが、任意のファイルパスを受け入れるとリポジトリ内の任意ファイル（例: src/secrets.ts）が読み取られる。changeFolderPath は `getChangeFolderFiles()` と同じ導出ロジックで生成し、ガード条件として使う。

### #3/#4 (MEDIUM) — startPropose() の slug 日付ソースを new Date() から request.createdAt に変更する
`startPropose()` 内の slug 生成を `new Date().toISOString().slice(0, 10)` ではなく `request.createdAt.slice(0, 10)` に変更する :: `getChangeFolderFiles()` と `session-completion-handler.ts` はともに `request.createdAt` を使っているため、日付境界で startPropose の slug と下流の slug が不一致になるリスクを排除する。

### #5 (MEDIUM) — buildProposeMessage() でリクエスト本文を XML デリミタで囲む
`requestContent` を `<user-request>` タグで囲むよう `buildProposeMessage()` のテンプレートを変更する :: ユーザー入力がそのままエージェントへのインストラクションに埋め込まれるため、コンテンツ境界を明示して prompt injection の影響範囲を限定する（defense-in-depth）。

### #7 (MEDIUM) — 重複所有権検証クエリを共通ヘルパーに抽出する
`verifyRequestWithRepository(requestId, userId)` を propose-actions.ts 内に定義し、3 関数から呼び出す :: `startPropose()`, `getChangeFolderFiles()`, `getChangeFolderFileContent()` の 3 箇所で同一の JOIN + where クエリが存在する。constraints.md の「所有権検証ロジックは既存のヘルパー関数に委譲し、インラインで同等のクエリを書かない」に従い集約する。

### #8 (MEDIUM) — rollback 時にセッションも 'archived' に更新する
`startPropose()` の catch ブロックで request の状態をロールバックする際、生成された session も 'archived' に更新する :: セッション生成後に sendMessage が失敗した場合、セッションが 'active' のまま孤立する。tasks.md T-4.5 の要件に従い、session ID を catch スコープに持ち込んでロールバックする。

### #9 (LOW) — no-op map を除去する
`propose-utils.ts` の `enabled.map((opt) => opt).join(', ')` を `enabled.join(', ')` に変更する :: map が恒等変換のため不要。

### #10 (LOW) — コメントを精緻化する
`workspace-client.tsx` の DirectoryEntry import コメントを正確な理由に更新する :: 現行コメントは理由が曖昧。`'use server'` モジュールが型を再 export できないことを明示する。

### #6 (MEDIUM) — 静的解析テストのリファクタは見送る
TC-014, TC-015 の static analysis テストのリファクタを今回は実施しない :: モック設定で `better-sqlite3` / `getDb` の import 解決に手が入り、他の 42 テストへの影響を確認しながら安全にリファクタするには調査コストが高い。MEDIUM 指摘であり承認をブロックしないため、次のリファクタリングサイクルに委ねる。
