# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | テスト設計 | tasks.md / T-05 | T-05 のテストは 3 prompt が `TC_SOURCE_SCENARIO_FORMAT` の値を「含む」ことを検証するが、定数を import して参照しているかは静的に検証しない。将来的に誰かが同じ文字列を再度ハードコードした場合、テストが素通りする余地がある。 | 現行の関数的テスト（文字列一致）で drift 防止として十分。将来の形式変更時に定数の値が変われば不一致が検出される。実装タスク T-02〜T-04 が明示的に import を要求しているため、今回は対策不要。 |

## Summary

バグは確認済み（`test-materialize-system.ts:84-86` および `implementer-system.ts:48-49` が旧形式 `specs/<capability>/spec.md > ...` を参照）。`test-case-gen-system.ts:55` の現行形式との乖離は実在する。

設計は適切で、既存の `judge-rules.ts` leaf module パターンを正確に踏襲している。spec.md の 3 要件（定数の単一ソース化・3 prompt からの参照・旧形式の排除）は request.md の受け入れ基準と完全に対応している。tasks.md の T-01〜T-05 は受け入れ基準を網羅した具体的なタスクである。

セキュリティ面では、変更対象はプロンプト文字列の内容変更のみであり、認証・認可・入力検証への影響はない。既存のプロンプト内 Security Note も維持されている。

既存テスト `fragment-coverage.test.ts` は `IMPLEMENTER_SYSTEM_PROMPT` の provider 中立性（`report_result` / `end_turn` 不在）を検証しているが、今回の変更（import 追加と文字列更新）はこの検証に影響しないため無改変で green を維持できる。
