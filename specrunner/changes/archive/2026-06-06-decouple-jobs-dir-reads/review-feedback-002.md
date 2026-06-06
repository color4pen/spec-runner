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
| 1 | LOW | testing | `tests/unit/core/cancel/runner.test.ts`, `tests/unit/cli/resume.test.ts`, `tests/unit/cli/job-show.test.ts` | iter-001 finding #2 が部分的にしか対応されていない。TC-029（resolve-target）は `makeJobWithPr` に `liveness.json` が追加され sidecar primary path を検証済み。しかし TC-026（job-show）はストアを全モック、TC-027（cancel）の `makeJob` は `liveness.json` を書かないため fallback path 経由、TC-028（resume）はスラグ解決を使用し `loadStateByJobId` の jobId 経路を通らない。must-priority の 3 ケースで sidecar primary path が caller 層で未検証のまま。 | cancel テストの `makeJob` に `liveness.json` 書き込みを追加し、`loadStateByJobId` が sidecar → slug-dir 経路でロードすることを確認。job-show はモック境界の都合上スキップ可。resume は jobId-prefix-fallback branch を別途 1 件追加（slug 不在 → resolveId が sidecar 一致 jobId を返す → `loadStateByJobId` sidecar 経路を通る）。 | no |
| 2 | LOW | performance | `src/store/job-state-store.ts` L409–411 | iter-001 finding #3 継続：`resolveId()` が `Promise.all([list(), listLocalSidecars()])` を並列実行するが、`list()` 内部（L331）も `listLocalSidecars()` を呼ぶため `.specrunner/local/` readdir が 1 回の `resolveId` で 2 度発生。 | `list()` の戻り値に sidecar entries を含めるか内部 API を共有化。本 request スコープ外のため後続 request で対処。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 8.70

## Summary

iter-001 のブロッキング指摘（HIGH）が解消された。

**解消済み（iter-001 finding #1）**：TC-032 と TC-034 が正しく実装された。`mockFs.readFile` が `JSON.stringify({ jobId, worktreePath: "...", pid: 1 })` を返すよう修正され、Phase 2 後に `fs.writeFile` が `worktreePath: null` を含む payload でサイドカーパスに呼ばれることを確認。また `JobStateStore.list` の呼び出し回数（Phase 0 の 1 回のみ）および `.specrunner/jobs/` パスへの read/write ゼロも検証済み。D5 不変条件は適切にアサートされている。

**部分解消（iter-001 finding #2）**：TC-029（resolve-target）では `makeJobWithPr` に `liveness.json` sidecar が追加され、`--job <jobId>` 経路が sidecar → slug-dir を経由することを確認。しかし TC-026/027/028 は未対応（残 LOW 指摘 #1）。

残存の 2 件はいずれも LOW かつ fix=no の tech-debt／テスト補強であり、機能的な正確性に影響しない。すべての受け入れ基準（jobs-dir readdir ゼロ・cross-branch/managed 可視性維持・dual-write 温存・typecheck + 3317 tests green）を充足する。
