# Review Feedback — runtime-mutation-lifecycle-capability-split — Iteration 9

## Summary

Implementation of R2b (RuntimeStrategy mutation/lifecycle capability split) is **complete and correct**. All acceptance criteria in the request are satisfied. SpecRunner verification is green (build, typecheck, test, lint, changed-line-coverage all passed). No blocking issues found.

---

## Scope Verification

### Target signatures — domain-payload `unknown` eliminated

| Signature | Before | After |
|-----------|--------|-------|
| `buildDeps(...)` | returns `unknown` | returns `PipelineDeps` (typed) ✓ |
| `finalizeStepArtifacts(step: unknown, deps: unknown, infra: unknown)` | 3× domain-payload `unknown` | removed from `RuntimeStrategy`; typed on `StepArtifactLifecycleCapability` ✓ |
| `commitFinalState(deps: unknown, state: unknown)` | 2× domain-payload `unknown` | removed from `RuntimeStrategy`; typed on `TerminalStateCapability` ✓ |
| `commitRoundArtifacts(..., infra: unknown, egressParams?: unknown)` | 2× domain-payload `unknown` | removed from `RuntimeStrategy`; typed on `RoundGitEffectsCapability` + `RoundEgressParams` DTO ✓ |

### Casts eliminated

| Cast | File | Status |
|------|------|--------|
| `as PipelineDeps` | `src/core/command/runner.ts` | Eliminated — `buildDeps` now returns `PipelineDeps` directly ✓ |
| `as CommitPushInfra` | `src/core/runtime/local.ts` | Eliminated — `infra` parameter is typed ✓ |
| Egress params restore cast | `src/core/runtime/local.ts` | Eliminated — `egressParams?: RoundEgressParams` typed ✓ |
| `as unknown as RuntimeStrategy` | Production `src/` | Zero occurrences (no new casts added) ✓ |
| `as unknown as RuntimeStrategy` | Test files | 4→2 occurrences (pipeline-sole-committer-e2e.test.ts × 2 remain, acceptable per TC-038) ✓ |

### PipelineDeps restructuring

`PipelineDeps.runtimeStrategy?: RuntimeStrategy` has been removed. Seven capability fields are now present:

```
stepArtifact?:       StepArtifactLifecycleCapability   // StepExecutor + CommitOrchestrator
stepIo?:             StepIoValidationCapability         // StepExecutor + step-completion
terminalState?:      TerminalStateCapability            // Pipeline + CommandRunner gate
roundGitEffects?:    RoundGitEffectsCapability          // ParallelReviewRound
changedFiles?:       ChangedFilesCapability             // R2a (unchanged)
commitInspection?:   CommitInspectionCapability         // R2a (unchanged)
revisionContent?:    RevisionContentCapability          // R2a (unchanged)
```

The circular import (`types.ts` → `RuntimeStrategy` → `PipelineDeps`) is broken. `runtime-strategy.ts` now has a single `import type { PipelineDeps }` (type-only, erased at compile time), documented in the DSM allowlist.

---

## Capability Interface Review

### StepArtifactLifecycleCapability (`src/core/step/step-capability.ts`)

- All methods required except `snapshotMainCheckoutGuard?` (fail-open semantics — correct per D6 exception)
- `finalizeStepArtifacts(step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string | null, infra: CommitPushInfra): Promise<void>` — fully typed, no `unknown`
- `deriveStepArtifactLifecycleCapability` helper binds from `LocalRuntime`/`ManagedRuntime` via structural duck-typing ✓

### StepIoValidationCapability (`src/core/step/step-capability.ts`)

- All three methods required: `validateStepInputs`, `validateStepOutputs`, `verifyFindingRefs` ✓
- Injected via `deps.stepIo`; consumers guard with `if (deps.stepIo)` ✓

### TerminalStateCapability (`src/core/pipeline/pipeline-capability.ts`)

- Single method `commitFinalState(cwd: string, slug: string, state: JobState): Promise<void>` — typed, no `unknown` ✓
- Used via `deps.terminalState?.commitFinalState(cwd, deps.slug, state)` in both `pipeline.ts` and `runner.ts` ✓

### RoundGitEffectsCapability (`src/core/pipeline/pipeline-capability.ts`)

- All five methods required: `captureHeadSha`, `listWorktreeChanges`, `commitRoundArtifacts`, `digestArtifacts`, `listChangedFiles` ✓
- `RoundEgressParams` DTO replaces the `unknown` egressParams: `{ synthesizedCommits: readonly string[]; pushCapability?: PushCapability | null; excludeWorktreePatterns?: string[] }` ✓

---

## Consumer Migration Review

### `executor.ts`

- Zero references to `deps.runtimeStrategy` ✓
- `deps.stepArtifact?.finalizeStepArtifacts(step, stateForFinalize, cwd, deps.slug, headForFinalize, {...infra})` — all typed ✓
- `deps.stepIo?.validateStepInputs(...)` and `deps.stepIo?.validateStepOutputs(...)` wired correctly ✓
- `roundOwnsGitEffects` guard correctly skips `finalizeStepArtifacts` ✓

### `pipeline.ts`

- Zero references to `deps.runtimeStrategy` ✓
- Both terminal transitions: `deps.terminalState?.commitFinalState(deps.cwd, deps.slug, state)` ✓

### `runner.ts`

- `buildDeps` result assigned to `deps: PipelineDeps` directly — no cast ✓
- Gate-halt path: `deps.terminalState?.commitFinalState(deps.cwd, deps.slug, haltState)` ✓

### `parallel-review-round.ts`

- Zero references to `deps.runtimeStrategy` ✓
- All capability access via `deps.roundGitEffects?.captureHeadSha(...)`, `deps.roundGitEffects.listChangedFiles(...)`, `deps.roundGitEffects.commitRoundArtifacts(...)` with typed `CommitPushInfra` and `RoundEgressParams` ✓

### `step-completion.ts`

- `verifyFindingRefs` routed through `deps.stepIo?.verifyFindingRefs(...)` ✓

### `adr-gen.ts`, `custom-reviewer.ts`, `spec-review.ts`

- `prepareRoundContext` accepts `commitInspection: CommitInspectionCapability | undefined` — no longer derives from a facade ✓
- Passes `commitInspection` to `derivePostFixContext({ runtimeStrategy: commitInspection })` — functionally correct ✓

### `commit-orchestrator.ts`

- Uses `deps.revisionContent` directly (passed as `runtimeStrategy: deps.revisionContent` to `recordFindingRecency`) ✓

---

## Architecture Document Update

`architecture/components.md` correctly documents:

- `RuntimeStrategy` as "composition-root facade" (not service locator) ✓
- R2a read-only capabilities AND R2b mutation/lifecycle capabilities listed with consumer ownership ✓
- `PipelineDeps` described as "capability の集合体（service locator ではない）" ✓
- Local/Managed behavioral differences confined to concrete runtime/adapter implementations ✓

---

## Test Coverage Assessment

### must-priority TCs (41/41 assessed)

Coverage is comprehensive across all axes:

| Domain | Representative tests | Status |
|--------|---------------------|--------|
| StepArtifactLifecycle interface shape | TC-001, TC-002, TC-004 | `local-runtime-capabilities.test.ts` ✓ |
| StepIo required methods | TC-003 | Compile-time enforcement ✓ |
| finalizeStepArtifacts typed call | TC-006, TC-T15-01 | `executor-lifecycle-ordering.test.ts` ✓ |
| roundOwnsGitEffects skip | TC-007, TC-T15-02 | `executor-lifecycle-ordering.test.ts` ✓ |
| prepareStepArtifacts ordering | TC-008, TC-T15-06 | `executor-lifecycle-ordering.test.ts` ✓ |
| TerminalState capability shape | TC-011 | Compile-time + runtime ✓ |
| pipeline.ts terminal calls | TC-012 | Verified by grep/inspection ✓ |
| gate-halt terminalState | TC-013, TC-T15-03 | `executor-lifecycle-ordering.test.ts` ✓ |
| RoundEgressParams DTO | TC-015 | Interface inspection ✓ |
| buildDeps return type | TC-022, TC-T15-05 | Port interface + runtime test ✓ |
| PipelineDeps restructured | TC-023, TC-024 | `src/core/types.ts` direct inspection ✓ |
| LocalRuntime capabilities | TC-027, TC-029 | `local-runtime-capabilities.test.ts` ✓ |
| ManagedRuntime no-ops | TC-028, TC-030, TC-031 | `managed-runtime-capabilities.test.ts` ✓ |
| LocalRuntime typed CommitPushInfra | TC-032, TC-033 | `src/core/runtime/local.ts` ✓ |
| step-completion deps.stepIo | TC-036 | Verified by grep ✓ |
| No new forced casts | TC-038 | 4→2 occurrences, zero new ✓ |
| Gate / verification gate | TC-043–TC-046 | verification-result.md: all passed ✓ |

### Lifecycle ordering tests (new, `tests/unit/step/executor-lifecycle-ordering.test.ts`)

New test file pins the following invariants:
- `finalizeStepArtifacts` receives `cwd: string` and `slug: string` primitives (TC-T15-01) ✓
- `finalizeStepArtifacts` not called when `roundOwnsGitEffects` (TC-T15-02) ✓
- `terminalState.commitFinalState` called with string args (TC-T15-03) ✓
- `terminalState` absent → optional chain evaluates to `undefined` (TC-T15-04) ✓
- `buildDeps()` return type is `PipelineDeps` without cast (TC-T15-05) ✓
- `prepareStepArtifacts` before `runner.run()` (TC-T15-06) ✓

---

## Observations (non-blocking)

### OBS-1: Stale `runtimeStrategy` parameter name in internal helpers

**Severity**: low  
**Files**: `src/core/step/prior-round-context.ts` (line 131), `src/core/step/custom-reviewer-round-context.ts` (line 244), `src/core/step/post-fix-context.ts` (line 226), `src/core/step/finding-recency.ts` (line 226)

The `params` interfaces in these internal helper functions contain a field named `runtimeStrategy` even though the type has been narrowed to a specific capability:

```ts
// prior-round-context.ts line 131
runtimeStrategy: CommitInspectionCapability | undefined;

// finding-recency.ts line 226
runtimeStrategy: RevisionContentCapability | undefined;
```

The field is correctly typed, and callers pass the appropriate capability. The naming is a clarity debt — it does not affect compile-time safety or runtime correctness. Renaming to `commitInspection` / `revisionContent` in a future cleanup would improve legibility.

### OBS-2: Test variable named `runtimeStrategy` in `parallel-review-round-invalidation.test.ts`

**Severity**: low  
**File**: `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts` (lines 214, 275, 308, 343, 382, 411, 460)

Local variables for `RoundGitEffectsCapability` partial mocks are named `runtimeStrategy` and passed as `roundGitEffects: runtimeStrategy as never`. The file comment at line 23 also says "fake runtimeStrategy" rather than "fake roundGitEffects". These names are stale (the values are correct capability-scoped objects), creating a mismatch between name and role. Not a functional issue; a minor naming inconsistency.

---

## Measurements (per request.md)

| Metric | Before (R2a baseline) | After (R2b) |
|--------|----------------------|-------------|
| `runtime-strategy.ts` token `unknown` | 21 | 4 (only `query(): AsyncGenerator<unknown>` + `CleanupHandle` branding) |
| `buildDeps` return type | `unknown` | `PipelineDeps` |
| Domain-payload `unknown` in 4 target signatures | 7 | 0 |
| `as PipelineDeps` in production `runner.ts` | 1 | 0 |
| `as CommitPushInfra` in production `local.ts` | 1 | 0 |
| Egress params restore cast in production | 1 | 0 |
| `as unknown as RuntimeStrategy` (all files) | 4 | 2 (pre-existing e2e) |
| `PipelineDeps.runtimeStrategy` field | present | removed |
| R2b capability interfaces | 0 | 4 new |
| Capability contract tests | 0 | 2 files (local + managed) |
| Lifecycle ordering tests | 0 | 1 new file (executor-lifecycle-ordering.test.ts, 6 TCs) |

---

## Conclusion

The implementation correctly completes the R2b capability split as specified. All 41 must-priority test cases are addressed (45 automated / 1 manual / 46 total). Verification is green. The two low-severity observations (stale naming in internal helpers and test variable names) are clarity debt that do not affect correctness or type safety.

---

## 検証した項目

- `src/core/port/runtime-strategy.ts` — `buildDeps` return type changed from `unknown` to `PipelineDeps`; `finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts` removed from the interface
- `src/core/types.ts` — `PipelineDeps.runtimeStrategy` removed; seven typed capability fields present
- `src/core/step/step-capability.ts` — `StepArtifactLifecycleCapability` and `StepIoValidationCapability` interfaces; all methods required except `snapshotMainCheckoutGuard?`; derive helpers correct
- `src/core/pipeline/pipeline-capability.ts` — `TerminalStateCapability` and `RoundGitEffectsCapability` interfaces; `RoundEgressParams` DTO typed; derive helpers correct
- `src/core/step/executor.ts` — zero `deps.runtimeStrategy` references; `deps.stepArtifact.finalizeStepArtifacts` called with typed `cwd: string`, `slug: string`, `infra: CommitPushInfra`; `roundOwnsGitEffects` guard correct
- `src/core/pipeline/pipeline.ts` — zero `deps.runtimeStrategy` references; both terminal transitions use `deps.terminalState?.commitFinalState(deps.cwd, deps.slug, state)`
- `src/core/command/runner.ts` — `buildDeps` result assigned to `deps: PipelineDeps` without cast; gate-halt uses `deps.terminalState?.commitFinalState`
- `src/core/pipeline/parallel-review-round.ts` — zero `deps.runtimeStrategy` references; all git effects via `deps.roundGitEffects`
- `src/core/step/step-completion.ts` — `verifyFindingRefs` via `deps.stepIo?.verifyFindingRefs`
- `src/core/step/commit-orchestrator.ts` — `deps.revisionContent` passed directly to `recordFindingRecency`
- `src/core/step/adr-gen.ts`, `src/core/step/spec-review.ts` — accept `commitInspection: CommitInspectionCapability | undefined` (no facade derivation)
- `src/core/runtime/local.ts` — `finalizeStepArtifacts(infra: CommitPushInfra)` typed; `commitRoundArtifacts(egressParams?: RoundEgressParams)` typed; no `as CommitPushInfra` or egress restore casts; derive helpers called in `buildDeps`
- `src/core/runtime/managed.ts` — all four capability methods implemented as no-ops with correct semantics; `buildDeps` injects all capability fields
- `src/core/runtime/__tests__/local-runtime-capabilities.test.ts` — compile-time and runtime proofs for all four capabilities
- `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts` — TC-028: ManagedRuntime.buildDeps injects all R2b fields; no-op semantics verified
- `tests/unit/step/executor-lifecycle-ordering.test.ts` — six lifecycle ordering invariants pinned (TC-T15-01 through TC-T15-06)
- `tests/unit/architecture/arch-allowlist.ts` — DSM allowlist entry for `port/runtime-strategy.ts → types.ts` type-only import
- `architecture/components.md` — R2b section documents RuntimeStrategy as composition-root facade; PipelineDeps as capability集合体; Local/Managed differences confined to concrete runtimes
- Production `src/` tree: zero `as PipelineDeps`, zero `as CommitPushInfra`, zero `as unknown as RuntimeStrategy` occurrences
- `specrunner/changes/runtime-mutation-lifecycle-capability-split/verification-result.md` — build, typecheck, test, lint, changed-line-coverage all passed

---

## 検証できなかった項目

- TC-042 (manual): Full manual review of `architecture/components.md` for completeness — assessed via code inspection only; the manual reviewer checklist (confirming prose accurately reflects all R2a + R2b capability owners) was not independently reproduced
- TC-041 (should): `reloadJobState` skip on resume path — runner.ts code path confirmed by inspection; no separate executable test observed targeting the negative (resume path does NOT call reloadJobState)
- Runtime behaviour of `LocalRuntime.buildDeps` injecting capability fields into a real running pipeline — verified via contract tests and unit tests; no full end-to-end integration test specifically for R2b capability wiring was run in this review session
