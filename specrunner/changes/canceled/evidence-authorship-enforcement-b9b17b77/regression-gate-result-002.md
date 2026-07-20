# Regression Gate Result — Iteration 002

- **verdict**: approved

## Summary

All 10 findings from the iteration-002 ledger are confirmed fixed. Full test suite passes (7454 tests, 547 files, exit 0).

## Finding Verification

### [CRITICAL] per-node 検証・journal commit の配線がない（T1〜T5 が production で不達）
- **File**: src/core/step/executor.ts
- **Status**: fixed
- **Evidence**: Lines 480–498 — `!roundOwnsGitEffects && deps.runtimeStrategy` guard with `verifyNodeJournalAuthorship` / `restoreJournalToAnchor` / `makeJournalTamperHalt` / `commitJournalArtifacts` fully wired.

### [CRITICAL] resume command に verifyResumeJournalAuthenticity の配線がない（T4 が production で不達）
- **File**: src/core/command/resume.ts
- **Status**: fixed
- **Evidence**: Lines 133–191 — `verifyResumeJournalAuthenticity` called before stale-running recovery write; `restoreResumeJournal` called on tamper; fail-closed `unavailable` path throws `PrepareError(1)`.

### [CRITICAL] round journal sweep が未実装（D1 round 終端 sweep 未達）
- **File**: src/core/pipeline/parallel-review-round.ts
- **Status**: fixed
- **Evidence**: Lines 336–349 — after `orchestrator.commitRound(...)`, calls `deps.runtimeStrategy.commitJournalArtifacts(cwd, state.branch, deps.slug, journalInfra)`.

### [CRITICAL] JobStateStore が anchorHolder を受け取らず JournalAnchorHolder が pipeline write に追従しない（T-03 未実施）
- **File**: src/store/job-state-store.ts
- **Status**: fixed
- **Evidence**: Lines 140–147 — constructor opts includes `anchorHolder?: JournalAnchorHolder`; passed to `new JobJournal(this._location, opts?.anchorHolder)`.

### [CRITICAL] createRuntime が JournalAnchorHolder を生成・注入せず production で全 seam が無効化
- **File**: src/core/runtime/factory.ts
- **Status**: fixed
- **Evidence**: Lines 39–40 — `const journalAnchor = new JournalAnchorHolder(); return new LocalRuntime({ ..., journalAnchor })`.

### [HIGH] TC-022〜TC-025 は executor wiring を通らず F-01 の gap を検出できない
- **File**: src/core/step/__tests__/per-node-authorship-verification.test.ts
- **Status**: fixed
- **Evidence**: Integration test (TC-021-exec equivalent) exercises full `executor.execute()` path with a tamper-returning `runtimeStrategy`; asserts `verifyNodeJournalAuthorship` and `restoreJournalToAnchor` are called through the executor and that `commitJournalArtifacts` is NOT called on halt.

### [HIGH] TC-022-exec: `expect.any(String) || null` evaluates to `expect.any(String)` — test fails
- **File**: src/core/step/__tests__/per-node-authorship-verification.test.ts
- **Status**: fixed
- **Evidence**: The assertion now uses `headBeforeStep: null` (literal null) — the JS expression `expect.any(String) || null` no longer appears. Full test suite passes (exit 0).

### [MEDIUM] committed-tree 歯が `diffPathsBetweenCommits` unavailable 時に fail-open になる
- **File**: src/core/runtime/local.ts
- **Status**: fixed
- **Evidence**: Lines 884–891 — `diffResult.kind === "unavailable"` returns `{ kind: "tamper", detail: "committed-tree diff unavailable ... — fail-closed halt to prevent bypass" }` instead of falling through to on-disk check alone.

### [MEDIUM] restoreResumeJournal derives wrong git show path for worktree case
- **File**: src/core/resume/verify-journal-authenticity.ts
- **Status**: fixed
- **Evidence**: Lines 139–151 — `const changeDir = changeFolderPath(slug)` constructs the git-tracked path from slug rather than stripping cwd. Worktree path confusion eliminated. `slug` parameter wired through `RuntimeStrategy.restoreResumeJournal` port (line 857) and caller in resume.ts (line 172).

### [MEDIUM] restoreResumeJournal: worktreeケースで git show パスを誤算（iter 003 F-1 未修正）
- **File**: src/core/resume/verify-journal-authenticity.ts
- **Status**: fixed
- **Evidence**: Same fix as above finding — same code location. `changeFolderPath(slug)` used consistently. Callers (`local.ts`, `managed.ts`, `resume.ts`) updated.

## Test Results

```
Test Files  547 passed (547)
      Tests  7454 passed (7454)
   Duration  23.21s
```
