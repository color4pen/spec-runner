# Code Review Feedback — iteration 002

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
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: approved
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | testing | `src/core/credentials/__tests__/github.test.ts` | TC-010 キャリーオーバー（iter-001 finding #5）。spawn が reject（例外 throw）するケースのテストが依然未追加。`catch {}` ブランチが実質 dead path のままテスト網羅外。 | `spawn: vi.fn().mockRejectedValue(new Error("spawn failed"))` を注入し credentials.json にフォールスルーすることを確認するテストを追加。 | no |
| 2 | LOW | maintainability | `src/core/preflight.ts` | iter-001 finding #6 キャリーオーバー。L22 の JSDoc が「from credentials file or GITHUB_TOKEN env var」と旧仕様のまま。 | コメントを「Resolved GitHub token (GH_TOKEN/GITHUB_TOKEN env, gh auth token, or credentials file).」等に更新する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.80

## Summary

iter-001 の MEDIUM 4 件がすべて解消済み。

- TC-012 hint assertions（github.test.ts）✅
- TC-018 hint assertions（github-token-present.test.ts）✅
- TC-019 hint assertions（github-token-valid.test.ts）✅
- env-filter.test.ts の GH_TOKEN 明示的検証 ✅

残存は LOW 2 件のみ（spawn throw ブランチ未カバー・stale JSDoc）でいずれも correctness / security に影響しない。実装の正確性・解決順反転・B-6 seam 経由 spawn・SECRET_DENYLIST 追加・型追従・受け入れ基準すべて満たしており承認。
