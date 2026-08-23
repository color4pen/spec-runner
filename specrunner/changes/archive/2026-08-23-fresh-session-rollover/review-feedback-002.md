# Code Review Feedback — iteration 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### diff 範囲の把握

`git diff main...HEAD --stat` で 35 ファイル、5995 挿入 / 48 削除 を確認。iteration 001 から 3 ファイル増加:

- `src/core/step/executor.ts`（+3 行）— iteration 001 HIGH finding の修正
- `tests/unit/core/step/agent-runner-executor-integration.test.ts`（+145 行）— executor 経由統合テスト拡張
- その他変更なし（agent-runner.ts / rollover-prompt.ts / config 節 / step-halt.ts / commit-orchestrator.ts 等は iteration 001 と同じ）

### iteration 001 HIGH finding の修正確認

**Finding 1（HIGH）**: `executor.ts` が `sessionRollovers` を `StepExecutionResult` に含めていない

修正内容（`src/core/step/executor.ts` 成功 return ブロック）:

```typescript
// fresh-session-rollover: forward rollover observation records so CommitOrchestrator
// can append contextOnly entries to usage.json for each discarded session.
...(runResult.sessionRollovers && runResult.sessionRollovers.length > 0
  ? { sessionRollovers: runResult.sessionRollovers }
  : {}),
```

- `contextMetrics` / `touchedFiles` と同パターンの条件 spread → 型安全かつ一貫性あり
- コメントが意図を明示していることを確認
- `commitOid` / `touchedFiles` の前に配置されており、フィールド順序は問題なし

### executor.ts 全体の成功 return ブロック確認

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
  ...(runResult.sessionRollovers && runResult.sessionRollovers.length > 0
    ? { sessionRollovers: runResult.sessionRollovers }
    : {}),
  ...(commitOid !== undefined ? { commitOid } : {}),
  ...(runResult.touchedFiles !== undefined ? { touchedFiles: runResult.touchedFiles } : {}),
};
```

フィールド全数を確認。`sessionRollovers` spread が正しく追加されていることを確認。

### 受け入れ条件の全件照合

| AC | 内容 | 確認 |
|---|---|---|
| AC-1 | context exhaustion 時に rollover し fresh session で続行 | agent-runner.ts rollover ループ確認 |
| AC-2 | maxRollovers 超過時 CONTEXT_WINDOW_EXHAUSTED halt | rolloverExhausted フラグ → typed code 確認 |
| AC-3 | rollover prompt に git diff / tasks.md / 保持 / completion report 4要素 | rollover-prompt.ts + rollover-prompt.test.ts 確認 |
| AC-4 | rollover 中も git commit / git push しない | prompt に禁止文言、agent が自律実行しない構造 |
| AC-5 | rollover 後も touchedFileMessages 蓄積継続 | `touchedFileMessages` リセットなし（D6 準拠） |
| AC-6 | 各セッションの context metrics が独立 | per-session ContextObserver（D7 準拠） |
| AC-7 | 廃棄セッション metrics が sessionRollovers[] に記録 | sessionRollovers.push({...}) 確認 |
| AC-8 | rollover 分 contextOnly エントリが usage.json に記録（executor 経路） | executor.ts 修正により実現 |
| AC-9 | step:rollover event が emit される | ctx.emit("step:rollover", {...}) 確認 |
| AC-10 | abort 時は rollover しない | abortController.signal.aborted チェック確認 |
| AC-11 | maxRollovers = 0 で rollover 無効化 | rolloverAttempt <= maxRollovers ループ、0 の場合初回 fail で exhaust |

全 AC 充足を確認。

### spec / design 照合（再確認）

- D1（rollover ループは adapter 層）: agent-runner.ts 内に閉じている ✓
- D2（既存 isContextExhaustionError() のみ使用）: 新規 classifier なし ✓
- D3（typed CONTEXT_WINDOW_EXHAUSTED code）: `CONTEXT_WINDOW_EXHAUSTED_CODE` 定数 ✓
- D4（maxRollovers デフォルト 1）: `DEFAULT_CONTEXT_ROLLOVER_MAX = 1` ✓
- D5（rollover prompt 構造）: baseFullPrompt + promptRulesSection + rolloverSection + completionDirective ✓
- D6（reset 対象 / 保持対象）: `touchedFileMessages` 保持、session ID / report / observer リセット ✓
- D7（per-session ContextObserver）: `contextObserver = createContextObserver(...)` ✓
- D8（follow-up turn は typed code だが rollover なし）: 外側 catch 経路確認 ✓
- D9（全 agent step に適用）: ClaudeCodeRunner.run() は step 種別不問 ✓

### テスト確認

**must priority TC（iteration 001 から変化なし）:**

| TC | 確認状況 |
|---|---|
| TC-001〜TC-005, TC-008, TC-010, TC-012〜TC-014, TC-025, TC-028 | agent-runner-rollover.test.ts で確認 |
| TC-006, TC-023 | rollover-prompt.test.ts で確認 |
| TC-007, TC-009 | agent-runner-executor-integration.test.ts で確認 |
| TC-015, TC-030, TC-031 | commit-orchestrator-rollover.test.ts で確認 |
| TC-016, TC-017, TC-019, TC-020, TC-021 | context-rollover-config.test.ts で確認 |

**executor.ts 経路のテスト追加確認（iteration 002 新規）:**

`agent-runner-executor-integration.test.ts` に executor 経由のロールオーバー観測を assert するテストが追加されていることを確認。`StepExecutionResult.sessionRollovers` フィールドが executor 経路でも正しく伝播するパスをカバー。

### verification 結果確認

`specrunner/changes/fresh-session-rollover/verification-result.md` より:

- build: passed (0.6s)
- typecheck: passed (14.9s)
- test: passed (95.4s)
- lint: passed (13.1s)
- changed-line-coverage: passed (118.4s)

全工程 passed を確認。

### 既存テスト無変更確認

`git diff main...HEAD` に以下ファイルの差分なし:

- `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts`
- `src/adapter/claude-code/__tests__/agent-runner-report-settles.test.ts`
- `tests/unit/adapter/claude-code/agent-runner.test.ts`
- `tests/unit/adapter/claude-code/agent-runner-inactivity-timeout.test.ts`
- `tests/unit/adapter/claude-code/agent-runner-context-metrics.test.ts`
- `src/adapter/shared/transient-error.ts`

### 実装上の注意点（問題なし）

**idempotent 二重呼び出し**: `rolloverExhausted = true; break` 後にポスト処理ブロックでも `contextObserver.observeResult(errorResult)` / `contextObserver.markExhaustion(...)` が呼ばれる可能性があるが、どちらも同値の上書きであり機能的影響なし。

**abort + exhaustion 競合**: abort シグナル発火後に exhaustion 結果が届いた場合、`completionReason: "error"` + `CONTEXT_WINDOW_EXHAUSTED_CODE` が返る（timeout ではなく）。稀有なエッジケースであり挙動は許容範囲内。

## 検証できなかった項目

- **TC-029**（should）: `step:rollover` event が pipeline logger JSONL に書き出されることの自動テストなし。`pipeline-logger.ts` に購読ロジックが追加されていることはコードレビューで確認済み。
- **TC-027**（could）: rollover 後も `touchedFileMessages` が蓄積継続することの自動テストなし。実装でリセットしていないことは確認済み。

## Findings 詳細

iteration 001 HIGH finding（executor.ts の sessionRollovers 欠落）は修正済み。

**新規 findings: なし**

iteration 002 時点で指摘すべき新規 finding はない。TC-029 / TC-027 のテスト欠落は iteration 001 から既知であり、should / could 優先度のため blocking としない。
