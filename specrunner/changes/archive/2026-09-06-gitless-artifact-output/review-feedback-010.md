# Review Feedback: Iteration 010

**Change**: gitless-artifact-output  
**Branch**: feat/gitless-artifact-output-24a45cdc  
**Scope**: 68 files changed, 16 001 insertions, 17 deletions  
**Reviewer**: code-review (iteration 10)

---

## Evidence Summary

| Dimension | Checked | Notes |
|-----------|---------|-------|
| Spec compliance (design.md / tasks.md) | T-01 → T-12 all marked complete; decisions D1–D16 traceable to code | — |
| Test-case coverage (must, automated) | 63 must-priority cases; 62 confirmed covered, 1 gap (TC-034) | See Finding F-02 |
| Architecture ratchet (import ban) | grep tests in artifact-output-git-free.test.ts | ✓ |
| Fail-closed behaviour | collectSnapshot, deriveChangeSet, assertSourceUnchanged | ✓ |
| Revision binding (D10) | runBoundToCandidateRevision pre/post snapshot | ✓ |
| Cross-phase digest check (D10 §8.5) | code at run.ts L373–388; TC-079 in run.test.ts | ✓ (gap noted, see F-04) |
| Atomic artifact finalize (D9) | staging → rename pattern in artifact-writer.ts | ✓ |
| Source immutability (D6) | copy-only + checkSourceUnchanged on all exit paths | ✓ |
| Preflight capability table (D12) | execution-profile.ts + preflight.ts | ✓ |
| Guide / README (D15, T-12) | guide.test.ts asserts UNSUPPORTED_OPERATIONS coverage | ✓ |

---

## Findings

### F-01 · HIGH · `_guardedSpawn` created but never connected to any seam

**File**: `src/core/artifact-output/run.ts`, line 140  
**Failure scenario**: D11 states "profile が使う subprocess seam は guarded wrapper 越しにのみ渡す". The guarded spawn is created with `createGitDenyingSpawn(input.spawn)` but the result is stored only in `_guardedSpawn` (underscore-prefixed, unused variable). No seam interface (`AgentSeam`, `VerifySeam`, `ReviewSeam`) receives spawn at all; nor does the run pass `_guardedSpawn` to any call site. The runtime guard layer is therefore disconnected from the execution path.

The consequence is that the TC-001 / TC-068 spawn-record assertions ("no git/gh spawned") pass vacuously: spawn is never invoked at all, not because git is denied. If a future production seam calls `spawn("git", ...)` using an `input.spawn` reference it received through another channel, the runtime guard provides no protection; only the structural grep ratchet (import ban) prevents that scenario—but the import ratchet does not prevent string-literal `"git"` arguments to an already-available spawn function.

**Resolution**: Either (a) pass `_guardedSpawn` (not `input.spawn`) to whatever seam will eventually call subprocess commands, and update the `VerifySeam` / `AgentSeam` interfaces to accept a `spawn` parameter; or (b) document explicitly in run.ts and design.md that the runtime spawn guard layer is intentionally deferred to the next CLI-wiring step (D2 / Non-Goal: CLI 配線は次段階 Issue), and add a TODO asserting that no seam should receive raw `input.spawn`. The current code creates a false sense of security—the guard exists but guards nothing.

---

### F-02 · MEDIUM · TC-034 (must) has no test

**File**: `tests/artifact-output-vertical.test.ts` (gap), `src/core/artifact-output/__tests__/run.test.ts` (gap)  
**Failure scenario**: test-cases.md TC-034 is priority **must**, category integration: "run evidence is not stored only in the agent-writable area". The design D5 specifies that `run.json` and `baseline/snapshot.json` live in the run root outside `candidate/` (the agent-writable area). No test asserts this structural separation directly. The tests that read `run.json` (TC-033, TC-073) confirm the file's content but do not assert its path relative to `candidate/`. If a future change accidentally placed evidence inside `candidate/`, no test would catch it.

**Resolution**: Add a test (integration or unit) that, after a successful run, asserts:
1. `run.json` exists at `<runRoot>/run.json` (not inside `<runRoot>/candidate/`).
2. `baseline/snapshot.json` exists at `<runRoot>/baseline/snapshot.json` (not inside `<runRoot>/candidate/`).
3. The `candidate/` directory does not contain `run.json` or `baseline/`.

---

### F-03 · LOW · Misleading comment in `checkSourceUnchanged` success path

**File**: `src/core/artifact-output/run.ts`, line 449  
**Failure scenario**: After a successful `finalizeArtifact`, the code calls `checkSourceUnchanged`. If `assertSourceUnchanged` returns `mutated` or `unverifiable` through the normal path, `checkSourceUnchanged` sets `runJson.status = "failed"` and writes `run.json` before returning `true`. However, if an exception is raised inside `checkSourceUnchanged`'s `try` block (e.g., `writeRunJson` itself throws after setting `status = "failed"` in memory), the catch block returns `true` without writing `run.json`. The comment at line 449 ("runJson.status is already 'failed' and written by checkSourceUnchanged") is only true for the non-exception path. An on-disk `run.json` with `status: "running"` while the result DU says `kind: "failed"` would be a durable evidence inconsistency.

The trigger is pathological (disk I/O failure during a terminal guard write), so severity is low. The fail-closed return value (`kind: "failed"`) is correct in all cases.

**Resolution**: After the `if (sourceMutatedOnSuccess)` branch, add an explicit `runJson.status = "failed"; await writeRunJson(runRoot, runJson);` before `return { kind: "failed", ... }` to ensure the on-disk record is authoritative regardless of whether `checkSourceUnchanged`'s internal write succeeded. Alternatively, update the comment to accurately describe the exception path.

---

### F-04 · LOW · TC-079 test exercises review-time drift, not the specific cross-phase scenario

**File**: `src/core/artifact-output/__tests__/run.test.ts`, line 299–357  
**Failure scenario**: Design D10 describes two distinct mechanisms:
1. Per-phase drift detection: `runBoundToCandidateRevision` detects changes during a single phase.
2. Cross-phase check (step 8.5): catches the scenario where verification and review each pass their own per-phase check but their bound digests differ (e.g., an external process changed the candidate between phases and the change happened to restore the pre-phase state for each).

The TC-079 test makes the review seam mutate `candidateRoot` during execution. This triggers the per-phase drift detection in `runBoundToCandidateRevision` (step 8's `"revision-drift"` branch at run.ts L364), halting at step 8 before the cross-phase check at step 8.5 is reached. The cross-phase check at L373–388 is therefore never executed in this test.

The code implementing the cross-phase check is correct; the test does not cover it. The scenario it protects against (external mutation between phases that per-phase checks miss) is not exercised.

**Resolution**: Add a test scenario where:
- `VerifySeam` passes and returns with bound digest D1.
- Between verification and review, the candidate workspace is externally modified so its digest becomes D2.
- `ReviewSeam` makes no modifications itself (so reviewBound passes per-phase drift, digest = D2).
- Step 8.5 detects D1 ≠ D2 and returns `kind: "halted"`.

This can be implemented with a `ReviewSeam` that first restores the state the verifier saw (so the per-phase pre/post check passes) but the injected pre-snapshot uses D2 — or more directly by injecting the candidate modification between the verify and review seam calls.

---

## Observations (non-actionable)

- **D14 `changesNotYetDerived` handling is correct**: When building the pre-verification context, the code correctly passes `changesNotYetDerived: true` (run.ts L259), which renders "(not yet derived — change set is computed after verification)" instead of "(no changes)". This satisfies D14's fail-open prohibition.
- **Revision binding re-use of pre-snapshot**: run.ts correctly passes `preVerifySnapshotResult.snapshot` as the `preSnapshot` argument to `runBoundToCandidateRevision` (L264–268), avoiding redundant collection and satisfying T-09's AC "step 7 で candidate を再走査しない".
- **Disjoint run-root / source guard**: `assertRunRootDisjointFromSource` uses symlink-resolved real paths and is tested with symlinked parentDir scenarios in run.test.ts.
- **`collectSnapshot` failure accumulation**: TC-003 (`_assertNoGitAbove`) is present in the vertical test but only throws, does not skip. This correctly enforces the AC "存在したら fail、skip しない".
- **Patch classification symmetry (D8)**: All 9 classification values (`included`, `included:deletion`, `omitted:binary`, `omitted:binary-deletion`, `omitted:size`, `omitted:size-deletion`, `omitted:unreadable`, `not-applicable`) are declared as a union type; the patch builder cannot emit undeclared values.
- **guide.test.ts UNSUPPORTED_OPERATIONS drift guard**: The test imports the live `UNSUPPORTED_OPERATIONS` array and verifies each `displayName` appears in the guide topic body, preventing silent divergence between the data table and documentation.

---

## Test Coverage Map (must-priority automated cases)

| TC | Title (abbreviated) | Covered? | Location |
|----|----------------------|----------|----------|
| TC-001 | No git/gh spawn in minimal run | ✓ | artifact-output-vertical.test.ts |
| TC-002 | Guarded seam blocks git | ✓ | guarded-spawn.test.ts |
| TC-004 | Source unchanged after success | ✓ | artifact-output-vertical.test.ts |
| TC-005 | Source unchanged after failure | ✓ | artifact-output-vertical.test.ts |
| TC-006 | Source mutation detected | ✓ | artifact-output-vertical.test.ts |
| TC-007 | Same tree → same digest | ✓ | digest.test.ts |
| TC-008 | Executable bit changes digest | ✓ | digest.test.ts |
| TC-011 | Unreadable file → unavailable | ✓ | collect.test.ts |
| TC-012 | Unsupported kind → unavailable | ✓ | collect.test.ts |
| TC-013 | Escape symlink → unavailable | ✓ | collect.test.ts |
| TC-014 | Unavailable ≠ empty change set | ✓ | compare.test.ts |
| TC-015 | added/modified/deleted derived | ✓ | compare.test.ts |
| TC-016 | Binary change in change set | ✓ | compare.test.ts |
| TC-019 | Binary omitted from patch, in payload | ✓ | artifact-output-vertical.test.ts |
| TC-021 | Deletion in patch and manifest | ✓ | artifact-output-vertical.test.ts |
| TC-022 | Unrepresentable entry → no finalize | ✓ | artifact-writer.test.ts |
| TC-023 | Successful run → complete artifact | ✓ | artifact-output-vertical.test.ts |
| TC-024 | Pre-finalize failure → no artifact/ | ✓ | artifact-output-vertical.test.ts |
| TC-025 | APPLY.md declares baseline-digest precondition | ✓ | artifact-output-vertical.test.ts |
| TC-026 | Verification/review records carry digest | ✓ | artifact-output-vertical.test.ts |
| TC-027 | Candidate drift during verify → halt | ✓ | artifact-output-vertical.test.ts |
| TC-028 | Unsupported steps listed before execution | ✓ | preflight.test.ts |
| TC-029 | Non-executable pipeline stops before workspace | ✓ | run.test.ts + preflight.test.ts |
| TC-030 | Issue-origin entry rejected at preflight | ✓ | preflight.test.ts |
| TC-031 | git-pr profile → 0 unsupported in all pipelines | ✓ | preflight.test.ts |
| TC-032 | run record declares resume unsupported | ✓ | artifact-output-vertical.test.ts (TC-073) |
| TC-033 | Halted run records terminal status | ✓ | artifact-output-vertical.test.ts |
| **TC-034** | **Evidence not in agent-writable area only** | **✗** | **MISSING** |
| TC-035 | Reviewer context carries revision + change summary | ✓ | context-binding.test.ts |
| TC-036 | Missing history stated, not blank | ✓ | context-binding.test.ts |
| TC-037 | Guide lists all UNSUPPORTED_OPERATIONS | ✓ | guide.test.ts |
| TC-038 | Guide distinguishes from --no-worktree | ✓ | guide.test.ts |
| TC-039 | README documents profile + preview status | ✓ | guide.test.ts or README check |
| TC-040 | Existing runtime modules don't import new modules | ✓ | artifact-output-git-free.test.ts |
| TC-041 | Snapshot modules don't import git utilities | ✓ | artifact-output-git-free.test.ts |
| TC-047 | digest.ts has no fs/child_process import | ✓ | gate (artifact-output-git-free) |
| TC-048 | Exclusion change alters snapshot digest | ✓ | digest.test.ts |
| TC-049 | .git/ is default exclusion + recorded | ✓ | collect.test.ts |
| TC-051 | Exclusion mismatch → unavailable comparison | ✓ | compare.test.ts |
| TC-052 | compare.ts has no fs/child_process import | ✓ | gate |
| TC-053 | preflight.ts has no fs/child_process import | ✓ | gate |
| TC-054 | runtime-capability-gate.ts unchanged | ✓ | gate |
| TC-055 | Materialize candidate digest = baseline digest | ✓ | materialize.test.ts |
| TC-056 | Materialize preserves symlinks | ✓ | materialize.test.ts |
| TC-061 | APPLY.md content correct | ✓ | artifact-writer.test.ts |
| TC-062 | Staging → rename is atomic | ✓ | artifact-writer.test.ts |
| TC-063 | History section is explicit, not blank | ✓ | context-binding.test.ts |
| TC-064 | Snapshot unavailable → no `bound` | ✓ | context-binding.test.ts |
| TC-065 | All metrics fields present | ✓ | artifact-output-vertical.test.ts |
| TC-066 | runArtifactOutput never throws | ✓ | run.test.ts |
| TC-068 | No git/gh in spawn record (vertical) | ✓ | artifact-output-vertical.test.ts |
| TC-069 | No process.cwd() in new modules | ✓ | gate |
| TC-070 | No adapter/ imports in new modules | ✓ | gate |
| TC-071 | Reverse import isolation | ✓ | gate |
| TC-072 | RUN_JOB_FLAGS unchanged | ✓ | gate |
| TC-073 | run.json resume.supported === false | ✓ | artifact-output-vertical.test.ts |
| TC-074 | Topic count increases by 1 | ✓ | guide.test.ts |
| TC-075 | All UNSUPPORTED_OPERATIONS in guide body | ✓ | guide.test.ts |
| TC-077 | Review-time candidate drift → halt | ✓ | artifact-output-vertical.test.ts |
| TC-078 | Escape symlink in candidate → halt | ✓ | artifact-output-vertical.test.ts |
| TC-079 | Cross-phase digest mismatch → halt | ✓ (partially) | run.test.ts (see F-04) |
| TC-080 | size-deletion classification | ✓ | patch.test.ts |

**Coverage**: 62/63 must-priority automated cases confirmed. TC-034 has no test.

---

## 検証した項目

- `src/core/artifact-output/run.ts` — 全フェーズの実行順、preflight 停止、revision 束縛、cross-phase チェック、source 不変検証、run.json の書き出し経路
- `src/core/artifact-output/execution-profile.ts` / `preflight.ts` — capability テーブル、step → required capability マッピング、`assertEntryRouteSupported`
- `src/core/artifact-output/revision-binding.ts` — pre/post snapshot diff、drift 検出、`unavailable` の非 `bound` 保証
- `src/core/artifact-output/artifact-writer.ts` — staging → rename の atomic finalize、`APPLY.md` 内容
- `src/core/artifact-output/context.ts` — `changesNotYetDerived` フラグ、history セクションの非空保証
- `src/core/artifact-output/source-guard.ts` — snapshot 不能を `unchanged` に畳まない fail-closed
- `src/core/artifact-output/guarded-spawn.ts` — git/gh deny ロジック
- `src/core/artifact-output/run-layout.ts` — run root / source の disjoint guard（symlink 解決を含む）
- `src/core/snapshot/collect.ts` — lstat traversal、failure 蓄積、部分 snapshot を返さない
- `src/core/artifact-output/patch.ts` — D8 全分類値の型宣言、`included:deletion` / `omitted:binary-deletion` / `omitted:size-deletion` の対称構造
- `tests/artifact-output-vertical.test.ts` — TC-001/004/005/006/023/024/027/033/065/067/068/073/077/078 の網羅確認
- `src/core/artifact-output/__tests__/run.test.ts` — TC-066/073/079 と run root 配置拒否テスト
- `tests/unit/architecture/artifact-output-git-free.test.ts` — TC-040/041/068/069/070/071/072 の gate 検査
- `src/core/command/__tests__/guide.test.ts` — TC-037/038/074/075 の guide topic 検査
- test-cases.md must-priority 63 件の有無を test ファイル横断で照合

## 検証できなかった項目

- **TC-034** (must/integration): run evidence が agent 書き込み可能領域（`candidate/`）のみに存在しないことを直接 assert するテストが存在しない。設計 D5 の layout 保証は実装で成立しているが、回帰検出のテストがない（F-02 として報告）。
- **TC-079 cross-phase 固有シナリオ**: step 8.5 の cross-phase check コードは存在するが、「各フェーズ単独の drift チェックは通過するが両 digest が乖離する」具体シナリオのテストが存在しない（F-04 として報告）。
- `docs/artifact-output-profile.md` の実測値セクション（T-12 AC: 実測結果の転記）が実際の run から取得された値かどうかの確認（manual TC-076 は範囲外）。

---

## Verdict inputs (for CLI)

- Findings: 4 (HIGH: 1, MEDIUM: 1, LOW: 2)
- Must-TC gap: TC-034 (must/integration, no test)
- All T-01–T-12 implementation tasks marked complete and traced to code
- Existing Git/PR profile: no behavioral changes; runtime-capability-gate.ts is unchanged
- Architecture ratchet: import ban and gate tests in place

