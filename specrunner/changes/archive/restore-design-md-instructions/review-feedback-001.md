# Code Review Feedback: restore-design-md-instructions — Iteration 1

- **iteration**: 1
- **verdict**: approved
- **timestamp**: 2026-05-11

## Summary

`src/prompts/propose-system.ts` の `### design.md` セクションが request.md の要件テキストと完全一致する形で置換されている。変更はこのセクションのみに限定され、スコープ外の編集はない。verification で typecheck / test ともに green。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 10 | 0.30 | 3.00 |
| security | 10 | 0.25 | 2.50 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 10 | 0.10 | 1.00 |
| maintainability | 9 | 0.10 | 0.90 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **9.55** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| — | — | — | — | CRITICAL / HIGH 指摘なし | — |

## Scenario Coverage (test-cases.md)

| TC | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-01 | must | ✅ | 6 セクション全て lines 68-74 に存在 |
| TC-02 | must | ✅ | line 71 に「Alternatives considered」明記 |
| TC-03 | must | ✅ | lines 62-66 に 4 条件列挙 |
| TC-04 | must | ✅ | diff で旧 4 行が完全除去を確認 |
| TC-05 | should | ✅ | line 76「実装コードは含めない。アーキテクチャとアプローチに集中する。」 |
| TC-06 | must | ✅ | verification-result: typecheck passed |
| TC-07 | must | ✅ | verification-result: 1546 tests passed |
| TC-08 | should | ✅ | diff が `### design.md` セクション内のみに限定 |
| TC-09 | should | ✅ | line 71 に「D1, D2, ...」番号付け指示 |

must シナリオ 5/5 実装済み、should シナリオ 4/4 実装済み。

## Acceptance Criteria

- [x] propose prompt の design.md ガイドラインに 6 セクション構成が明示されている
- [x] 「Alternatives considered」の指示が含まれている
- [x] 「When to include」の条件が含まれている
- [x] `bun run typecheck && bun run test` が green
