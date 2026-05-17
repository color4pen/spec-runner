# Code Review Feedback — delta-spec-path-validation-hook (iter 2)

- **verdict**: approved
- **reviewer**: code-reviewer
- **date**: 2026-05-17

## Summary

iteration 1 の唯一の needs-fix 根拠だった `AgentStepName` Exclude 句未追加 (finding #1 major) が `src/state/schema.ts:22` に正しく反映されている。minor 指摘 (#2 LOOP_ERROR_CODES hint コメント / #3 TC-V-10 独立 describe / #4 TC-P-06 regression scenario) もすべて対応済み。nit レベルの #5 / #6 は残存しているが承認をブロックしない。typecheck / test (165 files / 1977 tests) は引き続き全 PASS。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | nit | doc-accuracy | src/core/step/delta-spec-fixer.ts:88 | コメント `(see loopFixerPairs in run.ts)` が counter 独立化の実装と乖離 (実体は `Pipeline.loopNames` / `loopIters`。`loopFixerPairs` は #269 用 placeholder で現時点では eslint-disable 済み未使用 field)。前回 finding #6 から持ち越し。 | `(see loopNames in run.ts)` または `(via per-loop counter in Pipeline.loopIters)` に変更。1 行のみ。 |
| 2 | nit | doc-completeness | src/core/step/delta-spec-fixer.ts:64 | `buildDeltaSpecFixerContinuationMessage` の JSDoc に、`fixer-helpers.ts` の共有 `buildContinuationMessage` を使わない理由が書かれていない。将来の reviewer が DRY 違反と誤解するリスク。前回 finding #5 から持ち越し。 | JSDoc に「`buildContinuationMessage` は source を `verification` / `reviewer` の 2 択に固定しているため、`delta-spec-validation` 由来の feedback には適合しない」旨を 1 行追加。 |
| 3 | nit | test-coverage | tests/pipeline-integration.test.ts | TC-P-03「spec-fixer 経由でも delta-spec-validation を通る」が独立 TC として存在しない (TC-DSV-INT-04 が counter 独立性のサブパスとして通過するが、主 assertion が counter であり spec-fixer → dsv path が主題ではない)。must 指定の TC だが機能的には TC-DSV-INT-04 で検証済み。 | 厳密には独立 describe を追加すると test-cases.md との 1:1 対応が完成するが、現カバレッジで実質担保されているため今 PR では optional。 |

## Resolved from Iteration 1

| Finding | 内容 | 解決確認 |
|---------|------|---------|
| #1 (major) | `AgentStepName` Exclude 句に `delta-spec-validation` が未追加 | ✅ `schema.ts:22`: `Exclude<StepName, … \| typeof STEP_NAMES.DELTA_SPEC_VALIDATION>` 追加、コメントも `(verification, pr-create, delta-spec-validation)` に更新 |
| #2 (minor) | `LOOP_ERROR_CODES[DELTA_SPEC_VALIDATION].hint` が `_nnn` を使わず意図不明確 | ✅ hint 前行に `// _nnn is intentionally unused: the result file is delta-spec-validation-result.md (no iteration suffix) because it is overwritten each iteration with the latest violations.` が追加されている |
| #3 (minor) | TC-V-10 (複数 reason 同時) が独立 describe として未実装 | ✅ `delta-spec-validator.test.ts` 末尾に `describe("TC-V-10: multiple violations are reported in a single result", ...)` が追加されている |
| #4 (minor) | TC-P-06 managed-reset-status-stale-guard 観測例が独立 TC として未実装 | ✅ `pipeline-integration.test.ts:1259` に `TC-P-06 / TC-DSV-INT-05: managed-reset-status-stale-guard scenario — legacy-flat-dir + missing-requirements-section resolved in one cycle` が追加されており、2 違反 (violations array 2 件) のシナリオが完走することを検証 |

## Positive

- `AgentStepName` 修正後も `config.agents` スキーマ・型チェックが通っており、既存登録エントリに regression なし。
- TC-DSV-INT-04 が delta-spec-validation 3 回 / spec-review 2 回を maxRetries:4 で並走させ counter 独立性を定量検証。spec-fixer → delta-spec-validation 経路が実地に通過していることを results length から間接的に確認できる。
- TC-P-06 の managed-reset 再現テストで、`legacy-flat-dir` + `missing-requirements-section` の 2 違反が 1 cycle で修正されて spec-review まで完走することを end-to-end で確認。
- `bun run typecheck` / `bun run test` (165 files / 1977 tests) PASS。regression なし。

## Conclusion

iteration 1 の needs-fix 根拠は完全に解消された。残存する 3 件はすべて nit レベルであり、動作・型安全性・テストカバレッジのいずれも阻害しない。承認。
