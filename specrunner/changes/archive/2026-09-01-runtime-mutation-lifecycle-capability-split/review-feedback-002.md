# Code Review Feedback — runtime-mutation-lifecycle-capability-split — iter 2

## Scope

Reviewed against: `design.md`, `spec.md`, `tasks.md`, `test-cases.md` in the change folder, plus the touched-files list.
Resumed from iteration 1 with human-supplied decision for Finding 4 (option a: extend `CommitPushInfra` with `pushCapability` and remove `_latestBuiltDeps`).

**Status of previous findings**: All four findings from `review-feedback-001.md` remain unresolved in the current HEAD (`f4d88349`). No code-fixer commit has been applied since the code-review commit (`2d3c86f7`). The only commit since review-001 is the checkpoint (`f4d88349`), which contains only state management files (events.jsonl, state.json, usage.json) — zero code changes.

---

## Finding 1 — HIGH · fixable

**`RuntimeStrategy.buildDeps` still returns `unknown` in the port interface (unresolved from iter 1)**

`src/core/port/runtime-strategy.ts:389–394`

```typescript
buildDeps(
  config: SpecRunnerConfig,
  request: ParsedRequest,
  slug: string,
  workspace: WorkspaceContext,
): unknown;   // ← must be PipelineDeps
```

The JSDoc directly above (lines 381–388) states: "Returns typed PipelineDeps (R2b). The former `unknown` return type is no longer needed because types.ts no longer imports RuntimeStrategy." The comment is correct — the import cycle is broken — but the return type was not updated.

**Violated constraints**:
- Acceptance criterion: "buildDeps [...] の対象 payload signature に domain object を表す unknown が残らない"
- TC-022: return type is `PipelineDeps` (not `unknown`)
- tasks.md T-05: Update `RuntimeStrategy.buildDeps` return type to `PipelineDeps`

**Fix**:
1. Add `import type { PipelineDeps } from "../types.js"` to `runtime-strategy.ts`.
2. Change the return type of `buildDeps` in the `RuntimeStrategy` interface from `unknown` to `PipelineDeps`.

---

## Finding 2 — HIGH · fixable

**`as PipelineDeps` cast still present in `runner.ts:222` (unresolved from iter 1)**

`src/core/command/runner.ts:222`

```typescript
deps = this.runtime.buildDeps(config, request, slug, workspace) as PipelineDeps;
```

This cast is a direct consequence of Finding 1: because the port declares `buildDeps(): unknown`, the compiler requires the cast. Once Finding 1 is resolved, the call site becomes a plain assignment.

**Violated constraints**:
- Acceptance criterion: "対象境界の `as PipelineDeps` [...] cast が除去される"
- TC-021: the result is assigned directly to `deps: PipelineDeps` without `as PipelineDeps`

**Fix**: After resolving Finding 1, remove the `as PipelineDeps` cast so the line reads:
```typescript
deps = this.runtime.buildDeps(config, request, slug, workspace);
```

---

## Finding 3 — MEDIUM · fixable

**`RoundGitEffectsCapability` three optional methods violate D6 and T-03 (unresolved from iter 1)**

`src/core/pipeline/pipeline-capability.ts:92, 107, 122`

```typescript
export interface RoundGitEffectsCapability {
  captureHeadSha(cwd: string): Promise<string | null>;     // required ✓
  listWorktreeChanges?(cwd: string): ...;                  // optional ✗
  commitRoundArtifacts?(...): ...;                         // optional ✗
  digestArtifacts?(refs, cwd, branch): ...;                // optional ✗
  listChangedFiles(baseBranch, cwd, branch): ...;          // required ✓
}
```

Design D6: "Capability method signatures are required (no `?`). Consumers check `deps.stepArtifact ? ... : undefined` (field presence), not method presence. `snapshotMainCheckoutGuard` is the sole exception." Tasks.md T-03 lists all five `RoundGitEffectsCapability` methods without `?`.

Because three methods are optional, `parallel-review-round.ts` uses method-presence checks (`deps.roundGitEffects?.digestArtifacts`, `deps.roundGitEffects?.listWorktreeChanges`, `await deps.roundGitEffects.commitRoundArtifacts?.(...)`) — the wrong pattern per D6.

**Fix**: Make `listWorktreeChanges`, `commitRoundArtifacts`, and `digestArtifacts` required on the interface. ManagedRuntime already provides no-op implementations for all three (`listWorktreeChanges` returns `{kind:"success",paths:[]}`, `commitRoundArtifacts` is a no-op, `digestArtifacts` returns refs with `hash:null`). After this change, update `parallel-review-round.ts` to use field-presence checks (`if (deps.roundGitEffects) { ... }`) instead of method-presence checks.

---

## Finding 4 — HIGH · fixable (decision resolved: option a)

**`LocalRuntime._latestBuiltDeps` side-channel not removed; `CommitPushInfra` not extended with `pushCapability` (unresolved from iter 1; decision now provided)**

`src/core/runtime/local.ts:152–161, 765–768`
`src/core/step/commit-push.ts:66–86`

The human-supplied decision for this finding selected **option (a)**: extend `CommitPushInfra` with `pushCapability` explicitly and eliminate the `_latestBuiltDeps` instance field.

Current state — not changed since iter 1:

```typescript
// LocalRuntime:
private _latestBuiltDeps: PipelineDeps | null = null;

buildDeps(...): PipelineDeps {
  const deps: PipelineDeps = { ... };
  this._latestBuiltDeps = deps;     // ← side-channel write
  return deps;
}

async finalizeStepArtifacts(..., infra: CommitPushInfra): Promise<void> {
  const deps = this._latestBuiltDeps;   // ← side-channel read
  if (!deps) throw new Error("...");
  await commitAndPush(step, state, deps, headBeforeStep, finalInfra);
}
```

```typescript
// CommitPushInfra (commit-push.ts:66-86) — pushCapability field is ABSENT:
export interface CommitPushInfra {
  spawnFn: SpawnFn;
  sleepFn: (ms: number) => Promise<void>;
  events: EventBus;
  persistBeforePush?: (oid: string) => Promise<void>;
  statFn?: StagedPathSizeProbe;
}
```

The `pushCapability` needed by `commitAndPush` (inside `finalizeStepArtifacts`) is currently read from `_latestBuiltDeps.pushCapability`, which `runner.ts` sets post-`buildDeps`. This creates an implicit ordering requirement invisible from the `StepArtifactLifecycleCapability` interface.

**Fix (option a)**:
1. Add `pushCapability?: PushCapability | null` to `CommitPushInfra` in `commit-push.ts`.
2. In `StepExecutor` (or wherever `finalizeStepArtifacts` is called), construct the `CommitPushInfra` with `pushCapability` sourced from `deps.pushCapability`.
3. In `LocalRuntime.finalizeStepArtifacts`, use `infra.pushCapability` instead of `this._latestBuiltDeps?.pushCapability`.
4. Remove `this._latestBuiltDeps` field, its assignment in `buildDeps`, and the null-guard throw in `finalizeStepArtifacts`.

After this fix, `finalizeStepArtifacts` becomes a pure function of its typed parameters — no hidden precondition on `buildDeps()` having been called.

---

## 検証した項目

| 項目 | 状態 |
|---|---|
| `deps.runtimeStrategy` removed from `PipelineDeps` (`types.ts`) | ✓ |
| executor.ts: zero `deps.runtimeStrategy` references | ✓ (TC-005) |
| pipeline.ts: uses `deps.terminalState.commitFinalState` | ✓ (TC-012) |
| parallel-review-round.ts: uses `deps.roundGitEffects` | ✓ (TC-016) |
| step-completion.ts: uses `deps.stepIo` | ✓ (TC-036) |
| `StepArtifactLifecycleCapability` methods all required except `snapshotMainCheckoutGuard?` | ✓ (TC-004) |
| `StepIoValidationCapability` methods all required | ✓ (TC-003) |
| `TerminalStateCapability.commitFinalState` typed (no `unknown`) | ✓ (TC-011) |
| `LocalRuntime.finalizeStepArtifacts` accepts typed `CommitPushInfra` (no cast) | ✓ (TC-032, TC-033) |
| `RoundEgressParams` is a plain DTO | ✓ (TC-015) |
| `LocalRuntime.buildDeps` injects all 7 capability fields | ✓ (TC-027) |
| No new `as unknown as RuntimeStrategy` added | ✓ (TC-038) |
| R2a read-only capabilities not regressed to full facade | ✓ |
| `finalizeStepArtifacts` skipped when `roundOwnsGitEffects === true` | ✓ (TC-007) |
| `terminalState.commitFinalState` called in both pipeline terminal paths | ✓ (TC-009) |
| `executor-lifecycle-ordering.test.ts` added | ✓ |
| Managed runtime no-op contract tests added | ✓ |
| Local runtime capability contract tests added | ✓ |
| `architecture/components.md` updated | ✓ (TC-042) |
| `RuntimeStrategy.buildDeps` port returns `PipelineDeps` (TC-022) | ✗ — F1 unfixed |
| `runner.ts` `as PipelineDeps` cast removed (TC-021) | ✗ — F2 unfixed |
| `RoundGitEffectsCapability` methods all required (D6 / T-03) | ✗ — F3 unfixed |
| `_latestBuiltDeps` removed; `CommitPushInfra` carries `pushCapability` | ✗ — F4 unfixed |

---

## 検証できなかった項目

- **TC-021 / TC-022**: `buildDeps` port type and `runner.ts` cast — still unresolved (F1/F2).
- **`_latestBuiltDeps` removal**: Decision (a) has been provided but not yet implemented (F4).

---

## Summary

All four findings from iteration 1 remain unresolved. No code-fixer commit was applied between the code-review (iter 1) and the current HEAD. The findings are:

| # | Severity | Finding | Status |
|---|---|---|---|
| F1 | HIGH | `buildDeps` port interface returns `unknown` instead of `PipelineDeps` | unfixed |
| F2 | HIGH | `as PipelineDeps` cast in `runner.ts:222` | unfixed |
| F3 | MEDIUM | Three optional methods on `RoundGitEffectsCapability` violate D6/T-03 | unfixed |
| F4 | HIGH | `_latestBuiltDeps` side-channel; `CommitPushInfra` missing `pushCapability` | unfixed; decision: option (a) |

Findings F1 and F2 are mechanically coupled: fixing F1 (one-line return type + one import) directly unlocks F2 (remove cast). F3 requires making three interface methods required and updating the one call site in `parallel-review-round.ts`. F4 requires adding `pushCapability` to `CommitPushInfra` and threading it through `finalizeStepArtifacts`, then deleting `_latestBuiltDeps`.
