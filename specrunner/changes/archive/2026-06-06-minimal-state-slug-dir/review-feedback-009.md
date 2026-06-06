# Code Review Feedback — minimal-state-slug-dir — iter 9

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
- **iteration**: 009

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | testing | tests/store/job-state-store.test.ts | **TC-025 の `request.slug`/`request.path` strip に対する assert が未追加。** TC-009 テスト（slug mode persist）は `worktreePath`/`pid`/`session` の除去を assert するが、`request.slug`/`request.path` が state.json から除去されることを assert していない。`loadSplitLayout` が load 時に inject し `stateToStateJson` が slug mode で strip する経路は実装済みだが、テストが initial state.json に slug/path を含まないため経路が踏まれていない。must 優先テストケース（TC-025）として test-cases.md に記載されているが対応 assert が存在しない。 | TC-009 テストの initial state.json に `slug`/`path` を含む `request` を使い、persist 後の state.json に `parsed.request.slug` / `parsed.request.path` が undefined であることを assert する行を追加する。 | no |
| 2 | LOW | maintainability | src/state/schema.ts, src/state/helpers.ts | **`StepRun.modelUsage` / `StepResultInput.modelUsage` の型定義が残存。** T-08 AC「events.jsonl / state.json に modelUsage が含まれない」は `stepRunToRecord` の除外により満たされているが、`StepRun.modelUsage?: Record<string, ModelUsage>` と `StepResultInput.modelUsage` が型定義に残る。新規書き込みで modelUsage は渡されないため実害はない。 | 別 change で型定義から除去する。 | no |
| 3 | LOW | maintainability | src/store/event-journal.ts | **`StepAttemptRecord` JSDoc が stale（iter 7-8 継続）。** "Stage 1 includes modelUsage; Stage 2 removes it when finish-batch-derive is abolished." が残っているが、modelUsage は `stepRunToRecord` で除外済み。 | JSDoc を更新する。 | no |
| 4 | LOW | correctness | src/store/event-journal.ts | **`fold` の非末尾 malformed 行 silent-skip とコメントの乖離。** コメント "Partial tail: only the last line can be partial." と実装の L157-159（非末尾も `continue`）がずれている。単一 writer 前提では非末尾 malformed は発生しないが、コメントが誤解を招く。 | コメントを「非末尾 malformed はベストエフォートでスキップ」に修正する。 | no |

## Resolved from iter 8

| # | Finding | Resolution |
|---|---------|-----------|
| 1 | HIGH: `handleGlobalExit` が slug ベース state に `awaiting-resume` を書かない | `src/core/command/runner.ts:92` で `process.on("beforeExit", createExitGuardHandler(repoRoot, jobState.jobId))` に変更済み。`handlePerJobExit` が worktree から slug を特定し `JobStateStore(jobId, repoRoot, { slug, stateRoot: worktreePath })` で `changes/<slug>/state.json`（branch state）に `awaiting-resume` を書く。exit-guard.test.ts TC-037-1 / TC-037-2 が green で確認済み。 ✓ |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.90

## Summary

iter 8 の唯一のブロッカー（`beforeExit` が branch state に `awaiting-resume` を書かない）が `runner.ts` の per-job exit guard 化により解消された。

`bun run typecheck && bun run test` は 273 files / 3233 tests all green。MUST 受け入れ基準はすべて満たされている。残存 Finding #1〜#4 はすべて LOW / Fix=no。
