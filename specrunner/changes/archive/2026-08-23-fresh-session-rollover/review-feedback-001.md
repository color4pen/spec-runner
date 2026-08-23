# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### diff 範囲の把握

`git diff main...HEAD --stat` で 32 ファイル、5655 挿入 / 48 削除 を確認。主な変更対象:

- `src/adapter/claude-code/agent-runner.ts` — rollover ループ実装（+284 行）
- `src/adapter/claude-code/rollover-prompt.ts` — 新規 rollover continuation prompt module
- `src/config/schema/{types,resolution,validation}.ts` — contextRollover config 節
- `src/core/port/agent-runner.ts` — AgentSessionRollover / sessionRollovers フィールド追加
- `src/core/step/commit-orchestrator.ts` — rollover contextOnly エントリ永続化
- `src/core/step/step-halt.ts` — halt への sessionRollovers 転記
- `src/kernel/event-types.ts` / `src/core/event/types.ts` — step:rollover イベント追加
- `src/logger/pipeline-logger.ts` / `src/cli/progress.ts` — step:rollover 購読
- テストファイル 6 件（新規）

### spec / design 照合

- `specrunner/changes/fresh-session-rollover/design.md`（D1–D9）を通読
- `specrunner/changes/fresh-session-rollover/tasks.md`（T-01〜T-09）を通読
- `specrunner/changes/fresh-session-rollover/test-cases.md`（35 TC）を通読
- `specrunner/changes/fresh-session-rollover/spec.md` は参照済み（spec-review-result-001 経由）

### 実装確認

**agent-runner.ts（rollover ループ）**:

- `let rolloverAttempt = 0; rolloverAttempt <= maxRollovers; rolloverAttempt++` → bounded ループが確認できる
- exhaustion 検出: `joinErrorsFromResult(errorResult)` → `isContextExhaustionError()` → 新規 classifier なし（D2 準拠）
- abort 発火時 (`abortController.signal.aborted`) はロールオーバーせず break → TC-025 OK
- rollover 実行順序:
  1. `capturedSessionId = extractedSessionId`（リセット前にキャプチャ）
  2. `contextObserver.markExhaustion()` → `contextObserver.snapshot()`（T-05 の "snapshot before reset" 順序）
  3. `sessionRollovers.push({...})` → rollover 観測の記録
  4. 捨てた session の modelUsage 加算
  5. `delete queryOptions["resume"]` / `extractedSessionId = undefined` / `capturedToolResult = null` / `resumeFallbackDone = true`
  6. `contextObserver = createContextObserver(...)` — fresh observer（D7 準拠）
  7. `currentPrompt` の差し替え（rolloverSection を completion directive 前に挿入 — D5 準拠）
  8. `step:rollover` event emit
- rollover budget 超過時: `rolloverExhausted = true; break` → `CONTEXT_WINDOW_EXHAUSTED` error + hint
- 外側 catch の throw 経路: `collectCauseText(cause)` → `isContextExhaustionError()` → typed code（D8）
- follow-up turn（postWorkPrompts）: exhaustion で typed code だが rollover なし（D8 準拠）
- `touchedFileMessages` はリセットしない（D6 準拠）

**rollover-prompt.ts**: 日本語文面に git diff / tasks.md / 保持 / completion report の4要素を確認。`git commit` / `git push` は禁止文として含まれる（促す文言なし）。

**config schema**: `contextRollover.maxRollovers` が `gte(0, ...)` で負値拒否、`int(...)` で非整数拒否、オブジェクト以外は object() 型チェックで拒否。`DEFAULT_CONTEXT_ROLLOVER_MAX = 1`。

**step-halt.ts**: `makeNonSuccessHalt` / `makeTimeoutHalt` ともに `runResult.sessionRollovers` を（length > 0 のとき）spread している。halt 経路は OK。

**commit-orchestrator.ts**: 
- 成功経路: `applySuccessPostPersistEffects` で `sessionRollovers` ループ → `contextOnly: true` / `modelUsage: null` で `appendInvocation` → best-effort try/catch
- halt 経路: `commitHalt` の context metrics ブロックで同様の処理
- 既存 success エントリより **前** に rollover エントリを追記（TC-015 の想定順序と一致）

**テスト確認（must priority TC）**:

| TC | テストファイル | 確認状況 |
|---|---|---|
| TC-001 | agent-runner-rollover.test.ts | 複数パターン確認 |
| TC-002 | agent-runner-rollover.test.ts | 確認 |
| TC-003 | agent-runner-rollover.test.ts | 確認 |
| TC-004 | agent-runner-rollover.test.ts | 確認（resume 不在 / cwd 一致 / rolloverSection 含有） |
| TC-005 | agent-runner-rollover.test.ts | 確認 |
| TC-006 | rollover-prompt.test.ts | 4 要素確認 |
| TC-007 | agent-runner-executor-integration.test.ts | finalizeStepArtifacts 1回確認 |
| TC-008 | agent-runner-rollover.test.ts | maxRollovers+1 停止確認 |
| TC-009 | agent-runner-executor-integration.test.ts | CONTEXT_WINDOW_EXHAUSTED halt 確認 |
| TC-010 | agent-runner-rollover.test.ts | 確認 |
| TC-011 | 既存テスト（agent-runner-transient-retry.test.ts）無変更 green | 暗黙的カバー |
| TC-012 | agent-runner-rollover.test.ts | 確認 |
| TC-013 | agent-runner-rollover.test.ts | peakActiveContextTokens 分離確認 |
| TC-014 | agent-runner-rollover.test.ts | step:rollover payload 確認 |
| TC-015 | commit-orchestrator-rollover.test.ts | CommitOrchestrator 直呼び確認 |
| TC-016 | context-rollover-config.test.ts | default=1 確認 |
| TC-017 | context-rollover-config.test.ts | -1 拒否確認 |
| TC-019 | context-rollover-config.test.ts | 非整数拒否確認 |
| TC-020 | context-rollover-config.test.ts | 非オブジェクト拒否確認 |
| TC-021 | context-rollover-config.test.ts | 既存 config valid 確認 |
| TC-023 | rollover-prompt.test.ts | git commit / git push 不在確認 |
| TC-025 | agent-runner-rollover.test.ts | abort 発火時 rollover なし確認 |
| TC-028 | agent-runner-rollover.test.ts | sessionRollovers undefined 確認 |
| TC-030 | commit-orchestrator-rollover.test.ts | 確認 |
| TC-031 | commit-orchestrator-rollover.test.ts | halt 経路 contextOnly エントリ確認 |

**既存テスト無変更確認**:

`git diff main...HEAD` に以下ファイルの差分なしを確認:
- `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts`
- `src/adapter/claude-code/__tests__/agent-runner-report-settles.test.ts`
- `tests/unit/adapter/claude-code/agent-runner.test.ts`
- `tests/unit/adapter/claude-code/agent-runner-inactivity-timeout.test.ts`
- `tests/unit/adapter/claude-code/agent-runner-context-metrics.test.ts`
- `src/adapter/shared/transient-error.ts`

**verification**: build / typecheck / test / lint / changed-line-coverage すべて passed を確認（verification-result.md）

### 問題発見: executor.ts の sessionRollovers pass-through 欠落

`git diff main...HEAD` に `src/core/step/executor.ts` が **含まれない** ことを確認。

T-06 の仕様:
> `src/core/step/executor.ts` の agent step 成功経路で `runResult.sessionRollovers` を `StepExecutionResult`（kind: "success"）へ素通しする

executor.ts の成功 return ブロック（行 514–531）:

```typescript
return {
  kind: "success",
  completion,
  completedAt,
  startedAt,
  session,
  agentBranch: runResult.agentBranch ?? undefined,
  modelUsage: runResult.modelUsage,
  followUpAttempts: runResult.followUpAttempts,
  transientRetryAttempts: runResult.transientRetryAttempts,
  completionReportDiagnostics: runResult.completionReportDiagnostics,
  addedTurns: runResult.addedTurns,
  invocationMetrics: runResult.invocationMetrics,
  ...(runResult.contextMetrics !== undefined ? { contextMetrics: runResult.contextMetrics } : {}),
  ...(commitOid !== undefined ? { commitOid } : {}),
  ...(runResult.touchedFiles !== undefined ? { touchedFiles: runResult.touchedFiles } : {}),
  // sessionRollovers の spread が 欠落 ← ここが問題
};
```

`runResult.sessionRollovers` の spread が欠落しているため:

1. `executor.execute()` → `runAgentStep()` → `commitOrchestrator.commitSuccess()` の実行パスで `StepExecutionResult.sessionRollovers` が `undefined` になる
2. `CommitOrchestrator.applySuccessPostPersistEffects` の `if (sessionRollovers && sessionRollovers.length > 0 ...)` ブランチが実行されない
3. rollover 分の `contextOnly: true` エントリが usage.json に **書き込まれない**

TC-015 のテストは `CommitOrchestrator.commitSuccess()` を `StepExecutionResult` を直接組み立てて呼んでおり、executor.ts を経由しないため、この欠落を検出できない。TC-007 統合テストは executor パスを通るが `usage.json` の内容を assert しない。

**影響する受け入れ条件**:
> rollover 1 回 + 最終 success の step で usage.json に「rollover 分の `contextOnly` エントリ」+「通常の success エントリ」が記録される

**修正内容**: executor.ts の return ブロックに以下を追加する:

```typescript
...(runResult.sessionRollovers && runResult.sessionRollovers.length > 0
  ? { sessionRollovers: runResult.sessionRollovers }
  : {}),
```

## 検証できなかった項目

- **TC-029** (should): step:rollover event の pipeline logger JSONL への記録を自動テストで確認していない。`pipeline-logger.ts` に購読ロジックが追加されていること（コードレビュー）は確認したが、実際に JSONL に書き出されることを assert するテストは存在しない。
- **TC-027** (could): rollover 後も touchedFileMessages が蓄積継続することの自動テストなし。コードで `touchedFileMessages` はリセットしていないことは実装で確認。

## Findings 詳細

### Finding 1 (HIGH): executor.ts が sessionRollovers を成功 StepExecutionResult に含めていない

**ファイル**: `src/core/step/executor.ts`（行 514–531 付近の return 文）

**問題**: T-06 仕様「executor.ts の agent step 成功経路で runResult.sessionRollovers を StepExecutionResult（kind: "success"）へ素通しする」が未実装。executor.ts は main ブランチから差分なし。

**影響**:
- 本番実行パス（StepExecutor.execute() 経由）では rollover の contextOnly エントリが usage.json に記録されない
- TC-015 の受け入れ条件「rollover 1 回 + 最終 success の step で usage.json にrollover 分 contextOnly エントリが記録される」が実行パスレベルでは満たされない
- テストが CommitOrchestrator を直接構築しているため、この欠落が検出されていない

**修正**（1 行追加、executor.ts の return ブロック末尾）:

```typescript
...(runResult.sessionRollovers && runResult.sessionRollovers.length > 0
  ? { sessionRollovers: runResult.sessionRollovers }
  : {}),
```
