# Code Review Feedback — iteration 001

- **verdict**: approved
- **iteration**: 1

## Summary

要件は全て実装されている。`AUTHORITY_SPEC_GUARD` fragment は 4 セクション (MUST NOT / 正規経路 / 書く側の規律 / 見る側の規律) に拡張され、`SPEC_REVIEW` / `CODE_REVIEW` 系 prompt に inject 済み。`bun run typecheck` と `bun run test` (195 files / 2206 tests) は全 green、regression なし。delta spec は baseline と完全一致した MODIFIED header で構成されており、target capability `prompt-fragment-registry` の 3 Requirement (Fragment 集約 export / Inject 漏れの構造的検出 / System prompt の builder 経由構成) を更新する形式として妥当。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | specrunner/changes/spec-authority-lifecycle-unified-prompt/specs/prompt-fragment-registry/spec.md | delta spec の Scenario は `#### Scenario:` 形式 (= DELTA_SPEC_FORMAT 規律準拠) で正しいが、baseline は `**Scenario**:` 形式で表記揺れがある。merge 時に baseline 表記が `#### Scenario:` に上書きされる挙動になる。本 request の責務外であり修正不要。 | 別 request で baseline 全体の Scenario 表記統一を検討する。 |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.65

## Acceptance Criteria Check

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `AUTHORITY_SPEC_GUARD` が 4 セクション拡張 | ✓ | `src/prompts/fragments.ts:14,20,27,37` に MUST NOT / 正規経路 / 書く側の規律 / 見る側の規律 4 セクション header |
| 2 | `fragment-coverage.test.ts` の SPEC_REVIEW / CODE_REVIEW に AUTHORITY_SPEC_GUARD 含む | ✓ | `tests/unit/prompts/fragment-coverage.test.ts:32-33` |
| 3 | `spec-review-system.ts` / `code-review-system.ts` の buildSystemPrompt に AUTHORITY_SPEC_GUARD | ✓ | `src/prompts/spec-review-system.ts:100-103`, `src/prompts/code-review-system.ts:84-87` |
| 4 | base prompt 内の AUTHORITY_SPEC_GUARD と重複する規律記述整理 (SHOULD) | ✓ | design.md §4 で「大規模削除は発生しない見込み」と判断、grep 結果は全て保全対象 (= operational instructions: `design-system.ts:128-130`, `design-system.ts:159`, `spec-review-system.ts:74-90`)。SHOULD レベルの best-effort 完了。 |
| 5 | `bun run typecheck && bun run test` green | ✓ | typecheck pass、195 test files / 2206 tests pass |
| 6 | delta spec が baseline 確認の上で MODIFIED 作成 | ✓ | `specs/prompt-fragment-registry/spec.md` の 3 MODIFIED header (Fragment 集約 export / Inject 漏れの構造的検出 / System prompt の builder 経由構成) は baseline `specrunner/specs/prompt-fragment-registry/spec.md` の header と完全一致 |
| 7 | 既存 prompt 関連 test の regression なし | ✓ | fragments.test.ts / fragment-coverage.test.ts / その他 prompt test 全 pass |

## Implementation Quality Notes

- **fragment 内容**: 4 セクションそれぞれが事故 (PR #306/#308/#317) の各失敗モードに対応した規律を含んでいる。MUST NOT セクションが書く側 + 見る側 + reviewer の 3 視点全てを cover、code-fixer 固有の盲従回避規律も正規経路セクションに明示されている。
- **inject 対応表**: `BUILD_FIXER` / `ADR_GEN` を AUTHORITY_SPEC_GUARD 非対象として除外する判断は design.md §5 で根拠付き。テストの可読性は維持されている。
- **JSDoc 更新**: `Spec authority lifecycle — unified discipline for writers and reviewers.` は fragment の責務拡大を正確に反映。
- **保全対象の判断**: `design-system.ts` の Baseline Spec 参照 / Completion Checklist と `spec-review-system.ts` の Baseline Spec Consistency Check は operational instructions として fragment の規律と相補関係にあり、削除しない判断は妥当。

## Delta Spec Header Consistency Check

| Delta MODIFIED Header | Baseline Header | 一致 |
|-----------------------|-----------------|------|
| `### Requirement: Fragment 集約 export` | `### Requirement: Fragment 集約 export` | ✓ |
| `### Requirement: Inject 漏れの構造的検出` | `### Requirement: Inject 漏れの構造的検出` | ✓ |
| `### Requirement: System prompt の builder 経由構成` | `### Requirement: System prompt の builder 経由構成` | ✓ |

## Scenario Coverage (test-cases.md)

test-cases.md の 22 test case のうち TC-01〜TC-16 (= must priority) は全て implementation / 既存 test で検証済み。TC-17 (= 重複削除 should) は grep 結果と保全対象判断で覆われる。TC-18〜TC-19 (= delta spec must) は header 一致確認で pass。TC-20〜TC-21 は SPEC_REVIEW_SYSTEM_PROMPT / CODE_REVIEW_SYSTEM_PROMPT に AUTHORITY_SPEC_GUARD が inject されている事実で間接的に pass。TC-22 (= 書く側の規律文言が IMPLEMENTER 等に含まれる should) は fragment 拡張の自動 propagation で pass。
