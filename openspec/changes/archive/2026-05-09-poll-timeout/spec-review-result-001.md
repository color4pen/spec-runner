# Spec Review Result — poll-timeout

- **reviewer**: spec-reviewer
- **date**: 2026-05-09
- **verdict**: approved

## Summary

仕様は request.md の全 5 要件と受け入れ基準を網羅している。設計判断（D1–D4）は既存のコードベース構造と整合しており、実現可能性に問題はない。`ResolvedStepConfig.timeoutMs`、`completionReason: "timeout"`、`normalizeSessionError` の code 保持など、既存インフラを正しく活用している。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | tasks.md:13 | Task 2.4 で `pollTimeoutError(sessionId, opts!.timeoutMs!)` を渡すが、factory 署名は `elapsedMs: number`。設定値と実経過時間は微小に乖離する | `const startTime = Date.now()` を冒頭で記録し `Date.now() - startTime` を渡す、または引数名を `timeoutMs` に変更する |
| 2 | LOW | completeness | tasks.md:36 | Task 6.2 で `resumePoint: { step, reason, iterationsExhausted: 0 }` の `reason` 値が未指定 | `reason: "poll_timeout"` 等の具体値を明記する |
| 3 | LOW | completeness | tasks.md:18 | Task 3.2 で port の JSDoc 更新とあるが、timeout が `status: "terminated"` + `error.code === "POLL_TIMEOUT"` として返る仕様を JSDoc に反映すべき旨が未記載 | Task 3.2 にその旨を追記する |

## Evaluation

### Completeness

request.md の 5 要件すべてに対応する設計・タスクが存在する。受け入れ基準 5 項目もタスク 7–8 で網羅されている。

### Consistency

- design.md D3 の実装パス（4 層チェーン: completion → session-client → agent-runner → executor）は tasks.md の Task 2–6 と一致
- `completionReason: "timeout"` は `AgentRunResult` 型に既存。型変更不要
- `normalizeSessionError` は `.code` を保持する（session-error.ts:20–24 で確認済み）ため、`POLL_TIMEOUT` コードは正しく伝搬する
- `awaiting-resume` は `JobStatus` 型の既存値。スキーマ変更不要
- `ResolvedStepConfig.timeoutMs` は step-config-externalization で追加済み。resolution chain は D2 の記述と一致
- `remove-session-timeout` テスト（TC-008, TC-011）の更新方針は、旧 `SESSION_TIMEOUT` 不在アサーション維持 + `timeoutMs` 不在アサーション削除で適切

### Feasibility

影響範囲は 8 ファイル（うちテスト 2 件）。全ファイルの存在と構造を確認済み。`pollUntilComplete` 内部への `Date.now()` 判定追加は既存ループ構造に自然に挿入可能。`sleepFn` モックによるテスト戦略も既存テストパターンと一致。
