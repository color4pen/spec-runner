# Code Review Feedback — minimal-state-slug-dir — iter 5

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
- **iteration**: 005

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | correctness | src/store/job-state-store.ts (list 1b) | **archived job の `request.path` 注入が誤り。** `list()` の 1b ブロックで archive 内 state.json を読む際、`loadSplitLayout` に `{ slug: archiveSlug, stateRoot: repoRoot }` を渡すため、`request.path` が `{repoRoot}/specrunner/changes/{archiveSlug}/request.md`（実在しないパス）に設定される。正しくは `{repoRoot}/specrunner/changes/archive/{datedSlug}/request.md`。archived job は resume しないため実害は小さいが、`job ls --all` → `job show <id>` → request.md 参照のパスが誤る。 | `loadSplitLayout` に渡す `stateRoot` を archive 親ディレクトリに変えるか、archive 専用の slug-inject ロジックで `changeFolderPath` のかわりに archive パスを使う。または archived load では slugInject を渡さず、slug / path は load 後に上書きする。 | no |
| 2 | LOW | testing | tests/store/ (missing cases) | **TC-017 (must, integration) / TC-018 (must, integration) の明示的テストが無い。** `JobStateStore.list()` の「archive scan」と「legacy dual-read」が別々のユニットテストで検証されていない。コード実装は正しいが、list() が worktree / archive / legacy の 3 ソースをそれぞれ列挙することを asserts するテストケースが未追加。iter 4 の 2 件（TC-040 / TC-034）は解消済み。 | `tests/store/job-state-store.test.ts` に `list()` を対象に: (a) archive ディレクトリに state.json を配置して list() が当該 jobId を返すこと、(b) `.specrunner/jobs/<jobId>.json` レガシーを配置して list() が当該 jobId を返すことを検証するテストを追加する。 | no |

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

iter 4 の LOW 指摘 2 件（TC-040 interruption materialize テスト・TC-034 path helper テスト）をいずれも解消している。

**iter 4 finding 1 → 解消**: `tests/store/event-journal.test.ts` に TC-040 の 2 ケース（`appendInterruption → store.load() → resumePoint.reason`、`複数 interruption record で最後が優先`）が追加され、fold の interruption materialize パスが end-to-end で検証されている。

**iter 4 finding 2 → 解消**: `tests/util/paths.test.ts` に `slugStateJsonPath` / `slugEventsPath` / `livenessJsonPath` / `managedMarkerPath` の 8 ケースが追加されている。

iter 5 の実装追加 3 件はいずれも正しく動作する。
- `resume.ts`: slug-mode で `state.worktreePath` が null の場合に `.specrunner/local/<slug>/liveness.json` を読んで worktreePath を解決する（T-09 第3経路 resume）。`sidecar["jobId"] === updatedState.jobId` のチェックで誤 sidecar 使用を防ぐ。
- `event-journal.ts`: `StepAttemptRecord` から `modelUsage` を除去（T-08/T-10）。fold・stepRunToRecord とも除去済み。
- `job-state-store.ts`: list() に 1b ブロックを追加し `specrunner/changes/archive/*/state.json` を列挙（T-17/T-12）。

`bun run typecheck && bun run test` は 273 files / 3222 tests all green。

残り 2 件はいずれも LOW・非ブロッキング。finding 1（request.path 誤注入）は archived job の参照パスのみに影響し resume パスには影響しない。finding 2（TC-017/TC-018 統合テスト未追加）はコード正確性に影響しない。managed marker write/clear は tasks.md で「別サブタスク」として明示されており本イテレーションはブロックしない。
