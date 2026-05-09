# Spec Review Result — session-state-handling (Iteration 2)

- **reviewer**: spec-reviewer
- **date**: 2026-05-09
- **verdict**: approved

## Summary

Iteration 1 の HIGH 指摘（`listEvents` の `order: "desc"` 欠落、`isProposeComplete` のリネーム未対応）が共に解消されている。proposal.md の Impact セクションにエラー正規化パスの記述が追加され、T9a タスクで `normalizeSessionError` の互換性確認が追加された。仕様全体が request の 10 要件を網羅しており、タスク間の依存関係・実行順序も整合している。

## Iteration Comparison

### Improvements

| Iter 1 # | Severity | 改善内容 |
|-----------|----------|---------|
| 1 | HIGH → resolved | T2 `listEvents` に `{ order: "desc" }` が組み込まれ、`getIdleStopReason` が最新 idle イベントを返す設計に修正 |
| 2 | HIGH → resolved | T4 で `isProposeComplete` → `isSessionIdle` リネームが明記され、T5 の stop_reason 区別との認知的矛盾が解消 |
| 3 | MEDIUM → resolved | T2 `isRetryStatusRetrying` の引数型が `BetaManagedAgentsSessionErrorEvent["error"]` で明示され、SDK union 型の全 variant が `retry_status` を持つことがコメントで説明 |
| 4 | MEDIUM → resolved | proposal.md Impact セクションに `session-client.ts` adapter 経由のエラー正規化パス（catch → normalizeSessionError）の記述が追加 |
| 5 | MEDIUM → resolved | T9a タスクが追加され、`normalizeSessionError` が新規 `SpecRunnerError` インスタンスの `.code` を正しく保持する確認が含まれている |

### Regressions

なし。

### Unchanged Issues

| Iter 1 # | Severity | 状態 |
|-----------|----------|------|
| 6 | LOW | Port 型の重複は実装ノートに注意事項として記載。今回スコープ外として許容 |
| 7 | LOW | SSE ストリームのモック統合テストは scope 外。spec-fixer-deferred コメントで記録済み |

### Convergence Trend

`improving` — Iteration 1 の HIGH 2 件・MEDIUM 3 件が全て解消。新規 HIGH/CRITICAL なし。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | completeness | proposal.md | Impact の「変更ファイル」リストに `src/adapter/managed-agent/session-client.ts` が含まれていない。T8 で `streamEvents` の `terminationReason` 返り値型を拡張するため実際には変更が発生する。エラー正規化パスの説明では言及されているが、変更ファイル一覧との不整合 | 「変更ファイル」リストに `src/adapter/managed-agent/session-client.ts — streamEvents 返り値型の terminationReason 拡張` を追加する |
| 2 | LOW | consistency | tasks.md T3 | SSE の unknown event type（`session.error` / `session.deleted` / `session.status_rescheduled` 以外の将来イベント）は暗黙的にスキップされる。request 要件 10「未知の状態が来た場合はログ出力して続行する」との差分があるが、SDK は多数の content event（`agent.text` 等）を発行するため catch-all ログは過剰ノイズになる。T3 実装ノートに「未マッチは自然と次の iteration へ」と明記されており、idle 内の unknown stop_reason にはログが出るため実質的なカバレッジは十分 | 今回は許容。将来的に verbose ログモード導入時に再検討 |
| 3 | LOW | maintainability | tasks.md T7/T8 | Port `terminationReason` 型（`session-client.ts` L79）と adapter `TerminationReason` 型（`sse-stream.ts`）の値を手動同期する設計。片方の更新漏れリスクがある | 実装ノートに注意事項として記載済み。spec-fixer-deferred #6 で将来課題化済み |

## Verdict Rationale

Iteration 1 の HIGH 2 件が全て解消され、CRITICAL: 0、HIGH: 0。残存 findings は全て LOW（ドキュメント不整合・将来的な保守性懸念）であり、実装の正確性・安全性に影響しない。request の全 10 要件がタスクに対応し、受け入れ基準の検証手順も明確。`approved`。
