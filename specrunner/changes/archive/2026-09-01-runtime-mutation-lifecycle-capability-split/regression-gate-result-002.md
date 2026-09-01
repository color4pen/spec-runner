# Regression Gate Result — Iteration 2

**Branch**: refactor/runtime-mutation-lifecycle-capability-split-71d6a83e  
**Date**: 2026-08-30

## Evidence Summary

| # | Severity | Title | Status |
|---|----------|-------|--------|
| 1 | MEDIUM | spec.md 「全メソッド required」要件と TC-004 snapshotMainCheckoutGuard optional 例外の矛盾 | ✅ FIXED |
| 2 | LOW | T-09 verifyFindingRefs に二重 ?. | ✅ FIXED |
| 3 | LOW | T-06 derive helper の定義ファイルを明示せず | ✅ FIXED |
| 4 | HIGH | buildDeps return type still `unknown` in RuntimeStrategy port | ✅ FIXED |
| 5 | HIGH | `as PipelineDeps` cast still present after buildDeps call | ✅ FIXED |
| 6 | MEDIUM | RoundGitEffectsCapability three optional methods violating D6 | ✅ FIXED |
| 7 | HIGH | RuntimeStrategy.buildDeps port returns `unknown` (dup of 4) | ✅ FIXED |
| 8 | HIGH | `as PipelineDeps` cast still at runner.ts:222 (dup of 5) | ✅ FIXED |
| 9 | HIGH | `_latestBuiltDeps` side-channel not removed; CommitPushInfra not extended | ✅ FIXED |
| 10 | MEDIUM | RoundGitEffectsCapability optional methods (dup of 6) | ✅ FIXED |
| 11 | LOW | Stale `runtimeStrategy: undefined` in PipelineDeps test fixtures | ✅ FIXED |
| 12 | HIGH | `as PipelineDeps` cast — TC-021 non-compliant (dup of 5) | ✅ FIXED |
| 13 | HIGH | RuntimeStrategy.buildDeps returns unknown — TC-022 (dup of 4) | ✅ FIXED |
| 14 | MEDIUM | TC-T15-05 does not prove compile-time invariant | ✅ FIXED |
| 15 | LOW | Stale runtimeStrategy: undefined entries (dup of 11) | ✅ FIXED |
| 16 | MEDIUM | Terminal publication breaks the documented cwd fallback | ❌ STILL PRESENT |

---

## Per-Finding Verification

### [1] spec.md exception clause
- **File checked**: `specrunner/changes/runtime-mutation-lifecycle-capability-split/spec.md:108–110`
- **Result**: FIXED. Line 110 now contains: "**Exception**: `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard` SHALL be the sole optional method (`?` modifier is permitted)." The contradiction is resolved.

### [2] T-09 double ?.
- **File checked**: `specrunner/changes/runtime-mutation-lifecycle-capability-split/tasks.md:204`
- **Result**: FIXED. The task now reads `deps.stepIo?.verifyFindingRefs(...) ?? []` (single `?.`) with an explicit note: "Note: only a single `?.` is needed because `verifyFindingRefs` is a required method on `StepIoValidationCapability` (no second `?.` on the method itself)."

### [3] T-06 helper definition file
- **File checked**: `specrunner/changes/runtime-mutation-lifecycle-capability-split/tasks.md:139`
- **Result**: FIXED. Line 139 now reads: "Per D5, helpers MUST be defined alongside the capability interface in the same consumer-domain file — NOT in `local.ts`."

### [4] / [7] / [13] buildDeps port return type
- **File checked**: `src/core/port/runtime-strategy.ts:391–396`
- **Result**: FIXED. buildDeps now returns `: PipelineDeps` (line 396), with JSDoc comment at lines 385–390 explaining the type-only import avoids runtime module cycle.

### [5] / [8] / [12] `as PipelineDeps` cast in runner.ts
- **File checked**: `src/core/command/runner.ts:218–222`
- **Result**: FIXED. Line 218 declares `let deps: PipelineDeps;` and line 222 reads `deps = this.runtime.buildDeps(config, request, slug, workspace);` — no cast.

### [6] / [10] RoundGitEffectsCapability optional methods
- **File checked**: `src/core/pipeline/pipeline-capability.ts:85–134`
- **Result**: FIXED. `listWorktreeChanges` (line 94), `commitRoundArtifacts` (line 110), and `digestArtifacts` (line 127) are all required (no `?` modifier). Each has a comment explicitly referencing D6.

### [9] `_latestBuiltDeps` and CommitPushInfra.pushCapability
- **File checked**: `src/core/runtime/local.ts:155–160`, `src/core/step/commit-push.ts:66–95`
- **Result**: FIXED. `_latestBuiltDeps` no longer exists as an instance field (only appears in a comment at line 155 as historical context). `CommitPushInfra` now declares `pushCapability?: PushCapability | null` at line 95 with appropriate documentation.

### [11] / [15] Stale `runtimeStrategy: undefined` in test fixtures
- **Files checked**:
  - `src/core/pipeline/__tests__/iteration-display.test.ts:80–102` — no `runtimeStrategy` field
  - `src/core/pipeline/__tests__/pipeline-one-shot-resume.test.ts` — no `runtimeStrategy` matches
  - `src/core/step/__tests__/spec-review-fixer-routing.test.ts:173` — only a comment
  - `tests/unit/absorb-build-fixer/implementer-recovery.test.ts` — no `runtimeStrategy` matches
- **Result**: FIXED for all four files specified in the ledger.
- **Note**: `runtimeStrategy: undefined` still appears in `src/core/step/__tests__/prior-round-context.test.ts:242`, `custom-reviewer-round-context.test.ts:353`, `post-fix-context.test.ts:1115`, and `tests/unit/core/step/capability-consumers.test.ts:200,361,403` — but these are not among the files listed in findings 11/15, and are therefore out-of-scope for this ledger entry.

### [14] TC-T15-05 compile-time invariant
- **File checked**: `tests/unit/step/executor-lifecycle-ordering.test.ts:265–278`
- **Result**: FIXED. The test now creates `const fake: Pick<RuntimeStrategy, "buildDeps"> = { buildDeps: () => makeBaseDeps() }` and assigns the result of `fake.buildDeps(...)` to `const deps: PipelineDeps = ...`. This is a genuine compile-time proof through the port interface, not a trivial local construction.

### [16] Terminal publication cwd fallback
- **File checked**: `src/core/pipeline/pipeline.ts:399,623`
- **StepContext definition**: `src/core/port/step-context.ts:14,20` — `cwd?: string` is optional; comment says "when absent, consumers SHALL fall back to process.cwd()"
- **Result**: STILL PRESENT. Both call sites use `deps.cwd ?? ""`:
  - Line 399 (awaiting-archive): `await deps.terminalState?.commitFinalState(deps.cwd ?? "", deps.slug, state);`
  - Line 623 (awaiting-resume): `await deps.terminalState?.commitFinalState(deps.cwd ?? "", deps.slug, state);`
  
  `process.cwd()` fallback was NOT restored. When `deps.cwd` is undefined, an empty string `""` is passed instead of `process.cwd()`. The `cwd` field is documented as optional with a process.cwd() fallback contract (`src/core/port/step-context.ts:14,20`). No omitted-cwd terminal publication test was added.

---

## Evidence

- **Checked**: 16 ledger entries across 14 unique findings (some duplicates)
- **Regressions found**: 1 (finding [16])
- **Fixed**: 15
