# Review Feedback — Iteration 012

## Summary

Iteration 012 is a re-review after operator-apply commit `a874498e` that resolved the two
escalated findings from iteration 011:

- **F-001** (medium): `architecture/components.md` lines 60 and 66 now correctly reference
  `StepIoValidationCapability.validateStepInputs`/`validateStepOutputs` (via `deps.stepIo`)
  instead of the old `RuntimeStrategy.validateStepInputs/validateStepOutputs`. Verified at
  lines 60 and 66.

- **F-002** (low): `test-cases.md` TC-038 now states "exactly the 2 pre-existing occurrences
  in `tests/pipeline-sole-committer-e2e.test.ts` remain" (previously stated 4). Verified in
  the TC-038 text.

No new findings are present. The R2b capability split is complete and all Acceptance Criteria
are satisfied.

---

## Operator Fix Verification

| Item | Expected | Actual |
|---|---|---|
| `architecture/components.md` line 60 | `StepIoValidationCapability.validateStepInputs (deps.stepIo 経由)` | ✓ Updated |
| `architecture/components.md` line 66 | `StepIoValidationCapability.validateStepOutputs (deps.stepIo 経由)` | ✓ Updated |
| `test-cases.md` TC-038 | 2 pre-existing occurrences in `tests/pipeline-sole-committer-e2e.test.ts` | ✓ Updated |

---

## 検証した項目

- `architecture/components.md` L60 / L66 — operator fix 適用確認（`StepIoValidationCapability` / `deps.stepIo` 参照に更新済み）
- `test-cases.md` TC-038 — operator fix 適用確認（2 occurrences、`tests/pipeline-sole-committer-e2e.test.ts` と明示）
- `src/` tree — `as unknown as RuntimeStrategy` ゼロ件（変化なし）
- `src/core/types.ts` — `runtimeStrategy` フィールドが comment 以外で存在しないことを確認（変化なし）

## 検証できなかった項目

- SpecRunner verification（typecheck / build / test / lint）の実行結果 — PR 上の既存証跡を正本とし、レビュー側での重複実行は行わない（test-cases.md TC-043〜046 gate）

---

## Findings

No findings. All previously identified issues have been resolved by the operator-apply commit.

---

## Acceptance Criteria — all verified ✓

| AC | Verification |
|---|---|
| 対象 consumer が full RuntimeStrategy を要求しない | `executor.ts`, `pipeline.ts`, `parallel-review-round.ts`, `step-completion.ts` — `deps.runtimeStrategy` 参照ゼロ（iteration 011 確認済、変化なし） |
| `PipelineDeps` が full runtime facade を service locator として保持しない | `types.ts` から `runtimeStrategy?: RuntimeStrategy` フィールド削除確認（変化なし） |
| capability が use-case-specific な最小契約 | 4 capability interface — 確認済（変化なし） |
| capability method は required | `snapshotMainCheckoutGuard?` 以外全 required — 確認済（変化なし） |
| 対象 payload に domain `unknown` が残らない | buildDeps/finalizeStepArtifacts/commitFinalState/commitRoundArtifacts — 確認済（変化なし） |
| 対象 cast が除去される | `as PipelineDeps` / `as CommitPushInfra` / egress restore cast ゼロ — 確認済（変化なし） |
| 新たな `as unknown as RuntimeStrategy` を追加していない | `src/` tree: 0件（確認済） |
| R2a read-only leaf consumer が full facade 依存へ戻っていない | 確認済（変化なし） |
| lifecycle 順序・失敗境界が executable test で固定 | `executor-lifecycle-ordering.test.ts` — 確認済（変化なし） |
| Local/Managed capability contract test がある | `local-runtime-capabilities.test.ts`, `managed-runtime-capabilities.test.ts` — 確認済（変化なし） |
| architecture 文書が実装後の責務と依存方向に一致する | `components.md` L60/L66 が operator fix で修正済み ✓ |

### Must-priority TCs — all satisfied

| TC | Status |
|---|---|
| TC-038 (must) | ✓ 2 pre-existing occurrences recorded (operator fix applied) |
| TC-042 (must) | ✓ `components.md` L60/L66 updated to `StepIoValidationCapability (deps.stepIo 経由)` (operator fix applied) |
| All other must TCs | ✓ Verified in iteration 011, no changes to implementation |
