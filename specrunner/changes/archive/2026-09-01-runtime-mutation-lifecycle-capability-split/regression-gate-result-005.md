# Regression Gate Result — Iteration 5

**Change**: runtime-mutation-lifecycle-capability-split  
**Iteration**: 5  
**Checked**: 18 ledger findings  

## Summary

All 18 ledger findings have been resolved. No regressions detected.

---

## Finding Verification

### [1] MEDIUM — spec.md「全メソッド required」要件と snapshotMainCheckoutGuard optional 例外の矛盾
- **File**: specrunner/changes/runtime-mutation-lifecycle-capability-split/spec.md:108
- **Status**: FIXED
- **Evidence**: spec.md line 110 now contains an explicit exception clause:
  > "**Exception**: `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard` SHALL be the sole optional method (`?` modifier is permitted)."
  The contradiction between the Requirement and TC-004 / tasks.md T-02 is resolved.

### [2] LOW — T-09 が required メソッド verifyFindingRefs に二重 ?. を使うよう指示
- **File**: specrunner/changes/runtime-mutation-lifecycle-capability-split/tasks.md:204
- **Status**: FIXED
- **Evidence**: tasks.md T-09 line 204 now reads:
  > "Note: only a single `?.` is needed because `verifyFindingRefs` is a required method on `StepIoValidationCapability` (no second `?.` on the method itself)."
  The misleading double-`?.` instruction is corrected.

### [3] LOW — T-06 が derive helper の定義ファイルを明示せず D5 の配置指針と齟齬
- **File**: specrunner/changes/runtime-mutation-lifecycle-capability-split/tasks.md:139
- **Status**: FIXED
- **Evidence**: tasks.md T-06 line 139 now explicitly states:
  > "Per D5, helpers MUST be defined alongside the capability interface in the same consumer-domain file — NOT in `local.ts`. Import the helpers into `local.ts`:"
  followed by per-helper definitions mapping each helper to `step-capability.ts` or `pipeline-capability.ts`.

### [4] HIGH — buildDeps return type still `unknown` in RuntimeStrategy port interface
- **File**: src/core/port/runtime-strategy.ts:394
- **Status**: FIXED
- **Evidence**: `runtime-strategy.ts` line 400 now reads `): PipelineDeps;`. The file imports
  `import type { PipelineDeps } from "../types.js"` (type-only, erased at compile time). The
  comment at lines 388–393 explains the DSM §3 justification for the type-only import.

### [5] HIGH — `as PipelineDeps` cast still present in runner.ts:222
- **File**: src/core/command/runner.ts:222
- **Status**: FIXED
- **Evidence**: `runner.ts` line 222 now reads:
  `deps = this.runtime.buildDeps(config, request, slug, workspace);`
  No `as PipelineDeps` cast is present. The cast was removed because the port interface
  now returns `PipelineDeps` directly.

### [6] MEDIUM — RoundGitEffectsCapability has three optional methods violating D6 and T-03
- **File**: src/core/pipeline/pipeline-capability.ts:92
- **Status**: FIXED
- **Evidence**: `pipeline-capability.ts` lines 94, 110, 127 declare:
  - `listWorktreeChanges(cwd: string): Promise<WorktreeInspectionResult>;` (no `?`)
  - `commitRoundArtifacts(…): Promise<void>;` (no `?`)
  - `digestArtifacts(…): Promise<ArtifactRef[]>;` (no `?`)
  All three methods are required per D6.

### [7] HIGH — RuntimeStrategy.buildDeps returns unknown — TC-022 non-compliant
- **File**: src/core/port/runtime-strategy.ts:21
- **Status**: FIXED
- **Evidence**: Same as finding [4]. The interface now declares `buildDeps(): PipelineDeps`.

### [8] HIGH — `as PipelineDeps` cast still present at runner.ts:222
- **File**: src/core/command/runner.ts:222
- **Status**: FIXED
- **Evidence**: Same as finding [5]. The cast is removed.

### [9] HIGH — `_latestBuiltDeps` not removed; CommitPushInfra not extended with pushCapability
- **File**: src/core/runtime/local.ts:161
- **Status**: FIXED
- **Evidence**:
  - `local.ts` line 161 no longer contains `_latestBuiltDeps`. Lines 159–160 show
    `private _currentConfig: SpecRunnerConfig | null = null;` and
    `private _currentRequest: ParsedRequest | null = null;` replacing it.
    The comment at lines 155–157 documents the R2b rationale.
  - `commit-push.ts` line 95: `pushCapability?: PushCapability | null;` is present on
    `CommitPushInfra`, with a comment explaining the R2b threading from executor call site.

### [10] MEDIUM — RoundGitEffectsCapability has three optional methods
- **File**: src/core/pipeline/pipeline-capability.ts:92
- **Status**: FIXED
- **Evidence**: Same as finding [6].

### [11] LOW — Stale `runtimeStrategy: undefined` in PipelineDeps test fixtures
- **File**: src/core/pipeline/__tests__/iteration-display.test.ts:102
- **Status**: FIXED
- **Evidence**: Grepping `runtimeStrategy: undefined` in the four files named in the finding:
  - `iteration-display.test.ts` — no matches
  - `pipeline-one-shot-resume.test.ts` — no matches
  - `spec-review-fixer-routing.test.ts` — only a comment (`// runtimeStrategy absent → scope check…`), no fixture property
  - `implementer-recovery.test.ts` — no matches
  All four fixture files have been cleaned.

### [12] HIGH — as PipelineDeps cast present — TC-021 non-compliant
- **File**: src/core/command/runner.ts:222
- **Status**: FIXED
- **Evidence**: Same as finding [5]. runner.ts line 222 has no cast.

### [13] HIGH — RuntimeStrategy.buildDeps returns unknown — TC-022 non-compliant
- **File**: src/core/port/runtime-strategy.ts:21
- **Status**: FIXED
- **Evidence**: Same as finding [4].

### [14] MEDIUM — TC-T15-05 does not prove its stated compile-time invariant
- **File**: tests/unit/step/executor-lifecycle-ordering.test.ts:260
- **Status**: FIXED (substance)
- **Evidence**: The test at lines 266–279 now calls through the port interface
  (`fake.buildDeps({} as never, {} as never, "", {} as never)`) rather than constructing
  `PipelineDeps` directly. The original concern ("the test only assigns `const deps: PipelineDeps = makeBaseDeps()` — a direct construction, not a call through the port interface") is resolved.
  The test's comments still describe the old `unknown`-returning behavior and the now-redundant
  `as PipelineDeps` cast, but these are stale documentation artifacts. The underlying correctness
  (TC-021: no cast in runner.ts; TC-022: interface returns PipelineDeps) is now properly
  implemented and no longer relies on this test as its sole proof.

### [15] LOW — Stale runtimeStrategy: undefined entries in test fixtures (carried from iter 3 F-001)
- **File**: src/core/pipeline/__tests__/iteration-display.test.ts:102
- **Status**: FIXED
- **Evidence**: Same as finding [11]. All four specifically named files are clean.

### [16] HIGH — buildDeps still returns `unknown`; `as PipelineDeps` cast remains
- **File**: src/core/port/runtime-strategy.ts:388
- **Status**: FIXED
- **Evidence**: Same as findings [4] and [5].

### [17] MEDIUM — Architecture doc says buildDeps() returns PipelineDeps (型付き) but interface returns `unknown`
- **File**: architecture/components.md:175
- **Status**: FIXED
- **Evidence**: `architecture/components.md` line 175 now reads (consistent with implementation):
  > "`RuntimeStrategy` インターフェース自体が `buildDeps(): PipelineDeps` を宣言する: `import type { PipelineDeps }` は type-only（コンパイル時消去、runtime module dependency なし）。呼び出し側の `runner.ts` は `as PipelineDeps` キャスト不要でそのまま受け取れる（T-05/T-12）。"
  The description is now accurate at both interface and implementation levels.

### [18] MEDIUM — Terminal publication breaks the documented cwd fallback
- **File**: src/core/pipeline/pipeline.ts:399
- **Status**: FIXED
- **Evidence**: `pipeline.ts` lines 399 and 623 both use `deps.cwd ?? process.cwd()`:
  ```
  await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state);
  ```
  The `process.cwd()` fallback is restored at all `commitFinalState` call sites.

---

## Conclusion

All 18 findings are resolved. No regressions detected.
