# Spec Review Result: gh-cli-to-rest-api

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-19

---

## Summary

設計方針（D1-D8）は適切。Port/Adapter パターンの維持、field mapping を adapter 境界で吸収する戦略（D2）、retry/rate-limit middleware の集約（D3）はいずれも健全。  
ただし実装に先行して修正が必要な問題が 3 件、実装リスクを高める重要問題が 3 件ある。

---

## Critical（実装前に必ず修正）

### C-1: `listPullRequests` の `state` パラメータが無意味になっている

- **場所**: T-01（port interface）、T-02c（実装）、delta/github-api-lib/spec.md
- **問題**: メソッドシグネチャに `state` パラメータがあるが、T-02c の実装仕様では常に `state=all` をクエリに付与すると記述されており、渡したパラメータは無視される。
- **影響**: 呼び出し元が `state` を指定しても silently ignored。port interface と実装の contract 不一致。
- **修正案**: 2 択
  - A) `state` パラメータを port interface から削除し、実装は `state=all` 固定とする（現在の用途は「既存 PR の有無を全状態で確認する」だけなので十分）
  - B) `state` パラメータを実際にクエリへ渡す実装に変える

### C-2: `mergePullRequest` で 403 Forbidden が未ハンドル

- **場所**: delta/github-api-lib/spec.md「PR Merge via REST API」、T-02c
- **問題**: delta spec は 405（not mergeable）と 409（head branch modified）のみを `{ merged: false, message }` で返す仕様にしているが、GitHub REST は merge 権限不足・repository policy 違反に対して **403** を返す。403 はハンドルされていないため throw されて orchestrator に伝播し、不明瞭なエラーになる。
- **影響**: protected branch + required reviewers 環境で 403 が発生したとき、`specrunner finish` が escalation ではなく uncaught error で終了するリスク。
- **修正案**: 403 も `{ merged: false, message }` で返す（escalation message に「admin token もしくは repository 権限を確認してください」を含める）

### C-3: T-13 の ADR パスが間違っている

- **場所**: tasks.md T-13
- **問題**: `openspec-workflow/adr/ADR-20260519-gh-cli-to-rest-api.md` を指定しているが、このリポジトリの近時 ADR は `specrunner/adr/YYYY-MM-DD-<slug>.md` 形式で格納されている（例: `specrunner/adr/2026-05-19-adr-numbering-removal.md`）。`openspec-workflow/adr/` は開発ワークフロースキル用の別系統。
- **影響**: ADR が誰も参照しない場所に置かれ、受け入れ基準「ADR ファイルが存在する」が機能的に満たされない。
- **修正案**: パスを `specrunner/adr/2026-05-19-gh-cli-to-rest-api.md` に変更する

---

## Important（修正を推奨、未修正は実装フェーズでリスク）

### I-1: `Retry-After` / `X-RateLimit-Reset` の上限が未規定

- **場所**: delta/github-api-lib/spec.md「Retry and Rate Limit Handling」、T-02a
- **問題**: `Retry-After` header 値や `X-RateLimit-Reset` epoch までの待機時間に上限が設定されていない。GitHub API のバグや悪意ある応答で非現実的な値（例: 86400 秒）が返ると、クライアントが無限に近い時間ハングする。
- **修正案**: spec に上限を明記する。例:
  - `Retry-After` wait: `min(Retry-After, 60)` 秒
  - `X-RateLimit-Reset` wait: `min(reset - now, 300)` 秒

### I-2: T-02b で既存メソッドの挙動が暗黙的に変わる

- **場所**: tasks.md T-02b
- **問題**: 既存メソッドを `request()` 経由にリファクタリングすると 5xx retry が追加される。現在これらのメソッドは 5xx で即 throw するため、挙動変化をテストが検出できていない。特に以下が懸念:
  - `verifyTokenScopes()` は AbortController で 5 秒 timeout を張っているが、`request()` に組み込む際の timeout 継続方針が未記述
  - `getRawFile()` は 404 で独自 retry しており、`request()` の 5xx retry との組み合わせが複雑になる
- **修正案**: T-02b に「既存メソッドの挙動変化の明示」と「`verifyTokenScopes` の timeout を `request()` に渡す方針」を追記する

### I-3: `createPullRequest` の 422 Unprocessable Entity が未ハンドル

- **場所**: delta/github-api-lib/spec.md「PR Creation via REST API」
- **問題**: GitHub は PR body が無効・既存 PR の重複検出などで 422 を返す。spec では 422 の扱いが記述されていない（現実装では `listPullRequests` で事前チェックするが、race condition で重複 create が起きる可能性は残る）。
- **修正案**: 422 は `SpecRunnerError(GITHUB_API_ERROR)` として throw するシナリオを spec に追記する

---

## Minor（実装者の判断に委ねる）

### M-1: `listPullRequests` クエリの `owner:head` エンコーディング

- `?head={owner}:{head}` の `owner` と `head` に `encodeURIComponent` が必要か不明。既存コードの `verifyBranch` では `encodeURIComponent(branch)` を使っており、同様に適用すべき。spec に明示しておくと実装ミスを防げる。

### M-2: セキュリティ — token をエラーメッセージ・ログに含めない旨の明示

- `request()` method が Authorization header を構築するため、エラーログがリクエスト詳細を出力すると token が漏れるリスクがある。spec か tasks に「error message / log に token 値を含めない」制約を 1 行追加することを推奨。

---

## 確認済み（問題なし）

- D1（既存 `GitHubClient` port 拡張）: 正しい選択。DI graph の単純性が保たれる。
- D2（field mapping を adapter 境界で吸収）: `mergeStateStatus` / `mergeable` / `headRefName` / `state` の mapping テーブルは正確。既存 core ロジックへの影響は最小。
- D3（`sleepFn` injection）: テスタビリティのための正しい設計。
- D4（`--admin` 相当の REST 等価）: 制約を正直に記述しており、escalation 設計も適切。
- D5（`X-GitHub-Api-Version` header）: class 定数で管理するのは正しい。
- D6（owner/repo の entry point 解決）: `getOriginInfo()` で解決して下流に注入するのは clean。
- T-11d / T-11e（retry・field mapping のユニットテスト）: 適切な粒度でカバーされている。
- delta spec 形式: 3 ファイルともフォーマット準拠、validation result は approved。

---

## 修正後の再レビュー不要

C-1・C-2・C-3 を修正し I-1〜I-3 を対処または対処しない旨を明記すれば、再レビューなしで実装フェーズに進んでよい。
