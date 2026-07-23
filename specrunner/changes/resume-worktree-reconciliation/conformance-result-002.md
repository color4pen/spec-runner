# Conformance Review: resume-worktree-reconciliation (iteration 002)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## J1: Spec conformance

### Requirement 1 — resume mechanically reconciles the worktree before starting the step

**Status: SATISFIED**

`src/core/resume/reconcile-worktree.ts` implements the three-class classifier (`isReconcilableArtifact`) and the orchestrator (`reconcileWorktreeArtifacts`). The classifier correctly implements all three predicates:
- Outside `changeFolderPath(slug)` → false (with exact directory boundary guard `folder + "/"`)
- In `protectedCanonPaths(slug)` → false
- In `pipelineManagedPaths(slug)` → false
- Otherwise → true (reconcilable pipeline-managed artifact)

The reconcile call is wired in `ResumeCommand.prepare()` (resume.ts lines 331–342) inside the `if (resolvedWorktreePath !== null && resolvedSlug !== null)` block, after the apply-canon gate. All three resume paths (default / `--from` / `--apply-canon`) reach this block. `--from` only changes `startStep`, not this guard.

Scenarios covered:
- **Scenario: interrupted-attempt residue quarantined, removed, next step completes** → TC-001 (e2e, real git repo) walks `findScopedCommitViolations` / `findWriteScopeViolations` and asserts `[]` violations after reconcile.
- **Scenario: reconcile is a no-op on clean worktree** → TC-002 (e2e) and TC-011 (unit).

### Requirement 2 — reconcile preserves the state journal and non-managed paths

**Status: SATISFIED**

`isReconcilableArtifact` returns `false` for all `pipelineManagedPaths(slug)` entries (`state.json`, `events.jsonl`, `usage.json`, `bite-evidence-result.md`, `pr-create-result.md`) and for any path outside `changeFolderPath(slug)` (e.g. `src/`).

Scenario: **state.json and src/ dirt survive reconcile while residue is removed** → TC-003 (e2e) creates three simultaneous dirty conditions: (a) untracked residue under change folder, (b) dirty `state.json`, (c) untracked `src/foo.ts`. After reconcile, only (a) is removed; (b) and (c) remain dirty with original content confirmed by `fs.readFile`.

### Requirement 3 — reconcile is fail-closed when evidence cannot be preserved

**Status: SATISFIED**

In `reconcileWorktreeArtifacts`, `fsMkdir(quarantineDir, ...)` (line 185) and `fsWriteFile(evidencePath, ...)` (line 216) are outside any try/catch — failures propagate as thrown errors. In `ResumeCommand.prepare()`, the wrapping catch maps any throw to `PrepareError(1, "Failed to reconcile worktree residue (fail-closed)")` without calling the step start.

Scenario: **quarantine failure halts resume with the residue intact** → TC-004 (e2e) pre-creates `.specrunner/local` as a regular file so `mkdir` under it fails. Asserts `reconcileWorktreeArtifacts` throws AND the residue file is still present in the worktree.

### Requirement 4 — reconcile does not weaken the protected-canon apply-canon gate

**Status: SATISFIED**

`isReconcilableArtifact` returns `false` for every path in `protectedCanonPaths(slug)`, so reconcile never quarantines or removes canon paths. Reconcile is placed after the apply-canon gate in `prepare()`: when the gate fail-closes (dirty canon, no `--apply-canon`), it throws `PrepareError` before reconcile is reached (resume.ts lines 319–324). The existing `apply-canon.ts`, `write-scope.ts`, and `apply-canon.test.ts` are unmodified.

Scenario: **dirty canon still fail-closes before reconcile runs** → TC-005 (e2e) confirms that a dirty `tasks.md` is not touched by `reconcileWorktreeArtifacts` and remains dirty afterward. The gate-level ordering is tested by TC-019 in resume-reconcile.test.ts.

---

## J2: Request acceptance criteria

| Criterion | Evidence |
|-----------|----------|
| Regression test: halt→residue→resume, write-scope violation closed | TC-001 (e2e): real git repo, untracked residue, `findScopedCommitViolations` + `findWriteScopeViolations` both return `[]` post-reconcile. |
| Quarantine failure → fail-closed, residue intact | TC-004 (e2e): `.specrunner/local` as regular file forces `mkdir` failure; `reconcileWorktreeArtifacts` throws; residue still present. |
| Idempotent no-op on clean worktree | TC-002 (e2e) + TC-011 (unit): clean worktree → `{ reconciled: [], quarantineDir: null }`, no quarantine files created. |
| Existing apply-canon tests green unchanged | T-08 marked complete; test suite reports 634 files / 9369 tests passing, 0 failures. `apply-canon.test.ts`, `resume-apply-canon.test.ts`, `operator-canon-apply-on-resume-e2e.test.ts` are unmodified (confirmed by diff stat: neither appears). |
| Recovery contract documented with classification table | `docs/operations.md` section `### halt → resume の回復契約` contains a three-row table with all three classes, `.specrunner/local/<slug>/` as quarantine destination, fail-closed rule, and best-effort detection note. |
| `typecheck && test` green | `bun run typecheck` exits 0 (zero errors). `bun run test` exits 0: 634 test files, 9369 passed, 1 skipped, 0 failed. |

All six acceptance criteria are satisfied.

---

## J3: Design fidelity

| Decision | Implementation | Status |
|----------|----------------|--------|
| D1: reconcile at resume entry (single recovery point) | `ResumeCommand.prepare()`, resume.ts line 331 | ✓ |
| D2: new module `reconcile-worktree.ts` with pure classifier + orchestrator | `src/core/resume/reconcile-worktree.ts` | ✓ |
| D3: state journal preserved (pipelineManagedPaths as keep set) | `isReconcilableArtifact` returns false for all `pipelineManagedPaths(slug)` entries | ✓ |
| D4: quarantine-all-then-remove-all; quarantine failure is fail-closed | `fsMkdir` + loop of `fsWriteFile` before any removal block; no try/catch on these lines; TC-004 confirms throw behavior | ✓ |
| D5: removal split by tracked state (untracked→clean, staged-new→rm--cached+clean, tracked→checkout HEAD) | Lines 223–261 in reconcile-worktree.ts; TC-013 (e2e) tests untracked and tracked-modified | ✓ |
| D6: reconcile after apply-canon gate, inside same worktree guard | resume.ts lines 327–342, placed after the dirtyCanonPaths handling block | ✓ |
| D7: detection best-effort no-op (spawn failure or non-zero exit → no-op, not throw) | Lines 109–125 in reconcile-worktree.ts; TC-012 (unit) tests both spawn rejection and non-zero exit | ✓ |

**Undeclared extra behavior** (non-blocking observation): Lines 176–183 in `reconcile-worktree.ts` attempt to create a self-ignoring `.specrunner/local/.gitignore` (with `{ flag: "wx" }`) before the real quarantine mkdir. This is not specified in design.md or tasks.md. The behavior is:
- Wrapped in a try/catch with all errors silently swallowed (labeled "best-effort" in comment)
- Operationally justified: prevents quarantine files from appearing in `git status` in repos where `specrunner init` has not been run
- Not visible to any test or acceptance criterion
- Does not affect the fail-closed behavior of the real quarantine gate (line 185, outside any try/catch)
- TC-004 confirms the fail-closed behavior is intact even when this best-effort block fails first

---

## J4: Scope adherence

**Files added** (implementation):
- `src/core/resume/reconcile-worktree.ts` — new module as specified by T-01
- `src/core/command/__tests__/resume-reconcile.test.ts` — T-06 wiring tests
- `src/core/resume/__tests__/reconcile-worktree.test.ts` — T-04 unit tests
- `tests/resume-worktree-reconciliation-e2e.test.ts` — T-05 integration tests
- `tests/unit/docs/operations-recovery-contract.test.ts` — T-07 drift guard

**Files modified** (implementation):
- `src/core/command/resume.ts` — 18 lines added (reconcile import + call block); apply-canon gate block unchanged
- `docs/operations.md` — 14 lines added (`### halt → resume の回復契約` subsection)

**Files NOT modified** (confirmed by diff stat):
- `src/core/resume/apply-canon.ts` — unchanged ✓
- `src/core/step/write-scope.ts` — unchanged ✓
- `src/core/pipeline/round-git-scope.ts` — unchanged ✓
- `src/core/step/commit-push.ts` — unchanged ✓

Scope-out items from request (non-managed path dirt, write-set check logic, halt-side cleanup, step output-contract halts) are not addressed by any new code. `isReconcilableArtifact` explicitly returns `false` for paths outside the change folder, leaving their behavior unchanged as contracted.

---

## 検証できなかった項目

None. All spec requirements, acceptance criteria, design decisions, and scope boundaries were verifiable from the implementation and test suite.
