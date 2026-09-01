# Review Feedback — Iteration 011

## Summary

The R2b capability split is substantially complete. All four target capability interfaces
(`StepArtifactLifecycleCapability`, `StepIoValidationCapability`, `TerminalStateCapability`,
`RoundGitEffectsCapability`) are correctly defined in their consumer-domain layers, injected
via `PipelineDeps` typed fields, and wired through `derive*Capability` helpers per D5.
The `PipelineDeps.runtimeStrategy` field is removed; `buildDeps()` returns `PipelineDeps`
without any cast; `finalizeStepArtifacts`, `commitFinalState`, and `commitRoundArtifacts`
no longer carry `unknown`-typed domain payloads in the port; `runner.ts` uses
`deps.terminalState?.commitFinalState(...)` with string primitives. Test coverage for
lifecycle ordering, capability contracts, and managed no-op semantics is present.

One **medium-severity** doc accuracy gap and one **low-severity** count discrepancy are
reported below.

---

## Findings

### F-001 — Medium — Fixable

**File**: `architecture/components.md`  
**Lines**: 60, 66  
**Title**: Step and StepExecutor sections still reference `RuntimeStrategy.validateStepInputs/validateStepOutputs`

**Description**:

After R2b, StepExecutor accesses step I/O validation through `deps.stepIo`
(`StepIoValidationCapability`), not through `RuntimeStrategy` directly. However, two
sentences in the architecture doc still name the old facade:

- **Line 60** (under `Step — I/O 契約`):
  > `reads の required 入力は StepExecutor が実行前に RuntimeStrategy.validateStepInputs で存在を検証（欠落時 STEP_INPUT_MISSING）。writes の出力は実行後に RuntimeStrategy.validateStepOutputs で検証`

- **Line 66** (under `StepExecutor — 出力契約ゲート`):
  > `writes() 宣言 + outputContracts() を RuntimeStrategy.validateStepOutputs に渡して検証`

The `協調` line of StepExecutor (line 67) already correctly lists
`StepIoValidationCapability（output gate）`, which is accurate. The body text in both
sections was not updated to reflect the R2b routing via `StepIoValidationCapability`.

TC-042 (must-priority): requires that `architecture/components.md` accurately describes
the post-R2b model. Requirement 8 says mutation/lifecycle capability consumers should be
documented as owning their own capability contracts, not routing through `RuntimeStrategy`.

**Fix**: Update lines 60 and 66 to replace `RuntimeStrategy.validateStepInputs`/
`RuntimeStrategy.validateStepOutputs` with `StepIoValidationCapability（deps.stepIo 経由）`
to match the actual post-R2b code path and the `協調` line at line 67.

---

### F-002 — Low — Fixable

**File**: `specrunner/changes/runtime-mutation-lifecycle-capability-split/test-cases.md`  
**TC**: TC-038  
**Title**: Pre-existing `as unknown as RuntimeStrategy` count is 2, not 4 as stated

**Description**:

TC-038 states "exactly the 4 pre-existing occurrences in full-pipeline e2e test files
remain; no new occurrences are present." However, the current branch has only 2
occurrences (both in `tests/pipeline-sole-committer-e2e.test.ts`); the other 2
that existed at R2a baseline have been migrated away.

From the AC: "対象 cast は単調減少し、追加しないこと" — this is satisfied (2 < 4,
no new ones added to `src/`). The reduction is actually the correct direction. The
test case description is stale relative to the actual outcome.

**Fix**: Update TC-038 description to reflect that 2 (not 4) pre-existing occurrences
remain, noting that 2 additional ones were eliminated as part of the test fake migration.

---

## 検証した項目

- `src/core/step/step-capability.ts` — `StepArtifactLifecycleCapability` / `StepIoValidationCapability` インターフェース定義と derive helpers
- `src/core/pipeline/pipeline-capability.ts` — `TerminalStateCapability` / `RoundGitEffectsCapability` / `RoundEgressParams` DTO
- `src/core/types.ts` — `PipelineDeps` フィールド構成（`runtimeStrategy` 削除、7 capability フィールド確認）
- `src/core/port/runtime-strategy.ts` — `buildDeps(): PipelineDeps` 型付き返却; 3 `unknown` メソッド削除; 残存 `unknown` は `query()` と `CleanupHandle` のみ
- `src/core/command/runner.ts` — `deps = this.runtime.buildDeps(...)` キャストなし; `deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, ...)` 呼び出し確認
- `src/core/pipeline/pipeline.ts` — `deps.terminalState?.commitFinalState(cwd, deps.slug, finalState)` 呼び出し確認
- `src/core/pipeline/parallel-review-round.ts` — `deps.roundGitEffects.*` 経由; `deps.runtimeStrategy` 参照ゼロ
- `src/core/step/executor.ts` — `deps.stepIo.*` / `deps.stepArtifact.*` / `deps.changedFiles.*` 経由; `deps.runtimeStrategy` 参照ゼロ
- `src/core/step/step-completion.ts` — `deps.stepIo.verifyFindingRefs(...)` 経由
- `src/core/runtime/local.ts` — 4つの `derive*Capability(this)` 呼び出し確認
- `tests/unit/architecture/arch-allowlist.ts` — DSM allowlist entry `T-05-T-12-buildDeps-PipelineDeps-return-type` 追加確認
- `tests/unit/step/executor-lifecycle-ordering.test.ts` — TC-T15-01/02/03/06: finalize primitives, roundOwnsGitEffects skip, prepareStepArtifacts ordering
- `src/core/runtime/__tests__/local-runtime-capabilities.test.ts` — TC-T14-01〜: capability contract wiring proof
- `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts` — TC-T14-M01〜: managed no-op semantics proof
- `architecture/components.md` — L170–183 R2b 記述確認、L60/L66 の不整合を F-001 として報告
- `src/` tree での `as unknown as RuntimeStrategy` ゼロ件確認
- `src/` tree での `as PipelineDeps` / `as CommitPushInfra` / egress restore cast ゼロ件確認
- 全 Acceptance Criteria をソースレベルで照合（下記テーブル参照）

## 検証できなかった項目

- SpecRunner verification（typecheck / build / test / lint）の実行結果 — PR 上の既存証跡を正本とし、レビュー側での重複実行は行わない（test-cases.md TC-043〜046 gate）
- `ManagedRuntime.buildDeps` の実 HTTP クライアント経由 capability 注入（managed-runtime-capabilities.test.ts は structural fake を用いており、実 ManagedRuntime インスタンスの TC-028 は mock HTTP クライアントを使用）

---

## Evidence Checked

### Acceptance Criteria — all verified ✓

| AC | Verification |
|---|---|
| 対象 consumer が full RuntimeStrategy を要求しない | `executor.ts`, `pipeline.ts`, `parallel-review-round.ts`, `step-completion.ts` — `deps.runtimeStrategy` 参照ゼロ |
| `PipelineDeps` が full runtime facade を service locator として保持しない | `types.ts` から `runtimeStrategy?: RuntimeStrategy` フィールド削除確認 |
| capability が use-case-specific な最小契約 | 4つの capability interface 各々が narrow (method 3–5本) |
| capability method は required | `StepArtifactLifecycleCapability` の `snapshotMainCheckoutGuard?` 以外全て required |
| `buildDeps` 対象 payload に domain `unknown` が残らない | `runtime-strategy.ts` の `buildDeps` は `PipelineDeps` 返却型 (import type) |
| `finalizeStepArtifacts`/`commitFinalState`/`commitRoundArtifacts` の対象 payload に `unknown` なし | 3メソッドとも `RuntimeStrategy` port から削除され、typed capability interface に移動 |
| `as PipelineDeps` cast が除去される | `runner.ts` line 222 は `deps = this.runtime.buildDeps(...)` — no cast |
| `as CommitPushInfra` / egress params restore cast が除去される | `local.ts` の対象メソッドを確認: `CommitPushInfra` 型直接受取 |
| 新たな `as unknown as RuntimeStrategy` を追加していない | `src/` tree: 0件 |
| R2a read-only leaf consumer が full facade 依存へ戻っていない | `ChangedFilesCapability`/`CommitInspectionCapability`/`RevisionContentCapability` は port layer のまま |
| command lifecycle/step finalize/terminal commit/round git effects の順序と失敗境界が executable test で固定 | `executor-lifecycle-ordering.test.ts` (TC-T15-01/02/03/06) 確認 |
| Local/Managed capability contract test がある | `local-runtime-capabilities.test.ts`, `managed-runtime-capabilities.test.ts` (TC-T14-M01〜) 確認 |
| architecture 文書が実装後の責務と依存方向に一致する | `components.md` L170–183 に R2b 記述あり (F-001 の lines 60/66 除く) |

### Key files verified

| File | Verified content |
|---|---|
| `src/core/step/step-capability.ts` | `StepArtifactLifecycleCapability` / `StepIoValidationCapability` + derive helpers |
| `src/core/pipeline/pipeline-capability.ts` | `TerminalStateCapability` / `RoundGitEffectsCapability` / `RoundEgressParams` DTO |
| `src/core/types.ts` | `PipelineDeps` に 7 capability フィールド、`runtimeStrategy` フィールドなし |
| `src/core/port/runtime-strategy.ts` | `buildDeps(): PipelineDeps` (typed); `finalizeStepArtifacts`/`commitFinalState`/`commitRoundArtifacts` は port から削除; `unknown` は `query()` と `CleanupHandle` のみ |
| `src/core/command/runner.ts` | `deps = this.runtime.buildDeps(...)` — no `as PipelineDeps`; `deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, ...)` |
| `src/core/pipeline/pipeline.ts` | `deps.terminalState?.commitFinalState(cwd, deps.slug, finalState)` |
| `src/core/pipeline/parallel-review-round.ts` | `deps.roundGitEffects.*` 経由; `deps.runtimeStrategy` 参照ゼロ |
| `src/core/step/executor.ts` | `deps.stepIo.*` / `deps.stepArtifact.*` / `deps.changedFiles.*` 経由; `deps.runtimeStrategy` 参照ゼロ |
| `src/core/step/step-completion.ts` | `deps.stepIo.verifyFindingRefs(...)` 経由 |
| `src/core/runtime/local.ts` | `deriveStepArtifactLifecycleCapability(this)` / `deriveStepIoValidationCapability(this)` / `deriveTerminalStateCapability(this)` / `deriveRoundGitEffectsCapability(this)` 呼び出し確認 |
| `tests/unit/architecture/arch-allowlist.ts` | DSM allowlist entry `T-05-T-12-buildDeps-PipelineDeps-return-type` 追加確認 |
| `tests/unit/step/executor-lifecycle-ordering.test.ts` | TC-T15-01〜03/06 カバー: finalize primitives, roundOwnsGitEffects skip, ordering |
| `src/core/runtime/__tests__/local-runtime-capabilities.test.ts` | TC-T14-01〜03: capability contract wiring proof |
| `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts` | TC-T14-M01〜: managed no-op semantics proof |
| `architecture/components.md` | L170–183: R2b 記述確認 (F-001 は L60/L66 のみ) |

### Must-priority TCs not fully satisfied

| TC | Issue |
|---|---|
| TC-042 (must) | Lines 60 and 66 in `components.md` still reference `RuntimeStrategy.validateStepInputs/validateStepOutputs` instead of `StepIoValidationCapability` (F-001) |

### unknown count in port (target signatures)

| Signature | `unknown` count |
|---|---|
| `buildDeps` return type | 0 — now `PipelineDeps` |
| `finalizeStepArtifacts` | 0 — removed from port |
| `commitFinalState` | 0 — removed from port |
| `commitRoundArtifacts` | 0 — removed from port |
| `query()` return | 1 (`AsyncGenerator<unknown>`) — Non-Goal per spec |
| `CleanupHandle` | 1 (`Record<string, unknown>`) — opaque handle, not mutation payload |

### as PipelineDeps / as CommitPushInfra / egress restore cast count

| Cast | Production src/ | Tests |
|---|---|---|
| `as PipelineDeps` | 0 (removed from runner.ts) | Tests only (partial mocks, expected) |
| `as CommitPushInfra` | 0 | 0 |
| egress params restore cast | 0 | 0 |
| `as unknown as RuntimeStrategy` | 0 (src/) | 2 (pipeline-sole-committer-e2e, pre-existing) |
