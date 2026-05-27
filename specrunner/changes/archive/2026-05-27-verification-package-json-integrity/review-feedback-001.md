# Code Review Feedback — verification-package-json-integrity — iter 1

- **verdict**: needs-fix
- **reviewer**: code-review agent
- **date**: 2026-05-27

---

## Summary

実装の核心ロジック（`checkPackageJsonScriptsIntegrity`、`runVerificationPhases` への挿入、`runVerification` シグネチャ変更）は仕様通りで正しく動作している。verification は build/typecheck/test/lint 全通過。ただし以下 4 点を要修正・要確認とする。

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | Scope Creep | `src/core/step/code-fixer.ts` | `requiresCommit: true → false` がスコープ外で変更されている。tasks.md が「本タスクと無関係」と明記していた既存失敗を暗黙に解消しており、意図不明の振る舞い変更が混入している | `code-fixer.ts` の変更を revert する。必要なら別 request に切り出す | yes |
| 2 | MEDIUM | Test Coverage | `tests/unit/core/verification/runner-integrity.test.ts` | TC-10（must）— dependencies 変更・scripts 未改変のシナリオがテストされていない。実装は正しいが `must` シナリオが機械的に検証されていない | TC-INT-10 として `dependencies` 追加・`scripts` 不変のケースを追加する | yes |
| 3 | MEDIUM | Test Coverage | `src/core/step/verification.ts` | TC-11（must）— `VerificationStep.run` が `deps.request.baseBranch` を `runVerification` に渡すことを検証するテストがない。配線が壊れても現テストスイートで検出不可 | `runVerification` を spy して第4引数に `baseBranch` が正しく渡されることを検証するテストを追加する | yes |
| 4 | LOW | Documentation | `src/core/verification/runner.ts` L37 | `VerificationResult.errorCode` の JSDoc が「phases were skipped 時のみ」と旧記述のままで、`PACKAGE_JSON_SCRIPTS_TAMPERED` のケースが未反映 | JSDoc を「`VERIFICATION_NO_RUNNABLE_PHASES` または `PACKAGE_JSON_SCRIPTS_TAMPERED` 時に設定」と更新する | no |

---

## Positive Notes

- `checkPackageJsonScriptsIntegrity` の実装は設計通り: git show 失敗・ファイル不在・JSON 不正・baseBranch undefined の全エラーパスで `{ tampered: false }` を返す。
- キーソートによる正規化（`Object.entries(s).sort()`）が正しく実装されている（TC-INT-05 通過）。
- custom commands path への非混入（TC-INT-07 通過）。
- 9 つのユニットテスト（TC-INT-01〜09）はいずれも must/edge case を適切にカバーしている。
- verification 全通過: build / typecheck / test（3186件）/ lint。
