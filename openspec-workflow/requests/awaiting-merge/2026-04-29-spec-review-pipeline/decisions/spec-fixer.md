# Spec Fixer Decisions — 2026-04-29-spec-review-pipeline

## 決定一覧

### D1: getFileContent を削除し fetchSpecReviewResult (raw fetch) に置き換える :: 理由

`getFileContent(token, owner, repo, path, ref)` は github-api-lib への参照であり、本リポジトリには存在しない。`src/core/pipeline.ts:243-304` は `PipelineDeps.githubFetch` による raw fetch を使って GitHub API を直叩きしており、これが確立済みのパターンである。新規ヘルパー関数を導入するタスクを追加するより、既存パターンに合わせて `fetchSpecReviewResult(deps, slug, branch)` を spec-review.ts に実装する方針が最小変更・一貫性ともに優れる。design.md / tasks.md / spec-review-session/spec.md の 3 ファイルを `fetchSpecReviewResult` + raw fetch に統一した。

### D2: pollUntilComplete を再利用し、status 完了値を "idle" に統一する :: 理由

SDK の `BetaManagedAgentsSession.status` 完了値は `"idle"` であることが `src/core/completion.ts:30`（`isProposeComplete` 関数）で確認できる。`ended` は SDK に存在しない値であり、spec-review-session/spec.md の `status === "ended"` は誤りだった。また `pollUntilComplete` は timeout / sleepFn 注入 / 指数バックオフ / jitter / abort / terminated 検知を備えており、tasks.md 4.4 で新規ポーリングを書くのは二重化になる。design.md / tasks.md / spec-review-session/spec.md を `pollUntilComplete` 再利用 + `"idle"` 判定に統一した。

### D3: runProposePipeline ラッパーを削除し call site を runPipeline に置換する :: 理由

`runProposePipeline` の唯一の呼び出し元は `src/cli/run.ts:88` であり、内部 API のため外部互換要件はない。design.md / spec.md / tasks.md / module-analysis.md 間でラッパーを「残す」「削除する」が分裂していた状態を、module-architect の推奨（完全置換）に従って統一した。ラッパーが残ると将来の保守者がどちらを使うか迷い、tasks.md 2.4 / 5.6 の「既存テストを step 単体テスト + runPipeline 統合テストに置換」方針ともラッパー維持は矛盾する。propose-pipeline/spec.md の "後方互換 wrapper" Scenario を削除し、design.md Decision 1 実装メモを「削除」に修正、tasks.md 2.3 を「削除」に書き換えた。
