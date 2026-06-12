# Regression Gate Result — Iteration 1

- **verdict**: needs-fix

## Findings

### [LOW] stale test names referencing report_result (regression)
- **File**: tests/prompts/design-system.test.ts:255
- **Resolution**: fixable
- **Rationale**: Line 255: `'mentions report_result with ok: false on mismatch'` および line 259: `'mentions reason in the report_result call'` は未変更のまま残存。diff では同ファイル内の `end_turn` → `finish` リネーム（行 178 付近）のみが適用されており、TC-FC-002 ブロックの2テスト名は修正されていない。finding は再現している。
