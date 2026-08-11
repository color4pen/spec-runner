# Conformance Result — cancel-process-tree-kill (iteration 2)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Resume Context

Iteration 1 でエスカレーションした finding:

> **F-001**: `test-cases.md` に spec.md のシナリオ2件 (leader poll-death, non-leader poll-death) のトレース TC エントリが欠けていた。

Operator が `--apply-canon` で正典修正コミットを適用し、`TC-024`・`TC-025` が test-cases.md に追加されたことを確認済み。

---

## 検証した項目

### J1: tasks.md — 全チェックボックスの完了確認

T-01 〜 T-09 の全サブタスクが `[x]` であることを確認。未完了項目なし。

---

### J2: 設計判断 (D1–D5) と実装の対応

**D1 (共有 pid リゾルバ)** — `src/core/liveness/resolve-pid.ts`

- `readLivenessSidecar(absPath)`: async fs read、absent/unparseable で null ✓
- `resolveJobPid({ statePid, sidecar, expectedJobId })`: pure — statePid 優先、sidecar は `sidecar.jobId === expectedJobId` 時のみ採用、それ以外は `{ pid: null, source: null }` ✓
- `cancelSingleJob` が `expectedJobId = state.jobId` で両関数を利用 ✓

**D2 (process-death gate)** — `src/core/cancel/runner.ts` line 353–387

`state.status === "running"` ゲートを完全に除去。`resolvedPid != null` のときだけ `gracefulKill` を呼ぶ。pid 解決不能時は `"no PID recorded"` を含む warning を push して続行 ✓

**D3 (group reap — 全 death path、leader 判定付き)** — `src/core/cancel/pid-kill.ts`

`reapGroup()` ヘルパーが3パスで呼ばれる:
1. poll 中 `isAlive` が false を返したとき → `reapGroup` 呼び出し ✓
2. poll 中 `isAlive` が ESRCH を投げたとき → `reapGroup` 呼び出し ✓
3. SIGKILL 昇格時 → インライン `isGroupLeader(pid)` + `kill(-pid, "SIGKILL")` ✓

`isGroupLeader` デフォルト `() => false`; `CancelDeps.isGroupLeader` は optional ✓
CLI (`src/cli/cancel.ts`) で `process.kill(-pid, 0)` プローブを供給 ✓
group signal の EPERM/ESRCH は best-effort 吸収; `killed` に影響しない ✓

**D4 (QueryAbortHub)** — `src/core/port/query-abort.ts` / `src/core/lifecycle/query-abort-hub.ts`

- `QueryAbortRegistration` interface (core/port 境界) ✓
- `QueryAbortHub.register`/`abortActive`/`drain` 実装済み ✓
- adapter は `core/port` からの型専用 import のみ (境界違反なし) ✓
- `ClaudeCodeRunner.run()` — `AbortController` 生成直後に登録、`finally` で全 exit path に deregister ✓
- `LocalRuntime` — `private readonly hub = new QueryAbortHub()` (line 154); `createClaudeCodeRunner` に hub を渡す ✓
- `signalCleanup`: `markSignalHandlerFired()` が最初の同期文 → `hub.abortActive()` → `await hub.drain(2000ms, …)` → awaiting-resume persist → `releasePowerAssertion()` → `process.exit(130)` ✓

**D5 (cancel 出力)** — `src/core/cancel/runner.ts`

- pid 解決不能 → `"Warning: no PID recorded for job, skipping process kill."` ✓
- `groupKilled === true` → `info` に `"Process group -${resolvedPid} reaped (SIGKILL sent to group)"` ✓

---

### J3: spec.md 要件 vs. 実装

**要件1: Cancel resolves kill-target pid from state then jobId-matched sidecar**

| シナリオ | テスト | 状態 |
|---------|-------|------|
| state.pid drives the kill | TC-001 / runner-process-gate.test.ts | ✓ |
| sidecar fills in a null state.pid | TC-002 / runner-process-gate.test.ts | ✓ |
| foreign sidecar is not adopted | TC-003 / runner-process-gate.test.ts | ✓ |

**要件2: Cancel gates kill on process liveness, not job status**

| シナリオ | テスト | 状態 |
|---------|-------|------|
| awaiting-resume + live pid → kill (破壊確認) | TC-004 / runner-process-gate.test.ts | ✓ |
| no resolvable pid warns and continues | TC-005 / runner-process-gate.test.ts | ✓ |

**要件3: Graceful kill reaps process group only for leaders, on every observed death path**

| シナリオ | テスト | 状態 |
|---------|-------|------|
| leader pid escalation reaps group | TC-006 / pid-kill-group.test.ts | ✓ |
| leader dies from SIGTERM with surviving descendants → group reaped | TC-024 / pid-kill.test.ts (isAlive=false + ESRCH 両路) + pid-kill-group.test.ts | ✓ |
| non-leader pid escalation no group signal | TC-007 / pid-kill-group.test.ts | ✓ |
| non-leader poll-death no group signal | TC-025 / pid-kill.test.ts (line 181) | ✓ |
| group EPERM/ESRCH does not flip killed | TC-016 / pid-kill-group.test.ts | ✓ |

**要件4: Runner aborts in-flight queries on SIGINT/SIGTERM before exit**

| シナリオ | テスト | 状態 |
|---------|-------|------|
| SIGTERM aborts registered controller (破壊確認) | TC-008 / runner-abort-hub.test.ts | ✓ |
| awaiting-resume persisted after abort | TC-009 / runner-abort-hub.test.ts | ✓ |
| drain timeout doesn't block persist | TC-010 / runner-abort-hub.test.ts | ✓ |

**要件5: Cancel output distinguishes skipped kill from group reap**

| シナリオ | テスト | 状態 |
|---------|-------|------|
| group reap is reported | TC-011 / tests/unit/cli/cancel.test.ts | ✓ |
| skipped kill is reported | TC-012 / runner-process-gate.test.ts (TC-005) | ✓ |

---

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
| 既存 runner.test.ts green | isGroupLeader optional → default false | ✓ |
| 既存 cli/cancel.test.ts green | build-fixer 対応済み | ✓ |
| 既存 sidecar-teardown.test.ts green | sidecar teardown ロジック変更なし | ✓ |
| 既存 runner-branch-delete.test.ts green | 関連変更なし | ✓ |
| typecheck && test green | T-09 [x] / verification-result.md | ✓ |

---

## Iteration 1 Finding の解消確認

**F-001** (test-cases.md missing TC-024/TC-025): Operator が `--apply-canon` で正典修正コミットを適用。

- `TC-024` (leader poll-death reaps group) を test-cases.md に追加 ✓
- `TC-025` (non-leader poll-death no group signal) を test-cases.md に追加 ✓

対応する実装テストは変更前から存在:
- `tests/unit/core/cancel/pid-kill.test.ts` line 144 (ESRCH + leader) / line 162 (isAlive=false + leader) / line 181 (non-leader poll-death)
- `tests/unit/core/cancel/pid-kill-group.test.ts` line 134 (leader poll-death)

---

## 検証できなかった項目

None — 全項目を確認済み。

## Findings 詳細

None — 全 findings が解消済み。
