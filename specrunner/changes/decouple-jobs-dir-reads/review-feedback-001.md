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

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | testing | `tests/unit/core/archive/orchestrator.test.ts` | TC-032/TC-034（must-priority）が未検証。Phase 2 の `fs.readFile` モックが `""` を返すため `JSON.parse("")` が SyntaxError で silent skip し、`liveness.json.worktreePath` への書き込みが実際には実行されない。jobs-dir read/write の不在も同様に未アサート。tasks.md T-07「archive Phase 2（T-06）: jobId ストアへ触れず sidecar の worktreePath が `null` になることを検証する」の `[x]` チェックは実態と乖離しており、D5 invariant の検証機能が完全に欠落している。 | TC-005 を拡張するか専用テストを追加する。`makeFs()` の `readFile` を `JSON.stringify({ jobId, worktreePath: "/tmp/wt", pid: 1 })` を返すよう差し替え、Phase 2 後に `fs.writeFile` が `worktreePath: null` を含む payload で呼ばれたことをアサートする。TC-034 では `JobStateStore` の instance `.load()` / `.persist()` が Phase 2 で呼ばれないことを spy で確認する。 | yes |
| 2 | LOW | testing | `tests/unit/core/cancel/runner.test.ts`, `tests/unit/cli/resume.test.ts`, `tests/unit/cli/job-show.test.ts` | TC-026/TC-027/TC-028 の caller migration テストが sidecar → slug-dir 経路を経由していない。`makeJob` はすべて jobs-dir + slug-dir を書くが `liveness.json` を作らないため、`loadStateByJobId` は fallback readFile に落ちる。helper 自体（`load-by-job-id.test.ts` TC-021–025）は網羅済みで機能的には問題ない。 | 各 caller テストの `makeJob` に `liveness.json` sidecar 書き込みを追加し、sidecar primary path を確認する。1 件ずつ追加すれば十分。 | yes |
| 3 | LOW | performance | `src/store/job-state-store.ts` L409-411 | `resolveId()` が `list()` と `listLocalSidecars()` を並列で呼ぶが、`list()` 内部（L331）も `listLocalSidecars()` を呼ぶ。`.specrunner/local/` の readdir が 1 回の `resolveId` で 2 回発生する。 | `list()` が sidecar entries を戻り値に含めて返すか、内部 API を共通化して 1 回に削減する。本 request スコープ外なら tech-debt として後続 request に残す。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 8.30

## Summary

実装は設計仕様（D1–D6）を忠実に再現しており、3317 件すべてのテストが green。`local-job-index.ts`・`loadStateByJobId`・caller migration（job-show / cancel / resume / resolve-target）・archive Phase 2 sidecar repoint のいずれも意図通り実装されている。`list()` の section 3（jobs-dir readdir）撤去、`resolveId()` の sidecar union、managed section 4 温存はいずれも要件通り。

ブロッキング指摘は 1 件：archive Phase 2 の sidecar write（TC-032/TC-034 must-priority）がテストで実際には検証できていない。`makeFs().readFile` が `""` を返すことで JSON.parse が例外を投げ、best-effort catch で silent skip される。D5 の不変条件（jobs-dir read/write ゼロ・sidecar worktreePath クリア）を保証するテストを追加してから approve する。

非ブロッキング指摘は TC-026–028 の caller テスト（sidecar primary path 未確認）と `resolveId` の二重 readdir（tech-debt 候補）。
