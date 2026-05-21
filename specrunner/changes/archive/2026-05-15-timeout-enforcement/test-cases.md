# Test Cases: timeout-enforcement

## Overview

このテストケース集は以下の変更領域をカバーする:

- **D1**: StepRun の startedAt / endedAt タイムスタンプ記録バグ修正
- **D2**: Claude Code / Codex adapter の timeoutMs 再有効化
- **D3**: Managed Agent adapter の poll timeout と step timeout の分離
- **D3b**: store.ts の legacy timeoutMs stripping 除去
- **D4**: ADR-0013 Supersede と ADR-0014 新規作成

---

## Category: StepRun Timing (D1)

### TC-01: pushStepResult が startedAt を StepRun.startedAt に反映する

- **Priority**: must
- **Source**: T-01, D1

**GIVEN**: `pushStepResult()` に `startedAt: "2026-01-01T00:00:00.000Z"` と `completedAt: "2026-01-01T00:05:00.000Z"` を含む `partial` を渡す  
**WHEN**: `pushStepResult()` を呼び出す  
**THEN**: 生成された `StepRun.startedAt` が `"2026-01-01T00:00:00.000Z"` に設定される

---

### TC-02: pushStepResult が completedAt を StepRun.endedAt に反映する

- **Priority**: must
- **Source**: T-01, D1

**GIVEN**: `pushStepResult()` に `completedAt: "2026-01-01T00:05:00.000Z"` を含む `partial` を渡す  
**WHEN**: `pushStepResult()` を呼び出す  
**THEN**: 生成された `StepRun.endedAt` が `"2026-01-01T00:05:00.000Z"` に設定される

---

### TC-03: startedAt と endedAt が異なるタイムスタンプになる（バグ修正確認）

- **Priority**: must
- **Source**: T-01, D1 現状バグ説明

**GIVEN**: `startedAt: "2026-01-01T00:00:00.000Z"` と `completedAt: "2026-01-01T00:05:00.000Z"` を渡す  
**WHEN**: `pushStepResult()` を呼び出す  
**THEN**: `StepRun.startedAt !== StepRun.endedAt` であり、両者が異なるタイムスタンプになる（旧バグでは同一タイムスタンプになっていた）

---

### TC-04: startedAt を渡さない場合に現在時刻にフォールバックする（後方互換性）

- **Priority**: should
- **Source**: T-01 後方互換性（`partial.startedAt ?? now`）

**GIVEN**: `pushStepResult()` に `startedAt` を含まない `partial` を渡す（`completedAt` のみ指定）  
**WHEN**: `pushStepResult()` を呼び出す  
**THEN**: `StepRun.startedAt` が `new Date().toISOString()` 相当の現在時刻にフォールバックする（undefined / null にならない）

---

### TC-05: runAgentStep が runner.run() の開始前に startedAt を取得する

- **Priority**: must
- **Source**: T-02a/b, D1

**GIVEN**: `runAgentStep()` が呼び出され、`runner.run()` が一定の実行時間を要する  
**WHEN**: `runner.run()` が完了する  
**THEN**: `StepRun.startedAt` が `runner.run()` 開始前のタイムスタンプ、`StepRun.endedAt` が `runner.run()` 完了後のタイムスタンプになり、`startedAt < endedAt` が成立する

---

### TC-06: runCliStep が step.run() の開始前に startedAt を取得する

- **Priority**: must
- **Source**: T-03a/b, D1

**GIVEN**: `runCliStep()` が呼び出され、`step.run()` が一定の実行時間を要する  
**WHEN**: `step.run()` が完了する  
**THEN**: `StepRun.startedAt` が `step.run()` 開始前のタイムスタンプ、`StepRun.endedAt` が `step.run()` 完了後のタイムスタンプになり、`startedAt < endedAt` が成立する

---

### TC-07: .catch ブロック内のエラー時に startedAt が StepRun に記録される

- **Priority**: must
- **Source**: T-02c（`.catch()` ブロック内では startedAt のみ渡す方針）

**GIVEN**: `runner.run()` が `.catch()` でキャッチされるエラーを throw する  
**WHEN**: `recordFailedStepResult()` が呼ばれる  
**THEN**: `StepRun.startedAt` に step 開始前のタイムスタンプが記録される（completedAt は `pushStepResult` のフォールバック `new Date().toISOString()` で補完される）

---

### TC-08: runCliStep の catch ブロック内のエラー時に startedAt が StepRun に記録される

- **Priority**: must
- **Source**: T-03c（T-02c と同方針）

**GIVEN**: `step.run()` が catch ブロックでキャッチされるエラーを throw する  
**WHEN**: `recordFailedStepResult()` が呼ばれる  
**THEN**: `StepRun.startedAt` に step 開始前のタイムスタンプが記録される（completedAt は `pushStepResult` のフォールバックで補完）

---

### TC-09: タイムアウト後の recordFailedStepResult に startedAt と completedAt が両方渡される

- **Priority**: must
- **Source**: T-02c（L170 タイムアウトブロック。ブロック外の completedAt は定義済み）

**GIVEN**: timeout が発生し、ブロック外で `completedAt` が既に定義されている  
**WHEN**: timeout ブロック内の `recordFailedStepResult()` が呼ばれる  
**THEN**: `StepRun.startedAt` と `StepRun.endedAt` の両方に正しいタイムスタンプが記録される

---

## Category: Claude Code Adapter タイムアウト (D2)

### TC-10: timeoutMs 設定時に Claude Code adapter が指定時間後にアボートする

- **Priority**: must
- **Source**: request 要件4, D2

**GIVEN**: config に `steps.implementer.timeoutMs: 100` を設定した状態で Claude Code adapter を使用する  
**WHEN**: implementer ステップの実行が 100ms を超える  
**THEN**: `AbortController.abort()` が呼ばれ、`query()` がアボートされる

---

### TC-11: timeoutMs 未設定時に Claude Code adapter がタイムアウトしない（デフォルト null）

- **Priority**: must
- **Source**: request 受け入れ基準, D2

**GIVEN**: config に `timeoutMs` が未設定（null）の状態  
**WHEN**: implementer ステップを実行する  
**THEN**: `setTimeout` が設定されず、タイムアウトは発生しない（無制限実行）

---

### TC-12: timeoutMs: 0 は Claude Code adapter でタイムアウトを起動しない

- **Priority**: should
- **Source**: D2（`resolvedConfig.timeoutMs > 0` ガード）

**GIVEN**: config に `timeoutMs: 0` を設定した状態  
**WHEN**: Claude Code adapter でステップを実行する  
**THEN**: `> 0` チェックにより `setTimeout` が設定されず、タイムアウトは発生しない

---

## Category: Codex Adapter タイムアウト (D2)

### TC-13: timeoutMs 設定時に Codex adapter が指定時間後にアボートする

- **Priority**: must
- **Source**: request 要件5, D2

**GIVEN**: config に `steps.codex.timeoutMs: 100` を設定した状態で Codex adapter を使用する  
**WHEN**: codex ステップの実行が 100ms を超える  
**THEN**: `AbortController.abort()` が呼ばれ、`thread.run()` の `turnOptions.signal` 経由でアボートされる

---

### TC-14: timeoutMs 未設定時に Codex adapter がタイムアウトしない（デフォルト null）

- **Priority**: must
- **Source**: D2

**GIVEN**: config に `timeoutMs` が未設定（null）の状態  
**WHEN**: Codex adapter でステップを実行する  
**THEN**: タイムアウトは発生しない（無制限実行）

---

## Category: Managed Agent Adapter タイムアウト (D3)

### TC-15: timeoutMs 設定時に SSE polling fallback パスで pollUntilComplete に timeoutMs が渡される

- **Priority**: must
- **Source**: T-04a, D3, request 要件6

**GIVEN**: config に `steps.implementer.timeoutMs: 600000` を設定した状態  
**WHEN**: SSE polling fallback パスで `pollUntilComplete()` が呼ばれる  
**THEN**: `pollUntilComplete()` に `timeoutMs: 600000` が渡される（`DEFAULT_POLL_TIMEOUT_MS` ではなくユーザー設定値）

---

### TC-16: timeoutMs 未設定時に SSE polling fallback パスで DEFAULT_POLL_TIMEOUT_MS にフォールバックする

- **Priority**: must
- **Source**: T-04a, D3

**GIVEN**: config に `timeoutMs` が未設定（null）の状態  
**WHEN**: SSE polling fallback パスで `pollUntilComplete()` が呼ばれる  
**THEN**: `pollUntilComplete()` に `timeoutMs: 900000`（DEFAULT_POLL_TIMEOUT_MS = 15分）が渡される

---

### TC-17: timeoutMs: 0 の場合も SSE polling fallback パスで DEFAULT_POLL_TIMEOUT_MS にフォールバックする

- **Priority**: must
- **Source**: T-04 注意事項（`??` でなく `> 0` チェックを採用）

**GIVEN**: config に `timeoutMs: 0` を設定した状態  
**WHEN**: SSE polling fallback パスで `pollUntilComplete()` が呼ばれる  
**THEN**: `> 0` チェックにより `DEFAULT_POLL_TIMEOUT_MS`（900000ms）が使われる（`timeoutMs: 0` を渡すと即時 PollTimeoutError になるため防ぐ）

---

### TC-18: timeoutMs 設定時に Polling-style パスでも pollUntilComplete に timeoutMs が渡される

- **Priority**: must
- **Source**: T-04b, D3

**GIVEN**: config に `steps.implementer.timeoutMs: 600000` を設定した状態で polling-style パスが使われる  
**WHEN**: `pollUntilComplete()` が呼ばれる  
**THEN**: `pollUntilComplete()` に `timeoutMs: 600000` が渡される

---

### TC-19: Polling-style パスでも timeoutMs 未設定時は DEFAULT_POLL_TIMEOUT_MS にフォールバックする

- **Priority**: must
- **Source**: T-04b, D3

**GIVEN**: config に `timeoutMs` が未設定（null）の状態で polling-style パスが使われる  
**WHEN**: `pollUntilComplete()` が呼ばれる  
**THEN**: `pollUntilComplete()` に `timeoutMs: 900000`（DEFAULT_POLL_TIMEOUT_MS）が渡される

---

### TC-20: getStepExecutionConfig の step default から DEFAULT_POLL_TIMEOUT_MS が除去される

- **Priority**: must
- **Source**: T-04, D3 修正方針

**GIVEN**: Managed Agent が `getStepExecutionConfig()` を呼ぶ際に `timeoutMs` を step default として渡さない  
**WHEN**: config に `timeoutMs` が未設定  
**THEN**: `resolvedConfig.timeoutMs` が `null` になる（旧コードでは `DEFAULT_POLL_TIMEOUT_MS` が混入していた）

---

## Category: タイムアウト時の状態遷移

### TC-21: Claude Code adapter でタイムアウト時に job が awaiting-resume に遷移する

- **Priority**: must
- **Source**: request 要件7, D2

**GIVEN**: config に `steps.implementer.timeoutMs: 100` を設定した状態  
**WHEN**: implementer ステップが 100ms を超えてタイムアウトする  
**THEN**: executor の `completionReason: "timeout"` ハンドリングが動作し、job が `awaiting-resume` 状態になり再開可能な状態で保存される

---

### TC-22: Managed Agent adapter で PollTimeoutError 発生時に job が awaiting-resume に遷移する

- **Priority**: must
- **Source**: request 要件6, 7, D3

**GIVEN**: config に短い `timeoutMs` を設定した状態で Managed Agent を使用する  
**WHEN**: `pollUntilComplete()` が `PollTimeoutError` を throw する  
**THEN**: executor の既存エラーハンドリングに乗り、job が `awaiting-resume` 状態になる（AbortSignal 経由でなく `PollTimeoutError` 経由なので executor の `completionReason: "timeout"` 判定と整合する）

---

## Category: store.ts legacy stripping 除去 (D3b)

### TC-23: specReview の timeoutMs が store.write() で strip されなくなる

- **Priority**: should
- **Source**: T-05a, D3b

**GIVEN**: `specReview.timeoutMs: 600000` を含む config を store に write する  
**WHEN**: `store.write()` が呼ばれる  
**THEN**: `specReview.timeoutMs` が削除されずそのまま保存される（旧コードでは strip されていた）

---

### TC-24: specFixer の timeoutMs が store.write() で strip されなくなる

- **Priority**: should
- **Source**: T-05a, D3b

**GIVEN**: `specFixer.timeoutMs: 600000` を含む config を store に write する  
**WHEN**: `store.write()` が呼ばれる  
**THEN**: `specFixer.timeoutMs` が削除されずそのまま保存される

---

## Category: ADR ドキュメント (D4)

### TC-25: ADR-0013 の status が superseded に変更される

- **Priority**: should
- **Source**: T-05

**GIVEN**: `openspec-workflow/adr/ADR-0013-remove-session-timeout.md` が存在する  
**WHEN**: ファイルを読み込む  
**THEN**: `**Status**` フィールドが `superseded by ADR-0014` になっている

---

### TC-26: ADR-0014 が作成され accepted ステータスを持つ

- **Priority**: should
- **Source**: T-06

**GIVEN**: ADR-0014 ファイルが存在しない初期状態  
**WHEN**: T-06 の変更が適用される  
**THEN**: `openspec-workflow/adr/ADR-0014-reenable-timeout-with-default-null.md` が作成され、`Status: accepted`、`Supersedes: ADR-0013` が含まれる

---

### TC-27: ADR-0014 が 3 adapter のタイムアウト実施方法を記述する

- **Priority**: could
- **Source**: T-06

**GIVEN**: ADR-0014 が作成された状態  
**WHEN**: ファイルを読み込む  
**THEN**: Claude Code (AbortController)、Codex (AbortController)、Managed Agent (pollUntilComplete パラメータ) の各実施方法が明記されている

---

## Category: schema.ts JSDoc 更新

### TC-28: steps フィールドの JSDoc が ManagedAgentRunner のサポートを記述する

- **Priority**: could
- **Source**: T-05b

**GIVEN**: `src/config/schema.ts` の `steps` フィールドを確認する  
**WHEN**: JSDoc コメントを読む  
**THEN**: `ManagedAgentRunner` も `timeoutMs` をサポートする旨と、`pollUntilComplete()` 経由である旨が明記されている

---

## Category: ビルド・型チェック

### TC-29: typecheck が green になる

- **Priority**: must
- **Source**: T-07b, 受け入れ基準

**GIVEN**: T-01 〜 T-06 の全変更が適用された状態  
**WHEN**: `bun run typecheck` を実行する  
**THEN**: 型エラーなしで正常終了する

---

### TC-30: テストスイートが green になる

- **Priority**: must
- **Source**: T-07b, 受け入れ基準

**GIVEN**: T-01 〜 T-06 の全変更が適用された状態  
**WHEN**: `bun run test` を実行する  
**THEN**: 全テストが pass する（既存テストが壊れていない）

---

## Summary

| TC | Category | Priority | Source |
|----|----------|----------|--------|
| TC-01 | StepRun Timing | must | T-01, D1 |
| TC-02 | StepRun Timing | must | T-01, D1 |
| TC-03 | StepRun Timing | must | T-01, D1 バグ確認 |
| TC-04 | StepRun Timing | should | T-01 後方互換 |
| TC-05 | StepRun Timing | must | T-02a/b |
| TC-06 | StepRun Timing | must | T-03a/b |
| TC-07 | StepRun Timing | must | T-02c |
| TC-08 | StepRun Timing | must | T-03c |
| TC-09 | StepRun Timing | must | T-02c L170 |
| TC-10 | Claude Code Timeout | must | 要件4, D2 |
| TC-11 | Claude Code Timeout | must | 受け入れ基準, D2 |
| TC-12 | Claude Code Timeout | should | D2 ガード |
| TC-13 | Codex Timeout | must | 要件5, D2 |
| TC-14 | Codex Timeout | must | D2 |
| TC-15 | Managed Agent Timeout | must | T-04a, D3 |
| TC-16 | Managed Agent Timeout | must | T-04a, D3 |
| TC-17 | Managed Agent Timeout | must | T-04 注意事項 |
| TC-18 | Managed Agent Timeout | must | T-04b, D3 |
| TC-19 | Managed Agent Timeout | must | T-04b, D3 |
| TC-20 | Managed Agent Timeout | must | T-04, D3 |
| TC-21 | 状態遷移 | must | 要件7, D2 |
| TC-22 | 状態遷移 | must | 要件6, 7, D3 |
| TC-23 | store.ts stripping | should | T-05a, D3b |
| TC-24 | store.ts stripping | should | T-05a, D3b |
| TC-25 | ADR | should | T-05 |
| TC-26 | ADR | should | T-06 |
| TC-27 | ADR | could | T-06 |
| TC-28 | JSDoc | could | T-05b |
| TC-29 | ビルド | must | T-07b |
| TC-30 | ビルド | must | T-07b |
