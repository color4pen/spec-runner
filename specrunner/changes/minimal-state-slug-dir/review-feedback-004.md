# Code Review Feedback — minimal-state-slug-dir — iter 4

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
- **iteration**: 004

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | testing | tests/store/event-journal.test.ts (missing case) | **TC-040 (should): fold → resumePoint materialize from interruption — 依然未テスト。** `loadSplitLayout` L669-677 に `lastInterruption` → `resumePoint` の materialize 実装はあるが、`appendInterruption` → `store.load()` → `state.resumePoint.reason` の end-to-end パスを検証するテストケースがない。iter 3 finding 4 から持ち越し。 | `tests/store/event-journal.test.ts` に interruption record を append した events.jsonl + state.json で `store.load()` を呼び `state.resumePoint.reason` が期待値になることをアサートするケースを追加する。 | yes |
| 2 | LOW | testing | tests/util/paths.test.ts (missing cases) | **TC-034 (should): `slugStateJsonPath` / `slugEventsPath` / `livenessJsonPath` / `managedMarkerPath` — paths.test.ts に追加されていない。** T-06 で追加した 4 ヘルパーが `tests/util/paths.test.ts` で依然テストされていない。iter 3 finding 5 から持ち越し。 | `tests/util/paths.test.ts` に各ヘルパーの期待値（例: `slugStateJsonPath("foo") → "specrunner/changes/foo/state.json"`、`livenessJsonPath("bar") → ".specrunner/local/bar/liveness.json"`）を追加する。 | yes |

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

iter 3 のブロッカー（TC-037 must テスト / TC-009 must テスト / T-09 cancel・archive の worktreePath 経路）をすべて解消している。`bun run typecheck && bun run test` は 273 files / 3212 tests all green。

**iter 3 finding 1 → 解消**: `tests/unit/core/lifecycle/exit-guard.test.ts`（233 行・5 ケース）が新設され、TC-037-1（per-job 分離：対象 job のみ `awaiting-resume`、他 job は不変）と TC-037-2（worktree 未発見時の global scan フォールバック）を検証している。

**iter 3 finding 2 → 解消**: `tests/store/job-state-store.test.ts` TC-009 が追加され、slug mode で `persist` した state.json に `worktreePath` / `pid` / `session` が含まれないことをバイトレベルで検証している。

**iter 3 finding 3 → 解消**: `cancel/runner.ts` の `resolveWorktreePathForJob` と `archive/orchestrator.ts` の `resolveWorktreePathForArchive` に sidecar（liveness.json）→ `buildWorktreePath(repoRoot, slug, jobId)` 規約の 2 段 fallback が実装され、slug-mode で `worktreePath` が state.json から除去された場合でも worktree 削除が成立する。

残り 2 件はいずれも `should` 優先度（TC-040・TC-034）で機能をブロックしない。tasks.md 上 `[ ]` として明示されている T-08 fileContent/modelUsage 除去・T-14〜T-17 は次イテレーション向けであり本イテレーションはブロックしない。

