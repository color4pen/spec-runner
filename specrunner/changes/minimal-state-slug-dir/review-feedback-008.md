# Code Review Feedback — minimal-state-slug-dir — iter 8

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
- **iteration**: 008

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | correctness | src/core/lifecycle/exit-guard.ts | **`handleGlobalExit` が slug ベース state に `awaiting-resume` を書かない（conformance-result-005 不適合）。** `registerExitGuard(cwd)` は jobId なしで登録されるため、`beforeExit` 発火時に `handleGlobalExit` が呼ばれる。この経路では `new JobStateStore(state.jobId, repoRoot)`（slug opts なし）で persist するため、slug モードの job は機械ローカルの `.specrunner/jobs/<jobId>/state.json` にのみ `awaiting-resume` が書かれ、`changes/<slug>/state.json`（branch 同伴）には書かれない。MUST 受け入れ基準「exit-guard が自 worktree の branch state に `awaiting-resume` を記録して resume が成立する」を満たさない。SIGTERM/SIGINT 経路は `LocalRuntime.registerCleanup` の signal handler が slug ベースストアへ正しく書くため問題ない。CI re-checkout resume は `isStaleRunning` がサイドカー不在を stale と判定することで機能的に回避できるが、branch state が `running` のまま残り MUST 要件を形式上満たさない。 | `run.ts` / `resume.ts` の `registerExitGuard` 呼び出しを `createExitGuardHandler(repoRoot, jobId)` に置き換える（jobId は `CommandRunner.execute` 内で `prepared.jobState.jobId` から取得可能）。または `handleGlobalExit` 内で list() 由来の state に slug 情報を付加して slug ベースストアへも書く。 | yes |
| 2 | LOW | maintainability | src/store/event-journal.ts | **`StepAttemptRecord` JSDoc が stale（iter 7 継続）。** "Stage 1 includes modelUsage; Stage 2 removes it when finish-batch-derive is abolished." という記述が残っているが、modelUsage はすでに除去済み。 | JSDoc を更新する。 | no |
| 3 | LOW | testing | tests/store/job-state-store.test.ts | **TC-017/TC-018（archive scan / legacy dual-read）の `list()` 直接テストが未追加（iter 7 継続）。** | 別 change で追加する。 | no |
| 4 | LOW | correctness | src/store/job-state-store.ts | **archived job の `request.path` 注入パス誤り（iter 7 継続）。** `loadSplitLayout` に `{ slug: archiveSlug, stateRoot: repoRoot }` を渡すため `request.path` が `{repoRoot}/specrunner/changes/{archiveSlug}/request.md`（非実在）に設定される。archived job は resume しないため実害は限定的。 | archive load では slugInject を渡さないか、`stateRoot` を archiveDir にする。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.65

## Summary

conformance-result-005 が `needs-fix` を示した `handleGlobalExit` の branch state 未更新問題が唯一のブロッカー。

`bun run typecheck && bun run test` は 273 files / 3233 tests all green。SIGTERM/SIGINT 経路・slug ベース実装全体の品質は高く、MUST 受け入れ基準の大半は満たされている。

**Finding #1 のみ要修正**（Fix=yes）。`beforeExit` 経路で slug ベースストアへ `awaiting-resume` を書くよう修正すれば approved 相当。#2〜#4 は LOW / Fix=no。

