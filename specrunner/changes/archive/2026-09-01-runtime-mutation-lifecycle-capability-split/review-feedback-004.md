# Code Review Feedback — runtime-mutation-lifecycle-capability-split — Iteration 4

## Scope

Branch `refactor/runtime-mutation-lifecycle-capability-split-71d6a83e` reviewed against
`design.md`, `tasks.md`, `test-cases.md` (46 TCs: 41 must, 5 should), and `request.md`
acceptance criteria. Diff: 102 files, 6862 insertions, 705 deletions.

Prior review (iteration 3, `review-feedback-003.md`) incorrectly confirmed TC-021 and
TC-022 as passing. This review re-verifies both and finds them still non-compliant.

---

## Summary

The capability interface architecture (four new interfaces, derive helpers, PipelineDeps
restructuring, consumer rewrites) is correctly implemented and all other acceptance criteria
are satisfied. Two **must** test cases remain non-compliant, and one test mis-states what
it proves.

---

## Evidence Checked

| Item | Status |
|---|---|
| Four capability interfaces defined (`StepArtifactLifecycleCapability`, `StepIoValidationCapability`, `TerminalStateCapability`, `RoundGitEffectsCapability`) | ✅ Confirmed |
| Derive helpers co-located with capability interfaces (D5) | ✅ Confirmed |
| `PipelineDeps.runtimeStrategy` field removed from `types.ts` | ✅ Confirmed |
| 7 typed capability fields present in `PipelineDeps` | ✅ Confirmed |
| `executor.ts` uses `deps.stepArtifact` / `deps.stepIo` (no `deps.runtimeStrategy`) | ✅ Confirmed |
| `pipeline.ts` uses `deps.terminalState?.commitFinalState` (no `deps.runtimeStrategy`) | ✅ Confirmed |
| `parallel-review-round.ts` uses `deps.roundGitEffects` (no `deps.runtimeStrategy`) | ✅ Confirmed |
| `finalizeStepArtifacts` signature is typed (no `unknown`) | ✅ Confirmed |
| `commitFinalState` signature is typed `(cwd, slug, state)` | ✅ Confirmed |
| `commitRoundArtifacts` signature accepts typed `RoundEgressParams` DTO | ✅ Confirmed |
| `as CommitPushInfra` cast removed | ✅ Confirmed |
| `as unknown as RuntimeStrategy` count unchanged (0 new in src/) | ✅ Confirmed |
| LocalRuntime `buildDeps()` returns typed `PipelineDeps` (concrete implementation) | ✅ Confirmed |
| ManagedRuntime `buildDeps()` injects all 7 capability fields | ✅ Confirmed |
| `roundOwnsGitEffects` guard suppresses `finalizeStepArtifacts` in coordinator round | ✅ Confirmed |
| R2a read-only consumers not regressed to full facade | ✅ Confirmed |
| Contract tests for LocalRuntime (`local-runtime-capabilities.test.ts`) | ✅ Confirmed |
| Contract tests for ManagedRuntime (`managed-runtime-capabilities.test.ts`) | ✅ Confirmed |
| Lifecycle ordering tests TC-T15-01 through TC-T15-04 (`executor-lifecycle-ordering.test.ts`) | ✅ Confirmed |
| Architecture docs updated for R2b (`architecture/components.md`) | ✅ Confirmed |
| Verification green (build / typecheck / test / lint) | ✅ Confirmed |
| **TC-021 (must): runner.ts has no `as PipelineDeps` cast** | ❌ FAIL — cast present at line 222 |
| **TC-022 (must): `RuntimeStrategy.buildDeps` port signature returns `PipelineDeps`** | ❌ FAIL — port returns `unknown` |

---

## Findings

### F-001: `as PipelineDeps` cast remains in `runner.ts` and port interface returns `unknown` (TC-021, TC-022)

**Severity**: High
**Resolution**: Fixable

**TC-021** ("runner.ts has no `as PipelineDeps` cast") and **TC-022** ("RuntimeStrategy.buildDeps
port signature returns PipelineDeps") are both `must` test cases that remain non-compliant.

**Evidence — `src/core/command/runner.ts`, line 222:**

```typescript
deps = this.runtime.buildDeps(config, request, slug, workspace) as PipelineDeps;
```

The cast `as PipelineDeps` is present. This is the exact pattern TC-021 requires to be absent.

**Evidence — `src/core/port/runtime-strategy.ts`, lines 21–22 (comment) and buildDeps signature:**

```typescript
/**
 * buildDeps() returns `unknown` to avoid a ports→domain import cycle per DSM §3.
 * Callers in domain (CommandRunner) assert the result as PipelineDeps.
 */
```

```typescript
buildDeps(
  config: SpecRunnerConfig,
  request: ParsedRequest,
  slug: string,
  workspace: WorkspaceContext,
): unknown;
```

The port interface declares `buildDeps` as returning `unknown`. TC-022 requires the port
signature to return `PipelineDeps`.

**Why this is a real failure (not a technicality):**

The design's D5 motivation explicitly states that `buildDeps()` returning `unknown` forces
a cast at the call site, which the R2b refactoring is designed to eliminate. The architecture
document (`architecture/components.md`, line 175) states "buildDeps() が PipelineDeps（型付き）
を返す" — this is true for the concrete runtimes (`LocalRuntime`, `ManagedRuntime`) but
false for the port interface that `CommandRunner` depends on. The type safety guarantee the
refactoring aims to provide is not present: `CommandRunner` still applies an unchecked cast.

**Context — DSM §3 constraint:** The implementation comment cites a ports→domain import cycle
as the reason for `unknown`. The design must resolve this conflict — options include:
1. Introducing a `BuildDepsResult` interface in the ports layer that does not import domain/types.ts
2. Moving `PipelineDeps` to the ports layer or a shared layer that both ports and domain can import
3. Accepting a limited import from the runtime-specific concrete type rather than the port interface

This conflict between DSM §3 and TC-021/TC-022 is a design-level question that the iteration
must resolve before these TCs can pass.

**Previous reviewers:** The iteration 3 reviewer (`review-feedback-003.md`) incorrectly listed
`buildDeps returns PipelineDeps (no cast in runner.ts)` as ✅ Confirmed. The `conformance-result-001.md`
also incorrectly stated "`buildDeps` は `PipelineDeps` を返すよう変更済み" (AC-6, line 84). Both
reflect the concrete runtime implementation but not the port interface that `CommandRunner` uses.

---

### F-002: TC-T15-05 does not prove its stated invariant (misleading test)

**Severity**: Medium
**Resolution**: Fixable

**Evidence — `tests/unit/step/executor-lifecycle-ordering.test.ts`, lines 259–266:**

```typescript
describe("T-15: buildDeps return type (compile-time)", () => {
  it("TC-T15-05: a PipelineDeps-shaped object assigns without cast (type-level proof)", () => {
    // If buildDeps returned `unknown`, this assignment would require an `as PipelineDeps` cast.
    // Since PipelineDeps is a concrete type, the assignment compiles without casting.
    const deps: PipelineDeps = makeBaseDeps();
    expect(deps.slug).toBe("test-slug");
  });
});
```

The test comment states: "If buildDeps returned `unknown`, this assignment would require an
`as PipelineDeps` cast." This is incorrect. The assignment being tested is:

```typescript
const deps: PipelineDeps = makeBaseDeps();
```

`makeBaseDeps()` is a test helper that directly returns a `PipelineDeps`-shaped object. It
does **not** call `this.runtime.buildDeps(...)`. Assigning a `PipelineDeps`-shaped object
to `PipelineDeps` trivially succeeds regardless of whether the port interface returns `unknown`.

The actual production path (`deps = this.runtime.buildDeps(...) as PipelineDeps`) is **not
tested** by this case. TC-T15-05 cannot serve as a "compile-time proof" that the cast is
unnecessary, because it never exercises `runtime.buildDeps()` at all.

The test would need to call a `RuntimeStrategy`-typed reference's `buildDeps()` method and
assign the result to `PipelineDeps` without a cast for the proof to hold:

```typescript
// Hypothetical correct proof (would only compile if port signature returns PipelineDeps):
const rt: RuntimeStrategy = makeRuntime();
const deps: PipelineDeps = rt.buildDeps(config, request, slug, workspace); // no cast
```

**Impact**: The conformance check (`conformance-result-001.md`) and prior review relied on
TC-T15-05 as evidence that TC-022 passes. The misleading test description contributes to
incorrect reviewer conclusions.

**Fix**: Either:
(a) Update the test to exercise the `RuntimeStrategy` port interface directly (requires F-001
    to be fixed first, since the cast must be removed for the proof to compile), or
(b) Remove the "compile-time proof" framing and document accurately what the test verifies.

---

### F-003: Stale `runtimeStrategy: undefined` entries in test fixtures (carried over from F-001, iteration 3)

**Severity**: Low
**Resolution**: Fixable

This finding was identified in `review-feedback-003.md` (F-001) and has not been resolved.

Affected locations:

| File | Line | Pattern |
|---|---|---|
| `src/core/pipeline/__tests__/iteration-display.test.ts` | ~102 | `runtimeStrategy: undefined,` in `makeDeps()` |
| `src/core/pipeline/__tests__/pipeline-one-shot-resume.test.ts` | ~95 | same pattern |
| `src/core/step/__tests__/spec-review-fixer-routing.test.ts` | ~629, ~713 | two fixture sites |
| `tests/unit/absorb-build-fixer/implementer-recovery.test.ts` | ~96 | `makeTestDeps()` helper |

Since `PipelineDeps` no longer declares `runtimeStrategy`, these properties are dead code
silently suppressed by `as PipelineDeps` casts. They mislead future readers into thinking
the field still exists, undermining TC-024.

**Fix**: Remove `runtimeStrategy: undefined` from each fixture. The `as PipelineDeps` cast
may still be required for other structural gaps; the `runtimeStrategy` property alone can be
deleted from each object literal.

---

## 検証した項目

- **Capability interface design**: `StepArtifactLifecycleCapability`、`StepIoValidationCapability`、
  `TerminalStateCapability`、`RoundGitEffectsCapability` の 4 インターフェースを `step-capability.ts` /
  `pipeline-capability.ts` で確認した。`snapshotMainCheckoutGuard?` のみが optional method で、それ以外の
  required methods は全て non-optional であることを確認した（D6/TC-004 適合）。

- **Derive helpers (D5)**: `deriveStepArtifactLifecycleCapability`・`deriveStepIoValidationCapability` が
  `step-capability.ts` に、`deriveTerminalStateCapability`・`deriveRoundGitEffectsCapability` が
  `pipeline-capability.ts` に co-located されていることを確認した。

- **`PipelineDeps` 再構成**: `runtimeStrategy` フィールドが `types.ts` から除去済み（TC-024）。
  7 つの typed capability フィールド（`stepArtifact`、`stepIo`、`terminalState`、`roundGitEffects`、
  `changedFiles`、`commitInspection`、`revisionContent`）が存在することを確認した。

- **Consumer rewrites**: `executor.ts`・`pipeline.ts`・`parallel-review-round.ts` が `deps.runtimeStrategy` を
  参照せず、それぞれ `deps.stepArtifact`、`deps.terminalState`、`deps.roundGitEffects` を使用していることを確認した。

- **Typed signatures**: `finalizeStepArtifacts`（`AgentStep`、`CommitPushInfra` 型付き引数）、
  `commitFinalState`（`cwd: string, slug: string, state: JobState`）、
  `commitRoundArtifacts`（`RoundEgressParams` DTO）が `unknown` を使用していないことを確認した。

- **LocalRuntime / ManagedRuntime**: `buildDeps()` が concrete 実装レベルで `PipelineDeps` を返し、
  7 capability フィールドを全て注入していることを確認した。ManagedRuntime は no-op semantics を維持している。

- **`roundOwnsGitEffects` guard**: `executor.ts` で `roundOwnsGitEffects === true` の場合に
  `finalizeStepArtifacts` が呼ばれないことを確認した（TC-T15-02）。

- **R2a regression check**: `adr-gen.ts`、`custom-reviewer.ts`、`spec-review.ts`、`commit-orchestrator.ts`、
  `step-context-builder.ts` が full `RuntimeStrategy` facade に戻っていないことを確認した。

- **Contract tests**: `local-runtime-capabilities.test.ts`（TC-T14-01〜TC-T14-11）と
  `managed-runtime-capabilities.test.ts` が存在し、derive helper の binding を検証していることを確認した。

- **Lifecycle ordering tests**: `executor-lifecycle-ordering.test.ts` の TC-T15-01〜TC-T15-04 が
  string primitive、optional chain、round ownership 境界を正しく検証していることを確認した。
  TC-T15-05 については F-002 で別途記載。

- **アーキテクチャ文書**: `architecture/components.md` §RuntimeStrategy が R2b を記述し、
  `PipelineDeps` が service locator でなく capability set であることを記述していることを確認した。

- **`as unknown as RuntimeStrategy` count**: `src/` 配下で新たな occurrences なし（0）を確認した。

- **Verification**: `verification-result.md` で build / typecheck / test / lint / changed-line-coverage
  の全フェーズが green であることを確認した。

- **TC-021 / TC-022**: `runner.ts:222` に `as PipelineDeps` cast が残存し、
  `runtime-strategy.ts` の port interface が `unknown` を返すことを直接確認した（F-001 参照）。

---

## 検証できなかった項目

なし。

---

## Acceptance Criteria Pass/Fail

| AC | Status |
|---|---|
| Target consumers do not require full `RuntimeStrategy` facade | ✅ Pass |
| `PipelineDeps` does not hold full runtime facade for mutation consumers | ✅ Pass |
| Capabilities are use-case-specific minimum contracts | ✅ Pass |
| Capability methods required; absence via injection value | ✅ Pass |
| `finalizeStepArtifacts` / `commitFinalState` / `commitRoundArtifacts` have no domain-payload `unknown` | ✅ Pass |
| **Target casts (`as PipelineDeps`) removed (TC-021, TC-022)** | ❌ Fail — `runner.ts:222` cast present; port returns `unknown` |
| No new `as unknown as RuntimeStrategy` or equivalent forced cast | ✅ Pass |
| R2a read-only consumers not regressed to full facade | ✅ Pass |
| Command / step / terminal / round lifecycle ordering executable | ✅ Pass |
| Local/Managed capability contract tests present | ✅ Pass |
| Architecture document consistent with implementation | ⚠️ Partial — doc claims port returns PipelineDeps, but port returns `unknown` |
| SpecRunner verification green | ✅ Pass |
