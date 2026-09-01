# Code Review Feedback — runtime-mutation-lifecycle-capability-split — iter 5

## Scope

Reviewed against: `design.md`, `tasks.md`, `test-cases.md`, and the full diff in the change folder.
Verification result (iter 1): all phases passed (build / typecheck / test / lint / changed-line-coverage).

Reference baseline: `main@660d48fb` (PR #1102 merge commit).

---

## Finding 1 — HIGH · fixable

**`RuntimeStrategy.buildDeps` still returns `unknown` in the port interface; `as PipelineDeps` cast remains in `runner.ts:222`**

`src/core/port/runtime-strategy.ts:388–394`, `src/core/command/runner.ts:222`

```typescript
// runtime-strategy.ts (port interface)
buildDeps(
  config: SpecRunnerConfig,
  request: ParsedRequest,
  slug: string,
  workspace: WorkspaceContext,
): unknown;   // ← still unknown

// runner.ts
deps = this.runtime.buildDeps(config, request, slug, workspace) as PipelineDeps;  // ← cast remains
```

Design D3 states: "After D2 breaks the cycle, `RuntimeStrategy.buildDeps` can declare its return type as `PipelineDeps` instead of `unknown`. The `as PipelineDeps` cast at runner.ts line 222 is eliminated." D2 was implemented (removing `runtimeStrategy?: RuntimeStrategy` from `PipelineDeps`), which breaks the `types.ts → runtime-strategy.ts` dependency. After D2, `types.ts` no longer imports from `runtime-strategy.ts`, so there is no circular dependency.

However, adding `import type { PipelineDeps } from "../types.js"` to `runtime-strategy.ts` (port layer) creates a `port → domain` edge. The conformance step enforces a DSM §3 closure rule: ports may only import from shared-kernel and leaf, not domain. This prevents D3 from being implemented as designed, even though the circular reference has been broken.

**This is not a Stop Condition** per the issue's list, but it is a constraint that prevents the AC from being met without either (a) moving `PipelineDeps` to the shared-kernel/port layer, or (b) accepting the DSM §3 exception. The implementation chose neither — it left `unknown` and documented it as DSM §3-compliant in the JSDoc.

**Violated constraints:**
- Acceptance criterion: "対象境界の `as PipelineDeps`、`as CommitPushInfra`、egress params 復元 cast が除去される"
- TC-022 (must): "the return type is `PipelineDeps` (not `unknown`), and the file imports `PipelineDeps` from `../types.js` without creating a circular dependency"
- tasks.md T-05 (marked `[x]` done but not implemented): "Change `buildDeps(config, request, slug, workspace): unknown` to `buildDeps(config, request, slug, workspace): PipelineDeps`"
- tasks.md T-12 (marked `[x]` done but not implemented): "Remove the `as PipelineDeps` cast (line 222)"

**Note on TC-T15-05**: The test `executor-lifecycle-ordering.test.ts` contains test TC-T15-05 which explicitly validates that `buildDeps` returns `unknown` and callers use `as PipelineDeps` as "DSM §3 compliance." This test was written to document the decision NOT to implement D3, but it directly contradicts TC-021 and TC-022 in `test-cases.md` (both MUST priority). Neither TC-021 nor TC-022 have a corresponding test that validates their specified behavior; TC-T15-05 tests the inverse.

**Fix options:**
1. Move `PipelineDeps` to `src/core/port/types.ts` (shared-kernel/port layer) to satisfy DSM §3, then change the return type on the interface and remove the cast.
2. Add a DSM §3 exception annotation for this specific import and implement D3 as designed.
3. If neither fix is acceptable, document the Stop Condition in the issue, update test-cases.md TC-021/TC-022 to reflect the correct (current) behavior, and align TC-T15-05 with the updated spec.

---

## Finding 2 — MEDIUM · fixable

**Architecture doc inconsistency: `components.md` says `buildDeps()` returns `PipelineDeps` (型付き), but the RuntimeStrategy interface returns `unknown`**

`architecture/components.md:175`

```markdown
`LocalRuntime` / `ManagedRuntime` は `RuntimeStrategy`（`RealRuntimeStrategy`）を implements し、
`buildDeps()` が `PipelineDeps`（型付き）を返す。
```

This statement is accurate for the *concrete implementations* (`LocalRuntime.buildDeps` and `ManagedRuntime.buildDeps` both declare `PipelineDeps` as their return type). However, the *`RuntimeStrategy` interface* declares `buildDeps(): unknown`. A reader of the architecture doc would conclude that `buildDeps` returns typed `PipelineDeps` at the interface level, which is incorrect.

The doc does not distinguish between the interface return type and the concrete return type. This matters because `runner.ts` (which calls `buildDeps` through the interface) still requires the `as PipelineDeps` cast for compilation.

**Fix:** Add a clarifying note to `components.md` distinguishing between the interface-level (`unknown`, DSM §3 constraint) and the concrete-implementation-level (`PipelineDeps`). For example:

> `RuntimeStrategy.buildDeps()` は port-layer インターフェースでは DSM §3 制約により `unknown` を返す。`runner.ts` は `as PipelineDeps` でキャストする。`LocalRuntime` / `ManagedRuntime` の具体実装は `PipelineDeps` を返す（concrete covariant return）。

---

## 検証した項目

The following acceptance criteria and test-case must items were confirmed:

| Item | Status | Evidence |
|---|---|---|
| `PipelineDeps.runtimeStrategy` removed from `types.ts` | ✓ | Zero occurrences of `runtimeStrategy` in `PipelineDeps` |
| `finalizeStepArtifacts` removed from `RuntimeStrategy` interface | ✓ | Only in JSDoc comments, not method declarations |
| `commitFinalState` removed from `RuntimeStrategy` interface | ✓ | Only in JSDoc comments |
| `commitRoundArtifacts` removed from `RuntimeStrategy` interface | ✓ | Only in JSDoc comments |
| `StepArtifactLifecycleCapability` defined with required methods (except `snapshotMainCheckoutGuard?`) | ✓ | `step-capability.ts:36–94` |
| `StepIoValidationCapability` all methods required | ✓ | `step-capability.ts:108–139` |
| `TerminalStateCapability.commitFinalState` is typed `(cwd: string, slug: string, state: JobState)` | ✓ | `pipeline-capability.ts:63` |
| `RoundGitEffectsCapability` all 5 methods required (Finding 3 from iter 1 fixed) | ✓ | `pipeline-capability.ts:80–142` |
| `executor.ts` zero `deps.runtimeStrategy` references | ✓ | grep confirms 0 |
| `pipeline.ts` uses `deps.terminalState?.commitFinalState(cwd, slug, state)` | ✓ | lines 399, 623 |
| `parallel-review-round.ts` uses `deps.roundGitEffects` | ✓ | throughout `run()` method |
| `as CommitPushInfra` removed from production src/ | ✓ | Only in test files |
| Egress params typed via `RoundEgressParams` DTO (no `unknown`) | ✓ | `pipeline-capability.ts:34–38` |
| No `as unknown as RuntimeStrategy` introduced | ✓ | grep confirms 0 in src/ |
| R2a capabilities (`changedFiles`, `commitInspection`, `revisionContent`) not regressed | ✓ | Still present in `PipelineDeps` |
| `_latestBuiltDeps` replaced with stable `_currentConfig`/`_currentRequest` fields (Finding 4 from iter 1 resolved) | ✓ | `local.ts:159–160` |
| Derive helpers co-located with capability interfaces (D5) | ✓ | `step-capability.ts:161–199`, `pipeline-capability.ts:148–194` |
| Lifecycle ordering tests (TC-T15-01 through TC-T15-04) | ✓ | `executor-lifecycle-ordering.test.ts` |
| Capability contract tests for LocalRuntime (T-14) | ✓ | `local-runtime-capabilities.test.ts` |
| Capability contract tests for ManagedRuntime (T-14) | ✓ | `managed-runtime-capabilities.test.ts` |
| TC-028: ManagedRuntime.buildDeps injects all R2b capability fields | ✓ | `managed-runtime-capabilities.test.ts:246–280` |
| `roundOwnsGitEffects` gate: `finalizeStepArtifacts` skipped for coordinator members | ✓ | TC-T15-02 |

---

## 検証できなかった項目

- **TC-021** (must): "runner.ts has no `as PipelineDeps` cast" — the cast is still present; this TC cannot be verified as passing.
- **TC-022** (must): "RuntimeStrategy.buildDeps port signature returns `PipelineDeps`" — the interface still returns `unknown`; this TC cannot be verified as passing.

These two MUST cases were blocked by the DSM §3 constraint described in Finding 1. No corresponding tests exist that validate these cases as specified in `test-cases.md`.

---

## 実測 (Measurements at iter 5)

Based on code inspection (not re-running metrics):

| Metric | Before (R2a baseline) | After (R2b) | Delta |
|---|---|---|---|
| `src/core/port/runtime-strategy.ts` lines | 875 | ~800 | -75 (mutation methods removed) |
| `unknown` payload params in target signatures | `finalizeStepArtifacts`: 3, `commitFinalState`: 2, `commitRoundArtifacts`: 2 = **7** | 0 (all moved to capabilities) | **-7** |
| `buildDeps` return type in interface | `unknown` | `unknown` (unchanged — DSM §3) | 0 |
| `as PipelineDeps` in production src/ | 1 (`runner.ts:222`) | 1 (`runner.ts:222`) | 0 (unchanged) |
| `as CommitPushInfra` in production src/ | unknown | 0 | improved |
| egress params restore cast in production src/ | present | 0 | improved |
| `PipelineDeps.runtimeStrategy` field | present | absent | ✓ removed |
| New capability interfaces | 0 | 4 | +4 |
| Capability contract tests | 0 | 30+ | improved |
| New lifecycle ordering tests | 0 | 4 | +4 |

---

## Summary

The implementation successfully delivers the core R2b objective: mutation/lifecycle consumers (`StepExecutor`, `Pipeline`, `ParallelReviewRound`) no longer depend on the full `RuntimeStrategy` facade and instead use narrow, typed capability interfaces. All domain-payload `unknown` parameters from `finalizeStepArtifacts`, `commitFinalState`, and `commitRoundArtifacts` have been eliminated. The `PipelineDeps.runtimeStrategy` service-locator field has been removed. Capability contract tests and lifecycle ordering tests are in place. Previous review findings (optional methods on `RoundGitEffectsCapability`, `_latestBuiltDeps` coupling) have been resolved.

One acceptance criterion remains unmet: the `as PipelineDeps` cast in `runner.ts` and the `unknown` return type on the `RuntimeStrategy` interface persist due to a DSM §3 constraint that prevents the port layer from importing from the domain layer. The implementation documentes this as intentional via TC-T15-05 and JSDoc, but:
1. TC-021 and TC-022 (both MUST priority in `test-cases.md`) have no tests that verify their stated behavior.
2. The architecture doc (`components.md`) does not distinguish the interface-level `unknown` from the concrete-implementation-level `PipelineDeps`, which is misleading.

These two issues are the actionable items for this review cycle.
