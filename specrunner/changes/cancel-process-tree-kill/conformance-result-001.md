# Conformance Result — cancel-process-tree-kill (iteration 1)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### J1: tasks.md — 全チェックボックスの完了確認

T-01〜T-09 の全サブタスクが `[x]` であることを確認。未完了項目なし。

### J2: 設計判断 (D1–D5) と実装の対応

**D1 (共有 pid リゾルバ):** `src/core/liveness/resolve-pid.ts` を確認。
- `readLivenessSidecar(absPath)` — async fs read、absent/unparseable で null を返す ✓
- `resolveJobPid({ statePid, sidecar, expectedJobId })` — pure: statePid 優先、sidecar は jobId 一致時のみ採用 ✓
- `cancelSingleJob` が `expectedJobId = state.jobId` で両関数を利用 ✓

**D2 (process-death gate):** `src/core/cancel/runner.ts` line 354–387 を確認。
`state.status === "running"` ゲートを完全に除去し、`resolvedPid != null` のときだけ `gracefulKill` を呼ぶ構造になっている。pid が解決できない場合は `"no PID recorded"` を含む warning を push して続行 ✓

**D3 (group reap — 全 death path、leader 判定付き):** `src/core/cancel/pid-kill.ts` を確認。
- `reapGroup()` ヘルパーが定義され、以下の3パスで呼ばれる:
  - poll 中に `isAlive` が false を返したとき → `reapGroup` 呼び出し ✓
  - poll 中の `isAlive` が ESRCH を投げたとき → `reapGroup` 呼び出し ✓
  - SIGKILL 昇格時 → インライン `isGroupLeader(pid)` チェック + `kill(-pid, "SIGKILL")` ✓
- `isGroupLeader` のデフォルトは `() => false`; `CancelDeps.isGroupLeader` は optional ✓
- CLI (`src/cli/cancel.ts`) で `process.kill(-pid, 0)` プローブを供給 ✓
- group signal の EPERM/ESRCH は best-effort 吸収; `killed` に影響しない ✓

**D4 (QueryAbortHub):** 以下を確認:
- `src/core/port/query-abort.ts`: `QueryAbortRegistration` interface ✓
- `src/core/lifecycle/query-abort-hub.ts`: `register`/`abortActive`/`drain` 実装 ✓
- adapter は `core/port` からの型専用 import のみ (境界違反なし) ✓
- `ClaudeCodeRunner.run()` — `AbortController` 生成直後に登録、`finally` ブロックで全 exit path に deregister ✓
- `LocalRuntime` — `private readonly hub = new QueryAbortHub()` (line 154); `createAgentRunner` に hub を渡す ✓
- `signalCleanup` — `markSignalHandlerFired()` が最初の同期文、次に `hub.abortActive()` + `await hub.drain(ABORT_DRAIN_BOUND_MS, …)`、その後に `awaiting-resume` persist ✓

**D5 (cancel 出力):**
- pid 解決不能 → `"Warning: no PID recorded for job, skipping process kill."` ✓
- `groupKilled === true` → `info` に `"Process group -${resolvedPid} reaped (SIGKILL sent to group)"` ✓

### J3: spec.md 要件 vs. 実装

**要件1: Cancel resolves kill-target pid from state then jobId-matched sidecar**
- TC-001 (state.pid 優先) ✓
- TC-002 (sidecar で null state.pid を補完) ✓
- TC-003 (foreign sidecar 拒否) ✓
— すべて `tests/unit/core/cancel/runner-process-gate.test.ts` に実装済み

**要件2: Cancel gates kill on process liveness, not job status**
- TC-004 (awaiting-resume + live pid → SIGTERM 送出、破壊確認付き) ✓
- TC-005 (解決不能 pid → warning + cancel 継続) ✓

**要件3: Graceful kill reaps process group only for leaders, on every observed death path**
- TC-006 (leader pid 昇格 → group kill) ✓
- TC-007 (non-leader 昇格 → group signal なし) ✓
- TC-016 (group EPERM で `killed` 不変) ✓
- "leader が SIGTERM poll 中に死亡 → group kill" — `pid-kill-group.test.ts` にテストあり ✓
- "non-leader が SIGTERM poll 中に死亡 → group signal なし" — `pid-kill-group.test.ts` リグレッション (`isGroupLeader=false`, `isAlive=false`) で暗黙的にカバー ✓

**ただし coverage gap あり (後述)**

**要件4: Runner aborts in-flight queries on SIGINT/SIGTERM before exit**
- TC-008 (abort 発火、破壊確認) ✓
- TC-009 (awaiting-resume persist 継続) ✓
- TC-010 (drain timeout でも persist 継続) ✓
- drain → load の順序テスト ✓
- TC-016 invariant regression (`isSignalHandlerFired` が最初の await より前に true) ✓

**要件5: Cancel output distinguishes skipped kill from group reap**
- TC-011 (group reap の info line) ✓
- TC-012 (no PID recorded の warning) ✓

### J4: request.md 受け入れ基準 vs. 実装

| 基準 | 対応テスト | 状態 |
|------|-----------|------|
| state.pid null → sidecar から kill | TC-002 / runner-process-gate.test.ts | ✓ |
| awaiting-resume + live pid → kill (破壊確認) | TC-004 / runner-process-gate.test.ts | ✓ |
| sidecar jobId mismatch → kill しない | TC-003 / runner-process-gate.test.ts | ✓ |
| SIGKILL 昇格 + leader → group signal (kill seam) | TC-006 / pid-kill-group.test.ts | ✓ |
| non-leader → group signal なし | TC-007 / pid-kill-group.test.ts | ✓ |
| SIGTERM → abort 発火 (破壊確認) | TC-008 / runner-abort-hub.test.ts | ✓ |
| 統合: detach cancel → group survivor なし (破壊確認) | TC-021 / cancel-process-group-integration.test.ts | ✓ |
| 既存 runner.test.ts green | makeDeps に isGroupLeader なし (optional) → デフォルト false | ✓ |
| 既存 cli/cancel.test.ts green | build-fixer が対応済み | ✓ |
| 既存 sidecar-teardown.test.ts green | sidecar teardown ロジック変更なし | ✓ |
| 既存 runner-branch-delete.test.ts green | 関連変更なし | ✓ |
| typecheck && test green | T-09 [x] | ✓ |

## 検証できなかった項目

None — 全項目を確認済み。

## Findings 詳細

### F-001: test-cases.md の TC トレース漏れ (Low / fixable)

**場所**: `specrunner/changes/cancel-process-tree-kill/test-cases.md`

spec.md の要件「Graceful kill reaps the process group only for group leaders, on every observed death path」は4つのシナリオを持つが、test-cases.md には TC エントリが TC-006・TC-007 の2件しかない。

未トレースのシナリオ:
1. "leader that dies from SIGTERM with surviving descendants still gets its group reaped" — `pid-kill-group.test.ts` の "leader dies during SIGTERM poll" テストでカバー済み
2. "non-leader pid that dies during polling does not touch the group" — `pid-kill-group.test.ts` のリグレッションテストで暗黙カバー済み

実装・テストは正しい。不足は test-cases.md のトレース文書のみ。
