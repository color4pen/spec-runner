# Regression Gate Result — Iteration 005

## Verdict

No regressions. All 12 findings from the ledger are fixed in the current code.

## Evidence

| # | Severity | Finding | Status | Evidence |
|---|----------|---------|--------|----------|
| 1 | LOW | T-02: state/schema/types.ts と config/schema/types.ts が scrub リストに未記載 | ✅ FIXED | `grep test-materialize` → 0 hits in both files |
| 2 | LOW | T-10: tasks.md:138 の「test-cases.md にも TC-015a として追記する」指示が duplicate リスク | ✅ FIXED | tasks.md:138 は「の pin ケースを同テストファイル内に追加」に書き換え済み。test-cases.md の TC-015a は 1 件のみ（line 188）。 |
| 3 | MEDIUM | specFixerObservationForward JSDoc に test-materialize 残存 | ✅ FIXED | spec-observation.ts 全体で `test-materialize` 0 hits。モジュール/関数 JSDoc・内部コメント全て更新済み。 |
| 4 | LOW | testGenRequired JSDoc が test-materialize を 2 箇所に列挙 | ✅ FIXED | type-config.ts:27–28 は「test-case-gen / bite-evidence」のみ。test-materialize 記述なし。 |
| 5 | LOW | Currently FAILS because コメントが 6 箇所に残存 | ✅ FIXED | achieved-assurance-no-base-oid.test.ts・resolve-step-test-materialize-alias.test.ts・gate-no-test-materialize.test.ts いずれも 0 hits。 |
| 6 | LOW | local.ts:1501 のコメントが test-materialize を materializer と記述 | ✅ FIXED | line 1501 は「implementer must produce test files after reading test-cases.md」に更新済み。 |
| 7 | MEDIUM | diffPathsBetweenCommits が RealRuntimeStrategy に required で残存、archive floor doc が stale | ✅ FIXED | runtime-strategy.ts・local.ts・managed.ts いずれも `diffPathsBetweenCommits` 0 hits。local.ts:993–998 の doc は `listChangedFilesBetweenCommits` の EB-native 説明に更新済み。 |
| 8 | LOW | bite-evidence-e2e-gate.test.ts が旧 test-materialize 命名・コメントを維持 | ✅ FIXED | commit message は「implementer: add feature test...」(line 116)、`steps` は `test-case-gen`/`implementer` のみ（line 172–175）、`diffPathsBetweenCommits sees no diff` コメント 0 hits。 |
| 9 | LOW | diff-paths-between-commits.test.ts が dead method をテスト継続 | ✅ FIXED | ファイル自体が削除済み（存在しない）。 |
| 10 | LOW | test-coverage.ts:182 doc comment に test-materialize 参照残存 | ✅ FIXED | `evaluateTestCoverage` JSDoc は「verification step (runTestCoveragePhase wrapper)」のみ。test-materialize・implementer output contract 記述なし。 |
| 11 | MEDIUM | specFixerNeedsFixForward が exempt type を TEST_CASE_GEN へ routing | ✅ FIXED | spec-observation.ts:109 に `&& !isTestGenExempt(state)` 追加済み。TC-009（line 499 of spec-observation-autofix.test.ts）が chore+needs-fix → SPEC_REVIEW を pin。 |
| 12 | LOW | evaluateTestCoverage doc に存在しない implementer output contract 記述 | ✅ FIXED | `implementer output contract` 0 hits in test-coverage.ts。 |

## Checked

- 12 findings checked, 0 regressions, 0 decision-needed.
