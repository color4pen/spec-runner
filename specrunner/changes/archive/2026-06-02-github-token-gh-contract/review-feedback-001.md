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
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | testing | `src/core/credentials/__tests__/github.test.ts` | TC-012（must）THEN 条件が未検証。`throws SpecRunnerError when no source is available` が `rejects.toThrow()` のみで、hint に `GH_TOKEN`・`gh auth login`・`specrunner login` の 3 ガイダンスが含まれることをアサートしていない。将来の hint 変更でリグレッションを検出できない。 | `rejects.toMatchObject({ hint: expect.stringContaining("GH_TOKEN") })` 等で 3 ガイダンスを個別に検証するアサーションを追加する。 | yes |
| 2 | MEDIUM | testing | `tests/core/doctor/checks/config/github-token-present.test.ts` | TC-018（must）THEN 条件が未検証。fail ケースが `result.status === 'fail'` のみで `result.hint` の内容を確認していない。hint が変更されてもテストが通る状態。 | fail ケースのテストに `expect(result.hint).toContain("GH_TOKEN")` / `"gh auth login"` / `"specrunner login"` を追加する。 | yes |
| 3 | MEDIUM | testing | `tests/core/doctor/checks/auth/github-token-valid.test.ts` | TC-019（must）THEN 条件が未検証。`returns fail when token is not configured` が `result.status === 'fail'` のみで `result.hint` を確認していない。 | 上記と同様に hint の 3 ガイダンスを検証するアサーションを追加する。 | yes |
| 4 | MEDIUM | testing | `tests/unit/util/env-filter.test.ts` | TC-001/TC-002（must）が実質的に弱い。test (a) の入力 env に `GH_TOKEN` が含まれないため、`SECRET_DENYLIST` ループで `result["GH_TOKEN"]` が `undefined` なのは trivially true。GH_TOKEN を含む env に対する stripping が直接テストされていない。 | test (a) の env に `GH_TOKEN: "ghp_secret"` を追加し、stripped されることを明示的に確認する。 | yes |
| 5 | LOW | testing | `src/core/credentials/__tests__/github.test.ts` | TC-010（must）が未実装。spawnFn 自体が例外を throw するシナリオのテストがない（`catch {}` ブランチ未カバー）。`spawnCommand` は throw しないため production では dead code だが、テスト網羅上の欠落。 | `spawn: vi.fn().mockRejectedValue(new Error("spawn failed"))` を注入し、credentials.json にフォールスルーすることを確認するテストを追加する。 | yes |
| 6 | LOW | maintainability | `src/core/preflight.ts` | L24 の JSDoc コメントが「from credentials file or GITHUB_TOKEN env var」と旧仕様のまま。新しい解決順（GH_TOKEN → GITHUB_TOKEN → gh auth token → credentials.json）を反映していない。 | コメントを `Resolved GitHub token (GH_TOKEN/GITHUB_TOKEN env, gh auth token, or credentials file).` 等に更新する。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 8.70

## Summary

実装は正確。解決順反転（GH_TOKEN → GITHUB_TOKEN → gh auth token → credentials.json）・型追従・B-6 seam 経由 spawn・SECRET_DENYLIST 追加がすべて正しく適用されており、受け入れ基準はすべて実装レベルで満たされている。ブロッカーはテストの不完全さ：TC-012/TC-018/TC-019 の THEN 条件（hint 内容の検証）が欠落しており、must-priority 要件の regression を検出できない状態。hint アサーション追加と env-filter テストの補強が必要。

