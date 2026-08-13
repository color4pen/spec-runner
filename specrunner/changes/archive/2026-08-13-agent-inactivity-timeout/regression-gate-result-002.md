# Regression Gate Result — Iteration 002

## Findings Verification

### F-01 [HIGH] claude-code output-repair catch が watchdog abort を飲み込む
**File**: src/adapter/claude-code/agent-runner.ts
**Status**: FIXED

Line 1040-1042 に `catch (err)` + `if (abortController.signal.aborted) throw err;` が追加済み。abort エラーは outer catch へ伝播する。

### F-02 [HIGH] codex output-repair catch が watchdog abort を飲み込む
**File**: src/adapter/codex/agent-runner.ts
**Status**: FIXED

Line 701-703 に同型の修正が追加済み。catch (err) + abort 時 re-throw。

### F-03 [MEDIUM] tasks.md T-04 に output-repair 中の watchdog 発火テストが欠落
**File**: specrunner/changes/agent-inactivity-timeout/tasks.md
**Status**: FIXED

T-04 の checklist に "output-repair 中の発火" ステップが追加され、AC に "output-repair 中の watchdog 発火" が 5 件目として明記されている。対応テスト TC-004 も tests/unit/adapter/claude-code/agent-runner-inactivity-timeout.test.ts に存在する。

### F-04 [MEDIUM] tasks.md T-05 に codex output-repair 中の watchdog 発火テストが欠落
**File**: specrunner/changes/agent-inactivity-timeout/tasks.md
**Status**: FIXED

T-05 の checklist と AC に "output-repair 中の発火" が追加され、TC-014 として tests/adapter/codex/agent-runner-inactivity-timeout.test.ts に実装済み。

### F-05 [MEDIUM] 既存テスト assertion 弱化が design.md に未記載
**File**: src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts:389
**Status**: FIXED

design.md の Risks 節に「衝突は 1 件のみ。agent-runner-transient-retry.test.ts expect(callCount).toBe(1) → expect(callCount).toBeLessThanOrEqual(1) に更新。意図の保存を説明」として明示列挙済み。

### F-06 [MEDIUM] SpecRunnerError が timeout 結果に変換される新パス
**File**: src/adapter/claude-code/agent-runner.ts:1113
**Status**: FIXED

outer catch 先頭(line 1113)に `if (err instanceof SpecRunnerError) throw err;` が配置され、timeout 判定(line 1114)より前で SpecRunnerError を再送出する。codex と同じ順序になっている。

## Evidence

- checked: 6
- skipped: 0
- unverified: 0
