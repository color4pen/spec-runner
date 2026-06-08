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
| 1 | MEDIUM | testing | `tests/unit/core/verification/test-coverage.test.ts` | TC-005 / TC-006 / TC-011 / TC-012（いずれも must）に対応するユニットテストが存在しない。TC-005 は「IMPLEMENTER_SYSTEM_PROMPT に `tests/` 固定 grep 表現がないこと」、TC-006 は「TEST_CASE_GEN_SYSTEM_PROMPT に同様の表現がないこと」、TC-011 は「既存テスト配置パターンに従うガイダンスが含まれること」、TC-012 は「test-coverage.ts に `path.join(cwd, "tests")` 固定参照がないこと」の unit テスト。test-coverage phase で TC-001〜TC-013 の旧 ID が既存テスト関数名に含まれているため test-coverage gate は偶発的に通過するが、実際の検証コードは存在しない。実装は正しいが、これら 4 つの must TC に対するリグレッション防止テストが欠落している。 | 既存の `test-coverage.test.ts` またはプロンプト専用のテストファイルに、（1）`IMPLEMENTER_SYSTEM_PROMPT` が固定の `tests/` grep 表現を含まないこと、（2）`TEST_CASE_GEN_SYSTEM_PROMPT` が固定の `tests/` 参照を含まないこと、（3）`IMPLEMENTER_SYSTEM_PROMPT` が「プロジェクトの既存テストの配置パターンに従う」旨のガイダンスを含むこと、（4）`test-coverage.ts` のソース文字列に `path.join(cwd, "tests")` が現れないこと（例: `fs.readFile` でソースを読んで `includes` で検証）を追加する。それぞれのテスト関数名または直前コメントに TC-005 / TC-006 / TC-011 / TC-012 を記載する。 | yes |
| 2 | LOW | testing | `tests/unit/core/verification/test-coverage.test.ts` | 新規追加テスト（collocated / .spec.ts / 後方互換 / 除外）の TC ID が TC-028〜TC-031 になっており、test-cases.md の TC-001〜TC-007 と対応していない。test-cases.md TC-001 = collocated test シナリオだが、テスト関数では TC-028 として記述されており、トレーサビリティが取れない。 | 新規テスト関数名 / describe 名の TC-028〜TC-031 を、test-cases.md の対応する TC ID（TC-001 / TC-002 / TC-003 / TC-004 / TC-007 / TC-008 など）に付け替えるか、または test-cases.md の対応 TC を TC-028〜TC-031 に更新してトレーサビリティを一致させる。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 5 | 0.10 |

- **total**: 8.40

## Summary

コア実装は正確。`collectProjectTestFiles` は `node:fs/promises` 再帰走査で `*.test.ts` / `*.spec.ts` のみを収集し、`node_modules` / `dist` / `.git` を完全一致で枝刈りする設計は design.md の判断（D1〜D4）に沿っている。`path.join(cwd, "tests")` 固定参照は test-coverage.ts から完全に除去されており、TC-012 の受け入れ基準を実装レベルで満たす。両プロンプト（implementer-system.ts / test-case-gen-system.ts）の `tests/` 固定表現も正しく除去・更新されている。`bun run typecheck && bun run test && bun run lint` はすべて green。

ブロッカーは test coverage の欠落のみ。TC-005 / TC-006 / TC-011 / TC-012（must）に対応するユニットテストがなく、test-coverage gate はこれらを既存テスト中の旧 ID 偶発一致で通過しているに過ぎない。プロンプト変更のリグレッション防止テストの追加と TC ID の対応付け修正を行えば approved となる。
