# Regression Gate Result — approved-reroute-unconditional-row (iteration 1)

## Findings Verified

### [MEDIUM] TC-017 helper の file パスが slug-bound でないと T-03 が発火せず破壊確認が成立しない

**Status**: FIXED — finding is no longer present.

**Evidence**:

`tasks.md` (T-03 セクション) に以下の記述が追加されている:

> **重要**: `specReviewHasRoutableFixables` は `buildCanonWriteScopeFromState(state)` → `getJobSlug(state)` → slug 由来のパスで writable set を構築する。`state.request.slug` を テスト用スラッグ（例: `"approved-reroute-unconditional-row"`）に設定し、`finding.file` を `specrunner/changes/<slug>/spec.md` など slug-bound なパスにすること（`src/` 下のパスを使うと `writableByFixer["spec-fixer"]` に含まれず `specReviewHasRoutableFixables` が false を返し、guarded 行が選択されず T-03 が発火しない）

テスト実装 (`tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts`, lines 1596–1648) もこの指示に従っている:

- `const TEST_SLUG = "approved-reroute-unconditional-row";` (line 1597)
- `const SPEC_MD_PATH = \`specrunner/changes/${TEST_SLUG}/spec.md\`;` (line 1598)
- `state.request.slug = TEST_SLUG` (line 1648)
- `finding.file: SPEC_MD_PATH` (line 1635)

`src/` 下のパスは使われておらず、slug-bound な `specrunner/changes/<slug>/spec.md` が正しく設定されている。`specReviewHasRoutableFixables` が true を返すための前提条件が満たされており、guarded 行 `spec-review → spec-fixer` が選択され T-03 が発火する。破壊確認 (TC-004) は成立する。
