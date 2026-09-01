# Code Review Feedback — runtime-mutation-lifecycle-capability-split — iter 1

## Scope

Reviewed against: `design.md`, `spec.md`, `tasks.md`, `test-cases.md` in the change folder, plus the touched-files list.
Verification result: all phases passed (build / typecheck / test / lint / changed-line-coverage).

---

## Finding 1 — HIGH · fixable

**`RuntimeStrategy.buildDeps` still returns `unknown` in the port interface**

`src/core/port/runtime-strategy.ts:389–394`

```typescript
buildDeps(
  config: SpecRunnerConfig,
  request: ParsedRequest,
  slug: string,
  workspace: WorkspaceContext,
): unknown;   // ← should be PipelineDeps per design D3 and tasks.md T-05
```

The JSDoc comment directly above this signature (lines 381–388) reads:
> "Returns typed PipelineDeps (R2b). The former `unknown` return type is no longer needed because types.ts no longer imports RuntimeStrategy, breaking the import cycle."

The comment correctly describes the **intent**, but the actual return type was not changed from `unknown` to `PipelineDeps`. The circular-import cycle that required `unknown` is broken (types.ts no longer imports RuntimeStrategy), so the fix is mechanical.

**Violated constraints**:
- Acceptance criterion: "buildDeps [...] の対象 payload signature に domain object を表す unknown が残らない"
- TC-022: "the return type is `PipelineDeps` (not `unknown`)"
- tasks.md T-05: "Update `RuntimeStrategy.buildDeps` return type to `PipelineDeps`"

**Fix**: change `: unknown` to `: PipelineDeps` and add `import type { PipelineDeps } from "../types.js"` to `runtime-strategy.ts`.

---

## Finding 2 — HIGH · fixable

**`as PipelineDeps` cast still present in `runner.ts:222`**

`src/core/command/runner.ts:222`

```typescript
deps = this.runtime.buildDeps(config, request, slug, workspace) as PipelineDeps;
```

Because `RuntimeStrategy.buildDeps` still returns `unknown` (Finding 1), this cast is necessary for the code to compile. Once Finding 1 is resolved, the return type becomes `PipelineDeps` and the cast can be removed, giving a plain assignment `deps = this.runtime.buildDeps(...)`.

These two findings are coupled: resolving Finding 1 directly enables resolving Finding 2.

**Violated constraints**:
- Acceptance criterion: "対象境界の `as PipelineDeps` [...] cast が除去される"
- TC-021: "the result is assigned directly to `deps: PipelineDeps` without `as PipelineDeps`"

---

## Finding 3 — MEDIUM · fixable

**`RoundGitEffectsCapability` declares `listWorktreeChanges?`, `commitRoundArtifacts?`, `digestArtifacts?` as optional methods — violates D6 and tasks.md T-03**

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

Design D6 states: "Capability method signatures are required (no `?`). Consumers check `deps.stepArtifact ? ... : undefined` (field presence), not `deps.stepArtifact?.captureHeadSha?.()` (method presence). `snapshotMainCheckoutGuard` is an exception." D6 explicitly names only `snapshotMainCheckoutGuard` as the exception.

Tasks.md T-03 lists all five `RoundGitEffectsCapability` methods without `?`:
- `listWorktreeChanges(cwd: string): Promise<WorktreeInspectionResult>`
- `commitRoundArtifacts(...)`: required
- `digestArtifacts(...)`: required

The consequence is that `parallel-review-round.ts` uses method-presence checks:
```typescript
if (deps.roundGitEffects?.digestArtifacts) { ... }
if (deps.roundGitEffects?.listWorktreeChanges) { ... }
await deps.roundGitEffects.commitRoundArtifacts?.(...)
```

These are method-presence checks, not field-presence checks. D6 requires the latter pattern. If `ManagedRuntime` needs to omit these methods, the correct approach per D6 is to inject `deps.roundGitEffects` as `undefined` rather than providing a capability object with absent methods.

**Violated constraints**:
- Design D6: "snapshotMainCheckoutGuard is an exception" (only that one method should be optional)
- tasks.md T-03: lists all 5 methods without `?`

**Fix options**:
1. Make all three methods required on the interface; ManagedRuntime either implements no-ops for all (consistent with the existing `finalizeStepArtifacts` no-op pattern) or `buildDeps` returns `roundGitEffects: undefined` for managed runtime.
2. If managed runtime needs to conditionally omit `listWorktreeChanges` / `commitRoundArtifacts`, split into two sub-capabilities (an approach the spec lists as acceptable under Requirement 1).

The current managed runtime fake in `managed-runtime-capabilities.test.ts` (`makeManagedRoundGitEffectsSource`) already includes `listWorktreeChanges` and `commitRoundArtifacts` as no-ops, so approach 1 appears directly applicable.

---

## Finding 4 — LOW · decision-needed

**`LocalRuntime._latestBuiltDeps` implicit coupling: `finalizeStepArtifacts` reads `pushCapability` set post-`buildDeps` by composition root**

`src/core/runtime/local.ts:152–161, 765–768`

```typescript
// In LocalRuntime:
private _latestBuiltDeps: PipelineDeps | null = null;

buildDeps(...): PipelineDeps {
  const deps: PipelineDeps = { ... };
  this._latestBuiltDeps = deps;
  return deps;
}

async finalizeStepArtifacts(...): Promise<void> {
  const deps = this._latestBuiltDeps;
  if (!deps) throw new Error("LocalRuntime: _latestBuiltDeps not set; ...");
  await commitAndPush(step, state, deps, headBeforeStep, finalInfra);
}
```

The comment explains: `commitAndPush` needs `deps.pushCapability`, which `runner.ts` sets on the `deps` object **after** `buildDeps()` returns (via JavaScript reference semantics). This creates an implicit ordering requirement: `buildDeps()` must be called before `finalizeStepArtifacts()`, and `deps.pushCapability` must be set between them.

Consequences:
1. `StepArtifactLifecycleCapability.finalizeStepArtifacts` requires a side-channel precondition (`_latestBuiltDeps`) that is not visible from the capability interface.
2. Unit tests for the capability (via `deriveStepArtifactLifecycleCapability`) must call `buildDeps()` first or face a runtime throw — this couples capability testing to the composition root.
3. The `local-runtime-capabilities.test.ts` uses structural fakes (not a real `LocalRuntime`), so this coupling is tested indirectly but not directly exercised against the real `LocalRuntime`.

**Context**: The design spec (design.md) does not document this pattern. It may have emerged as a necessary pragmatic solution to avoid threading `pushCapability` through the capability interface. If the design intended `CommitPushInfra` to carry `pushCapability`, that would be the correct fix; alternatively, the capability contract test for `LocalRuntime.finalizeStepArtifacts` should explicitly document and test the `_latestBuiltDeps` precondition.

This is marked `decision-needed` because it represents a design trade-off not covered in the spec: either the design should explicitly endorse `_latestBuiltDeps` and require a test for it, or `CommitPushInfra` should be extended to carry `pushCapability` so the side channel is eliminated.

---

## 検証した項目

以下の受け入れ基準・テストケースを確認した:

| 項目 | 状態 |
|---|---|
| `deps.runtimeStrategy` removed from `PipelineDeps` (`types.ts`) | ✓ |
| executor.ts: zero `deps.runtimeStrategy` references | ✓ (TC-005) |
| pipeline.ts: zero `deps.runtimeStrategy` references, uses `deps.terminalState` | ✓ (TC-012) |
| parallel-review-round.ts: zero `deps.runtimeStrategy` references, uses `deps.roundGitEffects` | ✓ (TC-016) |
| step-completion.ts: zero `deps.runtimeStrategy` references, uses `deps.stepIo` | ✓ (TC-036) |
| `StepArtifactLifecycleCapability` methods all required except `snapshotMainCheckoutGuard?` | ✓ (TC-004) |
| `StepIoValidationCapability` methods all required | ✓ (TC-003) |
| `TerminalStateCapability.commitFinalState` signature typed (no `unknown`) | ✓ (TC-011) |
| `LocalRuntime.finalizeStepArtifacts` accepts typed `CommitPushInfra` (no `as CommitPushInfra`) | ✓ (TC-032, TC-033) |
| `RoundEgressParams` is a plain DTO with 3 expected fields | ✓ (TC-015) |
| `LocalRuntime.buildDeps` injects all 7 capability fields | ✓ (TC-027) |
| No new `as unknown as RuntimeStrategy` added | ✓ (TC-038) |
| R2a read-only capabilities not regressed to full facade | ✓ |
| `finalizeStepArtifacts` skipped when `roundOwnsGitEffects === true` | ✓ (TC-007) |
| `terminalState.commitFinalState` called in both pipeline terminal paths | ✓ (TC-009) |
| `executor-lifecycle-ordering.test.ts` added (TC-008, TC-013 coverage) | ✓ |
| Managed runtime no-op contract tests added | ✓ (TC-028, TC-030, TC-031) |
| Local runtime capability contract tests added | ✓ (TC-029) |
| architecture/components.md updated: R2b responsibilities, PipelineDeps not a service locator | ✓ (TC-042) |
| `bun run build` / `typecheck` / `test` / `lint` all pass | ✓ (TC-043–TC-046) |

---

## 検証できなかった項目

- **TC-021 / TC-022**: `runner.ts` の `as PipelineDeps` cast 除去、および `RuntimeStrategy.buildDeps` ポート戻り値の `PipelineDeps` 型付け — Finding 1・2 として報告済みの未完了実装のため、コンパイラによる検証不可。修正後に再検証が必要。
- **`_latestBuiltDeps` precondition** (Finding 4): `LocalRuntime.finalizeStepArtifacts` が `buildDeps()` 呼び出し前に呼ばれた場合のランタイム挙動は、capability contract test が structural fake を使用するため実際の `LocalRuntime` に対して直接検証されていない。

---

## Passing checks

The following acceptance criteria and test cases were confirmed satisfied:

| Item | Status |
|---|---|
| `deps.runtimeStrategy` removed from `PipelineDeps` (`types.ts`) | ✓ |
| executor.ts: zero `deps.runtimeStrategy` references | ✓ (TC-005) |
| pipeline.ts: zero `deps.runtimeStrategy` references, uses `deps.terminalState` | ✓ (TC-012) |
| parallel-review-round.ts: zero `deps.runtimeStrategy` references, uses `deps.roundGitEffects` | ✓ (TC-016) |
| step-completion.ts: zero `deps.runtimeStrategy` references, uses `deps.stepIo` | ✓ (TC-036) |
| `StepArtifactLifecycleCapability` methods all required except `snapshotMainCheckoutGuard?` | ✓ (TC-004) |
| `StepIoValidationCapability` methods all required | ✓ (TC-003) |
| `TerminalStateCapability.commitFinalState` signature typed (no `unknown`) | ✓ (TC-011) |
| `LocalRuntime.finalizeStepArtifacts` accepts typed `CommitPushInfra` (no `as CommitPushInfra`) | ✓ (TC-032, TC-033) |
| `RoundEgressParams` is a plain DTO with 3 expected fields | ✓ (TC-015) |
| `LocalRuntime.buildDeps` injects all 7 capability fields | ✓ (TC-027) |
| No new `as unknown as RuntimeStrategy` added | ✓ (TC-038) |
| R2a read-only capabilities not regressed to full facade | ✓ |
| `finalizeStepArtifacts` skipped when `roundOwnsGitEffects === true` | ✓ (TC-007) |
| `terminalState.commitFinalState` called in both pipeline terminal paths | ✓ (TC-009) |
| `executor-lifecycle-ordering.test.ts` added (TC-008, TC-013 coverage) | ✓ |
| Managed runtime no-op contract tests added | ✓ (TC-028, TC-030, TC-031) |
| Local runtime capability contract tests added | ✓ (TC-029) |
| architecture/components.md updated: R2b responsibilities, PipelineDeps not a service locator | ✓ (TC-042) |
| `bun run build` / `typecheck` / `test` / `lint` all pass | ✓ (TC-043–TC-046) |

---

## Summary

Two high-severity findings (F1, F2) are mechanically coupled: changing the `buildDeps` return type in the port interface from `unknown` to `PipelineDeps` (F1) and then removing the `as PipelineDeps` cast in `runner.ts` (F2) together satisfy TC-022 and TC-021. Both are one-line fixes that do not require structural changes.

One medium-severity finding (F3) concerns the optional-method pattern on `RoundGitEffectsCapability` that contradicts D6 and tasks.md T-03. It can be resolved by either making all methods required (with ManagedRuntime providing no-ops) or by having managed `buildDeps` inject `roundGitEffects: undefined`.

One low-severity finding (F4) is a design documentation gap: the `_latestBuiltDeps` side-channel is undocumented in the spec and imposes a hidden precondition on the capability. A decision on whether to endorse or eliminate this pattern is recommended.
