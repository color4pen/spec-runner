# Code Review Feedback — remove-workflow-options — iter 1

- **verdict**: approved

## Summary

`enabled` dataflow の全経路削除が clean に完了している。型削除 → 参照削除 → テンプレート削除 → テスト更新の順序が守られており、typecheck + 2784 tests がすべて green。delta spec 3 件も canonical path 経由で記録されており、baseline spec への直接編集なし。

---

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | low | Test Coverage | `tests/unit/core/command/request.test.ts` | `buildScaffoldTemplate()` が `## Workflow Options` を含まないことを検証するテストアサーションが存在しない。TC-009 THEN 節の否定アサーション (`not.toContain("## Workflow Options")`) が未記述。実装は正しいが、リグレッション検知が弱い。 | `it("does not include Workflow Options section", () => { const content = buildScaffoldTemplate(...); expect(content).not.toContain("## Workflow Options"); expect(content).not.toContain("enabled:"); })` を追加する。 |

---

## TC Coverage Check (must 全件)

| TC | Description | Status |
|----|-------------|--------|
| TC-001 | Parser: `## Workflow Options` を silent ignore | ✅ tests/parser.test.ts TC-002 describe で cover |
| TC-002 | Parser: `enabled: [test-case-generator]` を silent ignore | ✅ tests/parser.test.ts TC-002 の 1 件目 |
| TC-003 | Parser: `## Workflow Options` なし request.md を正常パース | ✅ tests/parser.test.ts TC-003 |
| TC-004 | `extractEnabled` 関数・呼び出しが存在しない | ✅ grep 結果 0 件 / typecheck green |
| TC-005 | `ParsedRequestRaw` に `enabled` field なし | ✅ src/parser/rules/types.ts 確認済 |
| TC-006 | `ParsedRequest` に `enabled` field なし | ✅ src/core/request/types.ts 確認済 |
| TC-007 | `SpecReviewPromptInput` に `enabled` field なし | ✅ grep 0 件 / typecheck green |
| TC-008 | `TestCaseGenPromptInput` に `enabled` field なし | ✅ grep 0 件 / typecheck green |
| TC-009 | scaffold template に `## Workflow Options` なし | ⚠️ 実装は正しいが否定アサーションのテストなし（Finding #1） |
| TC-010 | request-generate-system.ts に `## Workflow Options` なし | ✅ grep 0 件 |
| TC-011 | `{{ENABLED}}` / `enabledStr` / `Enabled options:` なし | ✅ grep 0 件 |
| TC-012 | spec-review.ts が `enabled` を buildMessage に渡していない | ✅ grep 0 件 |
| TC-013 | `<must-areas>` / `mustAreasSection` なし | ✅ grep 0 件 |
| TC-014 | test-case-gen.ts が `enabled` を buildMessage に渡していない | ✅ grep 0 件 |
| TC-015 | TC-008/TC-009 (must-areas テスト) 削除済 | ✅ tests/test-case-gen-step.test.ts 確認済 |
| TC-016 | parser.test.ts の `enabled` 抽出テスト削除済 | ✅ 確認済 |
| TC-017 | parser.test.ts に `## Workflow Options` silent ignore テスト追加済 | ✅ TC-002 describe ブロック確認済 |
| TC-018 | 全 mock から `enabled: []` 削除 | ✅ error-codes / multi-layer-defense 等で grep 0 件 |
| TC-019 | `bun run typecheck` green | ✅ verification-result.md: passed |
| TC-020 | `bun run test` green | ✅ 249 files / 2784 tests passed |
| TC-021 | request-md-parser delta spec: `enabled` REMOVED 表現済 | ✅ specs/request-md-parser/spec.md 確認済 |
| TC-022 | request-management delta spec: `enabled` Requirement REMOVED | ✅ specs/request-management/spec.md `## Removed` 3 件確認済 |
| TC-023 | database delta spec: `enabled` column MODIFIED/REMOVED | ✅ specs/database/spec.md 確認済 |
| TC-024 | baseline spec を直接編集していない | ✅ `git diff main...HEAD -- specrunner/specs/` 差分なし |

---

## Notes

- Finding #1 は merge ブロッカーではない。承認後に small follow-up で追加可。
- `tests/unit/context/request-patterns.test.ts` / `tests/unit/core/request/store.test.ts` / `tests/unit/core/request/generator.test.ts` 内の `## Workflow Options\n\n- enabled: []` はすべて raw request.md content string（後方互換テスト用の入力）であり、`ParsedRequest` mock ではない。削除不要。
- TC-025 (should): baseline spec の `enabled` 残存は delta spec 未適用のため想定内。
