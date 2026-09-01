# Review Feedback — Iteration 013

## Summary

Iteration 013 introduces two targeted improvements over the iteration 012 baseline:

1. **`local.ts` closure-capture refactor**: Removed the mutable `_currentConfig` / `_currentRequest` instance fields that carried a hidden ordering precondition (`buildDeps` had to be called before `finalizeStepArtifacts`). Replaced with a private `buildStepArtifactCapability(config, request)` method that captures both values in a closure at capability-construction time. The guarded throw `"buildDeps must be called before finalizeStepArtifacts"` is eliminated.

2. **`types.ts` required-with-undefined field declaration**: Changed R2b capability fields from optional (`stepArtifact?: StepArtifactLifecycleCapability`) to required with explicit undefined union (`stepArtifact: StepArtifactLifecycleCapability | undefined`). All test files that construct `PipelineDeps` without forced casts were updated to set the four fields explicitly.

No new issues were introduced. All Acceptance Criteria verified below remain satisfied.

---

## Changes Verified (iteration 013 diff only)

| File | Change | Assessment |
|---|---|---|
| `src/core/runtime/local.ts` | Remove `_currentConfig`/`_currentRequest`; add `buildStepArtifactCapability` private method with closure capture | ✓ Correct. Eliminates hidden ordering precondition. |
| `src/core/types.ts` | `stepArtifact?` → `stepArtifact: … | undefined` (and same for `stepIo`, `terminalState`, `roundGitEffects`) | ✓ Correct. Enforces explicit declaration; matches D6. |
| Test files (parallel-round, executor-*, step-context-builder, etc.) | Added `stepArtifact: undefined, stepIo: undefined, terminalState: undefined, roundGitEffects: undefined` to `makeDeps` / inline objects | ✓ Correct. Satisfies required-with-undefined contract. |

---

## Findings

### Observation (low, pre-existing, not introduced by this iteration)

**File**: `src/core/step/__tests__/spec-review-prior-round-context.test.ts` (lines 297, 328, 705, 745, 767, 831) and `src/core/step/__tests__/custom-reviewer-step.test.ts` (lines 422, 445)

**Title**: Stale `runtimeStrategy: unknown` parameter name in test type-cast expressions for `prepareRoundContext`

**Detail**: These test files use bracket-access to retrieve `prepareRoundContext` from the step record and cast the result with a function type that still names the third parameter `runtimeStrategy: unknown`. The production implementation in `spec-review.ts` and `custom-reviewer.ts` now correctly names the third parameter `commitInspection: CommitInspectionCapability | undefined`.

```ts
// Current (stale name in type cast):
const prepareRoundContext = SpecReviewStepRecord["prepareRoundContext"] as ((
  state: JobState,
  cwd: string,
  runtimeStrategy: unknown,   // ← stale parameter name
) => Promise<Partial<DynamicContext> | null>) | undefined;

// Production signature in spec-review.ts:
async prepareRoundContext(
  state: JobState,
  cwd: string,
  commitInspection: CommitInspectionCapability | undefined,   // ← current
): Promise<Partial<DynamicContext> | null>
```

**Why not a defect**: The `unknown` type accepts any value, so tests pass the correct `CommitInspectionCapability`-shaped objects and `undefined` without runtime errors. The `makeFakeRuntimeStrategy` in `spec-review-prior-round-context.test.ts` correctly returns an object typed as `CommitInspectionCapability`. All tests pass.

**Origin**: These casts were present in commit `aa3ad4cf` (pre-branch, introduced when the spec-review prior-round-context feature was originally implemented). Iteration 013 only touched these files to add the four required capability fields to `makeDeps`. The stale cast was not introduced by this branch.

**Status**: Iteration 012 reviewer accepted this pattern. No action required; noted for future cleanup.

---

## 検証した項目

- `src/core/runtime/local.ts`:
  - `_currentConfig` / `_currentRequest` フィールド削除確認 ✓
  - `buildStepArtifactCapability` private method が config / request を closure capture ✓
  - `doFinalizeStepArtifacts` に `config`, `request` が明示引数として渡される ✓
  - guarded throw `"buildDeps must be called before finalizeStepArtifacts"` 除去 ✓
- `src/core/types.ts`:
  - `stepArtifact`, `stepIo`, `terminalState`, `roundGitEffects` が `?: Capability` → `: Capability | undefined` ✓
  - `runtimeStrategy?: RuntimeStrategy` フィールドが存在しない（コメント以外）✓
- 対象 4 signature の domain-payload `unknown`:
  - `buildDeps()` → `PipelineDeps` (not `unknown`) ✓
  - `finalizeStepArtifacts(step: AgentStep, state, cwd: string, slug: string, head, infra: CommitPushInfra)` ✓
  - `commitFinalState(cwd: string, slug: string, state: JobState)` ✓
  - `commitRoundArtifacts(stagePaths, cwd, branch, coordinatorName, slug, infra: CommitPushInfra, egressParams?: RoundEgressParams)` ✓
- `as PipelineDeps` / `as CommitPushInfra` / egress restore cast: production `src/core/command/` に 0 件 ✓
- `as unknown as RuntimeStrategy`: `tests/pipeline-sole-committer-e2e.test.ts` に 2 件のみ（baseline 減、新規追加なし）✓
- Verification result: passed（typecheck, build, test, lint すべて 0 エラー）✓

## 検証できなかった項目

- SpecRunner verification（typecheck / build / test / lint）の再実行 — PR 上の既存証跡（`verification-result.md`、Verdict: passed、831 test files, 12606 tests passed）を正本とし、レビュー側での重複実行は行わない（TC-043〜046 gate）

---

## Acceptance Criteria — all verified ✓

| AC | Verification |
|---|---|
| 対象 consumer が full `RuntimeStrategy` を要求しない | `executor.ts`, `pipeline.ts`, `parallel-review-round.ts`, `step-completion.ts` — `deps.runtimeStrategy` 参照ゼロ ✓ |
| `PipelineDeps` が full runtime facade を service locator として保持しない | `runtimeStrategy?: RuntimeStrategy` フィールドなし ✓ |
| capability が use-case-specific な最小契約 | 4 capability interface (`StepArtifactLifecycleCapability`, `StepIoValidationCapability`, `TerminalStateCapability`, `RoundGitEffectsCapability`) ✓ |
| capability method は required | `snapshotMainCheckoutGuard?` 以外全 required ✓ |
| 対象 payload に domain `unknown` が残らない | buildDeps/finalizeStepArtifacts/commitFinalState/commitRoundArtifacts ✓ |
| 対象 cast が除去される | `as PipelineDeps` / `as CommitPushInfra` / egress restore cast ゼロ ✓ |
| 新たな `as unknown as RuntimeStrategy` を追加していない | `src/` tree: 0件 ✓ |
| R2a read-only leaf consumer が full facade 依存へ戻っていない | ✓ (unchanged) |
| lifecycle 順序・失敗境界が executable test で固定 | `executor-lifecycle-ordering.test.ts` ✓ |
| Local/Managed capability contract test がある | `local-runtime-capabilities.test.ts`, `managed-runtime-capabilities.test.ts` ✓ |
| architecture 文書が実装後の責務と依存方向に一致する | `components.md` — R2a/R2b capabilities, `PipelineDeps` service locator 廃止, Local/Managed 差異の閉じ込め 明示 ✓ |
| SpecRunner verification が green | Verdict: passed (iteration 21 verification result) ✓ |
| 変更ファイルだけが commit される | scope 外の未追跡ファイルなし ✓ |
