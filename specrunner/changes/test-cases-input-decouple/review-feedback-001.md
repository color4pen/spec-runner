# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | medium | testing | tests/unit/core/command/pipeline-run-input-completeness.test.ts | TC-009 not covered: the "合成後 descriptor を検算するため custom reviewer の必須 read も対象になる" scenario (must priority) is not explicitly tested. All tests mock `loadReviewerDefinitions` to return `[]`, so no composed-with-custom-reviewer path is exercised in the integration layer. | Add a test case that injects a fake reviewer snapshot with a required read, passes it through `composeReviewerDescriptor`, and verifies `DescriptorInputCompletenessError` is thrown from `prepare()`. | yes |
| 2 | low | maintainability | tests/unit/core/command/pipeline-run-input-completeness.test.ts | `makeCleanDescriptor` hardcodes `specrunner/changes/${deps.slug}/request.md` instead of using `requestMdPath()`. If the path format changes, the test would silently pass while the real ambient path diverges. | Replace the hardcoded string with `requestMdPath(deps.slug)` imported from `src/util/paths.js`. | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 8.85

## Summary

実装は設計意図を正確に反映しており、受け入れ基準を全件満たしている。

**確認した主要ポイント:**

- `code-review` / `custom-reviewer` の `test-cases.md` read が `required: false`（soft）に変更されており、executor の必須フィルタ（`r.required !== false`）から正しく除外される。`verify: false` という request.md の表現を実コードで `required: false` に読み替えた D1 の判断は適切。
- `test-case-gen.ts` の stale コメントが「output gate が `STEP_OUTPUT_MISSING` で検出する」という実態に即した記述に是正されている。producer の output contract（`writes()` → `producedContractsFromWrites`）は変更なしで継続して機能する。
- `validateDescriptorInputCompleteness` は純関数で fs / child_process を import せず（B-5 準拠）、iteration suffix 正規化によりループバック read の偽陽性を防ぐ実装になっている。
- `pipeline-run.ts` の配線順序（`composeReviewerDescriptor` → `validateDescriptorInputCompleteness` → `bootstrapJob`）が仕様どおりであり、violation 時は job state を作らずに throw する。
- `VALIDATOR_PROBE_SLUG` を export して ambient inputs 構築側と validator 内部で同一 slug を使う設計は一貫性があり、path mismatch を防いでいる。
- `bun run typecheck && bun run test` が 5370 件 green（402 ファイル）。`FindingResolution` union は `fixable | decision-needed` のまま不変。

**指摘事項:**

- F-1（medium）: TC-009（custom reviewer の必須 read が合成後 descriptor で検算される）が integration テストで未カバー。現状 custom reviewer は全て soft read なので production リスクはないが、must 優先度のシナリオが空白になっている。追加テストで閉じることを推奨する。
- F-2（low）: `makeCleanDescriptor` 内のパスのハードコード。機能上の問題はないが、`requestMdPath()` を使う方が変化耐性が高い。

どちらも機能正確性・安全性には影響しないため、メイン verdict は approved とする。
