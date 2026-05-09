# Implementation Notes: session-state-handling

## Summary

- **result**: completed
- **tasks_completed**: 11/11
- **blocked**: none

## Files Modified

| File | Operation | Summary |
|------|-----------|---------|
| `src/adapter/managed-agent/sse-stream.ts` | Modified | TerminationReason 型に 4 値追加 + SSE ループに requires_action / retries_exhausted / session.error / session.deleted / session.status_rescheduled ハンドリング追加 |
| `src/adapter/managed-agent/sdk/sessions.ts` | Modified | isStatusRescheduledEvent / isSessionErrorEvent / isSessionDeletedEvent / isRetryStatusRetrying 追加 + listEvents ラッパー追加 + 新型 re-export |
| `src/adapter/managed-agent/completion.ts` | Modified | isProposeComplete → isSessionIdle リネーム + rescheduling ハンドリング (MAX=10) + getIdleStopReason による stop_reason 区別 + 新エラーファクトリ import |
| `src/errors.ts` | Modified | SESSION_RETRIES_EXHAUSTED / SESSION_REQUIRES_ACTION / SESSION_RESCHEDULING_EXHAUSTED エラーコード + ファクトリ関数追加 |
| `src/core/port/session-client.ts` | Modified | terminationReason 型に requires_action / retries_exhausted / session_error / session_deleted / unknown を追加 |
| `src/adapter/managed-agent/session-client.ts` | Modified | terminationReason 返り値型を Port と同期 |
| `tests/completion.test.ts` | Modified | isSessionIdle リネーム対応 + TC-RENAME / TC-SS-01-02 / TC-NARROW-01-07 / TC-POLL-02-06 / TC-ERR-01-04 テスト追加（計 27 テスト、全 pass） |

## Blocked Tasks

なし。全タスク完了。

## Design Decisions Confirmed

- **T9**: `agent-runner.ts` の `sseResult.terminated` チェック（Line 159）は新しい terminationReason を全てキャッチするため変更不要
- **T9a**: `normalizeSessionError` は `.code` プロパティを保持するため、新規 `SpecRunnerError` を正しく伝搬する。変更不要
- **TC-028 (既存テスト)**: `pollUntilComplete` モックに `events.list` がない場合は `getIdleStopReason` の catch で `end_turn` にフォールバック。既存テストは引き続き pass

## Test Results

```
bun run typecheck  → exit 0 (型エラーなし)
bun test tests/completion.test.ts  → 27 pass / 0 fail
```

既存のテスト失敗 (pipeline-integration.test.ts, init.test.ts, vi.resetModules 等) はこのブランチの変更前から存在するプレ既存の問題であり、本変更とは無関係。
