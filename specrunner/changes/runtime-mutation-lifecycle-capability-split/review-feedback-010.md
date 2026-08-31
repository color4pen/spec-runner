# Code Review — Iteration 10
# Runtime Mutation/Lifecycle Capability Split (R2b)

## Summary

The implementation successfully delivers the core R2b refactoring goals. The four target method signatures (`buildDeps`, `finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts`) have had domain-payload `unknown` eliminated; `PipelineDeps.runtimeStrategy` has been removed; and four new consumer-owned capability interfaces are in place. Architecture documentation accurately reflects the post-R2b model.

Two findings are raised below.

---

## Acceptance Criteria Checklist

| AC | Result | Notes |
|---|---|---|
| mutation/lifecycle consumers no longer depend on full `RuntimeStrategy` | ✅ | executor.ts, pipeline.ts, parallel-review-round.ts have 0 `deps.runtimeStrategy` references |
| `PipelineDeps` does not hold full facade as service locator | ✅ | `runtimeStrategy?` field removed; replaced by 4 typed capability fields |
| Capabilities are use-case-specific minimal contracts (no mega-interface) | ✅ | 4 narrow interfaces: `StepArtifactLifecycleCapability`, `StepIoValidationCapability`, `TerminalStateCapability`, `RoundGitEffectsCapability` |
| Capability methods are required; absence is via undefined field | ✅ | Only `snapshotMainCheckoutGuard?` is optional (fail-open semantics, documented) |
| `buildDeps`/`finalizeStepArtifacts`/`commitFinalState`/`commitRoundArtifacts` have no domain-payload `unknown` | ✅ | Port signatures now use `PipelineDeps`, `AgentStep`, `CommitPushInfra`, `JobState`, `RoundEgressParams` |
| `as PipelineDeps`, `as CommitPushInfra`, egress restore casts removed | ✅ | Confirmed: grep over `src/` finds zero occurrences |
| No new `as unknown as RuntimeStrategy` or equivalent forced cast added | ⚠️ | See Finding 1: `as never` used pervasively in test fakes (30+ sites) |
| R2a read-only capabilities not regressed to full facade | ✅ | R2a capabilities still in `PipelineDeps` as discrete fields; no regressive `runtimeStrategy` import |
| Command/step/commit lifecycle ordering fixed in executable tests | ✅ | `executor-lifecycle-ordering.test.ts` (TC-T15), `local-runtime-capabilities.test.ts`, `managed-runtime-capabilities.test.ts` |
| Local/Managed contract tests | ✅ | `local-runtime-capabilities.test.ts`, `managed-runtime-capabilities.test.ts` |
| Architecture docs match post-R2b model | ⚠️ | See Finding 2: StepExecutor and CommitOrchestrator entries still cite `RuntimeStrategy` as collaborator |
| SpecRunner verification green | ✅ | Per prior conformance results |
| Only changed files committed | ✅ |  |

---

## Findings

### Finding 1 — `as never` forced casts on `roundGitEffects` field in test fakes

**Severity**: medium  
**File**: `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts`  
**Representative line**: line 219 (`roundGitEffects: runtimeStrategy as never`)

**Observation**: The `makeRuntimeStrategy()` helper constructs a plain object with `vi.fn()` mocks and the result is assigned via `roundGitEffects: runtimeStrategy as never` in over 30 call sites throughout this test file. This `as never` pattern bypasses TypeScript structural checking and is equivalent to a forced cast, just using the bottom type instead of the two-step `as unknown as T`.

**Why it matters**: Acceptance criterion 7 says "新たな `as unknown as RuntimeStrategy` または同等の forced cast を追加していない" (no equivalent forced cast added). The architecture documentation (components.md line 174) states "test fake は必要な capability だけを構築でき、forced cast が不要になる". Using `as never` to assign to `roundGitEffects: RoundGitEffectsCapability` is still a forced cast — the fake object is not verified against the capability interface by the compiler.

**Concretely**: `makeRuntimeStrategy()` returns a plain `{...}` object. If it were directly typed as `RoundGitEffectsCapability`, the compiler would verify structural conformance. Instead, `as never` makes the compiler skip that verification. For example, `makeRuntimeStrategy()` also includes `finalizeStepArtifacts: vi.fn(...)` — a method not present on `RoundGitEffectsCapability`. The cast silences the mismatch.

**Fix path**: Declare the helper's return type as `RoundGitEffectsCapability` directly:

```ts
function makeRuntimeStrategy(opts: {...}): RoundGitEffectsCapability {
  const inspectionResult = ...;
  return {
    captureHeadSha: vi.fn(async () => "abc123"),
    listChangedFiles: vi.fn(async () => ({ kind: "success" as const, files: [] })),
    digestArtifacts: vi.fn(async (refs) => refs.map((r) => ({ path: r.path, hash: null }))),
    listWorktreeChanges: vi.fn(async () => inspectionResult),
    commitRoundArtifacts: vi.fn(async () => {}),
  };
}
```

Removing `finalizeStepArtifacts`, `validateStepInputs`, `validateStepOutputs` from the helper (not part of the capability), and using the explicit return type would eliminate all 30+ `as never` casts and restore compile-time verification of the fake's structural correctness.

---

### Finding 2 — `components.md` StepExecutor and CommitOrchestrator collaborator lists still cite `RuntimeStrategy`

**Severity**: low  
**File**: `architecture/components.md`  
**Lines**: 67 (StepExecutor), 73 (CommitOrchestrator)

**Observation**: 

- Line 67 (StepExecutor): "**協調**: AgentRunner（port）/ Step / CommitOrchestrator（永続）/ EventBus / **RuntimeStrategy（output gate）**。"
- Line 73 (CommitOrchestrator): "**協調**: StepExecutor / ParallelReviewRound（producer）/ JobStateStore（永続）/ **RuntimeStrategy（git seam）** / EventBus。"

After R2b, `StepExecutor` does not collaborate with `RuntimeStrategy` at all — it uses `deps.stepArtifact` (`StepArtifactLifecycleCapability`) and `deps.stepIo` (`StepIoValidationCapability`). Similarly, `CommitOrchestrator` uses the typed capabilities injected via `PipelineDeps`.

**Impact**: A reader of `components.md` consulting the StepExecutor or CommitOrchestrator sections would incorrectly conclude these components still depend on `RuntimeStrategy`, contradicting the R2b section (lines 171–183) and creating an internal inconsistency in the architecture document.

**Fix path**:
- Line 67: Replace "RuntimeStrategy（output gate）" with "StepArtifactLifecycleCapability / StepIoValidationCapability（PipelineDeps）"
- Line 73: Replace "RuntimeStrategy（git seam）" with "StepArtifactLifecycleCapability / RoundGitEffectsCapability（PipelineDeps）"

---

## Positive Observations (no action required)

- `buildDeps` now formally returns `PipelineDeps` in the `RuntimeStrategy` interface; the `import type { PipelineDeps }` allowlist entry is properly documented in `arch-allowlist.ts` with a clear rationale (T-05/T-12).
- `snapshotMainCheckoutGuard?` is the sole optional method on `StepArtifactLifecycleCapability` with a well-documented rationale (fail-open null != capability absence). This correctly implements D6.
- The `RoundEgressParams` DTO cleanly replaces the previous `unknown`-typed egress params without pulling domain entities into the port layer.
- The derive helpers (`deriveStepArtifactLifecycleCapability`, `deriveStepIoValidationCapability`, `deriveTerminalStateCapability`, `deriveRoundGitEffectsCapability`) follow the R2a bind-style pattern and are co-located with their capability interfaces per D5.
- `executor-lifecycle-ordering.test.ts` (354 lines) provides excellent executable coverage for the TC-T15 ordering invariants, including the `roundOwnsGitEffects` gate and `prepareStepArtifacts`-before-runner ordering.
- Managed runtime no-op semantics are preserved and exercised by `managed-runtime-capabilities.test.ts` including TC-028 (real `ManagedRuntime.buildDeps` instantiation with mock clients).
- `as unknown as RuntimeStrategy` count reduced from 4 to 2 (net improvement; no new occurrences added).

---

## 検証した項目

- `src/core/step/step-capability.ts` — `StepArtifactLifecycleCapability` / `StepIoValidationCapability` インターフェース定義、derive helpers の実装を確認
- `src/core/pipeline/pipeline-capability.ts` — `TerminalStateCapability` / `RoundGitEffectsCapability` / `RoundEgressParams` の定義を確認
- `src/core/types.ts` — `PipelineDeps.runtimeStrategy` の除去と 4 つの typed capability フィールドへの置き換えを確認
- `src/core/port/runtime-strategy.ts` — `finalizeStepArtifacts` / `commitFinalState` / `commitRoundArtifacts` の interface からの除去、`buildDeps(): PipelineDeps` の型付きシグネチャを確認; `unknown` token が `query()` の `AsyncGenerator<unknown>` と `CleanupHandle` のみであることを確認
- `src/core/command/runner.ts` — `deps = this.runtime.buildDeps(...)` に `as PipelineDeps` キャストがないことを確認
- `src/core/pipeline/pipeline.ts` — `deps.terminalState?.commitFinalState(deps.cwd, deps.slug, state)` の 2 箇所を確認; `deps.runtimeStrategy` 参照ゼロを確認
- `src/core/step/executor.ts` — `deps.runtimeStrategy` 参照ゼロ; `deps.stepArtifact?.finalizeStepArtifacts(step, stateForFinalize, cwd, deps.slug, headForFinalize, {...})` の型付き呼び出しを確認
- `src/core/pipeline/parallel-review-round.ts` — `deps.runtimeStrategy` 参照ゼロ; `deps.roundGitEffects` 経由の呼び出しを確認
- `src/core/runtime/local.ts` — `deriveStepArtifactLifecycleCapability` / `deriveStepIoValidationCapability` / `deriveTerminalStateCapability` / `deriveRoundGitEffectsCapability` の import と buildDeps での使用を確認; `finalizeStepArtifacts(step: AgentStep, state: JobState, cwd: string, slug: string, ...)` の typed signature を確認
- `src/core/runtime/managed.ts` — managed runtime の no-op 実装が capability interface に適合することを確認
- `tests/unit/architecture/arch-allowlist.ts` — `T-05-T-12-buildDeps-PipelineDeps-return-type` DSM allowlist エントリを確認
- `src/core/runtime/__tests__/local-runtime-capabilities.test.ts` — capability contract tests (TC-T14) を確認; forced cast なし
- `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts` — managed no-op semantics contract tests を確認; TC-028 (real ManagedRuntime instantiation) を確認
- `tests/unit/step/executor-lifecycle-ordering.test.ts` — TC-T15-01 (cwd/slug string primitives), TC-T15-02 (roundOwnsGitEffects gate) を確認
- `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts` — `as never` 強制キャストの pervasive 使用 (30+ 箇所) を確認; Finding 1 として記録
- `architecture/components.md` — R2b セクション (lines 171–183) の正確性を確認; StepExecutor / CommitOrchestrator 協調ラベルの旧記述 (lines 67, 73) を確認; Finding 2 として記録
- `src/` ツリー全体: `as PipelineDeps` / `as CommitPushInfra` / `as unknown as RuntimeStrategy` を grep で確認 — production ファイルにゼロ件

---

## 検証できなかった項目

- SpecRunner verification (typecheck / build / test / lint) の実行結果 — 先行 conformance result を正本として採用; 本レビューでは重複実行しない（request 指示に従う）
- TC-039 / TC-040 (provider readiness / duplicate-job guard の ordering) — CommandRunner 単体テストで coverage されているが、今回のレビュー範囲でコード追跡まで実施していない
- TC-041 (reloadJobState timing on run vs resume path) — 同上、テスト存在は確認済みだが詳細追跡は省略
