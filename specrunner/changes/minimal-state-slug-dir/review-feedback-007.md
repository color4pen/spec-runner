# Code Review Feedback — minimal-state-slug-dir — iter 7

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
- **iteration**: 007

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | maintainability | src/store/event-journal.ts | **`StepAttemptRecord` JSDoc コメントが stale。** "Stage 1 includes modelUsage; Stage 2 removes it when finish-batch-derive is abolished." という記述が残っているが、conformance 修正で modelUsage はすでに record から除去済み。インターフェース自体は正しい。 | JSDoc を "modelUsage は除去済み" に更新する。 | no |
| 2 | LOW | testing | tests/store/job-state-store.test.ts | **TC-017（archive scan）・TC-018（legacy dual-read）の list() 直接テストが未追加（iter 6 継続）。** コード実装は正しいが、archive ディレクトリと `.specrunner/jobs/<jobId>.json` を列挙することを assert するテストがない。 | 別 change で追加する。 | no |
| 3 | LOW | correctness | src/store/job-state-store.ts | **archived job の `request.path` 注入パス誤り（iter 6 継続）。** `loadSplitLayout` に `{ slug: archiveSlug, stateRoot: repoRoot }` を渡すため `request.path` が `{repoRoot}/specrunner/changes/{archiveSlug}/request.md`（非実在）に設定される。archived job は resume しないため実害は限定的。 | archive load では slugInject を渡さないか、stateRoot を archiveDir にする。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.95

## Summary

iter 6 で approved 済みの実装に、conformance 修正（`modelUsage` の journal record からの除去・`job ls` 既定フィルタを `!isTerminal` に修正）が適用されたイテレーション。

`bun run typecheck && bun run test` は 273 files / 3233 tests all green。受け入れ基準はすべて満たされている。

残存 3 件はいずれも LOW・非ブロッキングで Fix=no（別 cleanup change の余地あり）。
