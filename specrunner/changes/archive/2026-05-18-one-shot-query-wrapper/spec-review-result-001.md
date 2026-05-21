# Spec Review Result — one-shot-query-wrapper

- **verdict**: approved
- **reviewer**: spec-reviewer (local)
- **date**: 2026-05-18
- **iteration**: 1

## Summary

request.md / design.md / tasks.md / delta spec の4点を既存コードベースと照合した。仕様は内部整合性が取れており、実装に必要十分な粒度がある。以下の minor findings は実装者への注意喚起として記録するが、blocking ではない。

## Findings

### F-01 [LOW] request.md の `executeReview()` は実際には `runReview()` が対象

- **location**: request.md 要件3 / 受け入れ基準
- **description**: request.md は一貫して `executeReview()` を置き換え対象と記述しているが、boilerplate が存在するのは `src/core/request/reviewer.ts` の `runReview()`。`src/core/command/request-review.ts` の `executeReview()` は `runReview()` を呼ぶだけの command-layer wrapper で、query() boilerplate を持たない。
- **impact**: design.md (D5) と tasks.md (T-04) は正しく `runReview()` を対象としており、実装に支障なし。
- **recommendation**: 実装時は design.md / tasks.md の記述に従う。

### F-02 [LOW] QueryOneShotOptions の API shape が request.md と design.md で異なる

- **location**: request.md 設計判断1 vs design.md D1/D4
- **description**: request.md は `queryOneShot(opts: QueryOneShotOptions): Promise<QueryOneShotResult>` だが、design.md は `queryOneShot(opts, config: SpecRunnerConfig, queryFn?: QueryFn)` に拡張し、`opts` にも `cwd` / `stepName` / `model` を追加。
- **impact**: design.md の拡張は妥当。`config` は config 解決に必須、`queryFn` は既存 DI パターン踏襲、追加 opts fields は `getStepExecutionConfig()` の resolution chain に必要。request.md の "config 解決は内部で行う" は config object 自体を外から渡さないという意味ではなく、resolution logic を内包するという意味と読める。
- **recommendation**: delta spec は design.md 準拠で正しく記述済み。問題なし。

### F-03 [LOW] エラーコードの置き換え: REVIEW_SESSION_FAILED → QUERY_ONE_SHOT_FAILED

- **location**: src/core/request/reviewer.ts L249 vs design.md D6
- **description**: 既存 `runReview()` は `"REVIEW_SESSION_FAILED"` (string literal、ERROR_CODES 未登録) を throw。置き換え後は `queryOneShot` が `"QUERY_ONE_SHOT_FAILED"` を throw。`executeReview()` (command layer) は SpecRunnerError を catch して stderr 出力 + exit code 1 に変換するため、外部契約の変更はない。
- **impact**: なし。エラーコード文字列に依存する downstream consumer は存在しない。
- **recommendation**: tasks.md T-04 のコメントに明記されていないが、実装時に自然に置き換わる。

### F-04 [LOW] tasks.md が TC-OSQ-05 を追加

- **location**: tasks.md T-05 vs request.md 要件4
- **description**: request.md は TC-OSQ-01〜04 を列挙。tasks.md は TC-OSQ-05 (非 success result で QUERY_ONE_SHOT_FAILED を throw) を追加。
- **impact**: 正当な追加。非 success ケースのテストは design.md D6 の仕様から導出される必須ケース。

## Security Assessment

- **permissionMode: "bypassPermissions"**: 既存 `reviewer.ts` / `agent-runner.ts` と同一。CLI ツールがローカルマシンで実行される前提では妥当。新たな attack surface の追加なし。
- **入力検証**: `systemPrompt` / `prompt` は string 型で Claude SDK に直接渡される。ユーザーが自身の request.md を投入する利用形態のため、injection リスクは自己帰結 (self-inflicted)。
- **AbortController timeout**: timeout 後の resource leak 対策 (`finally` で `clearTimeout`) は design.md / tasks.md で明記。
- **OWASP Top 10**: 該当する外部入力経路・ネットワーク公開なし。

## Consistency Checks

| Artifact | Status | Notes |
|----------|--------|-------|
| request.md ↔ design.md | OK | design.md は request.md を正当に refined (F-01, F-02 参照) |
| design.md ↔ tasks.md | OK | tasks.md は design.md の D1-D6 を忠実にタスク分解 |
| tasks.md ↔ delta spec | OK | delta spec の Requirement は tasks.md の実装内容と一致 |
| delta spec ↔ 既存 spec (agent-runner-port) | OK | orthogonal — 相互依存なし、MODIFIED なし |
| delta spec path | OK | `specs/one-shot-query/spec.md` は新規 capability、ADDED セクションのみ |
| 既存テスト影響 | OK | TC-RR-001〜010 は `parseReviewOutput` / `verdictToExitCode` / `buildInitialMessage` のみ。`runReview()` の internal 変更に影響なし |
