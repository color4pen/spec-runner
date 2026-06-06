# Code Review Feedback — minimal-state-slug-dir — iter 3

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
- **iteration**: 003

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | testing | tests/ (missing) | **TC-037 (must): `createExitGuardHandler(repoRoot, jobId)` per-job 分離テスト未実装。** T-13 で実装した per-job 終了ガードの「他 job の state に副作用を与えない」動作が全く検証されていない。test-cases.md に "unit / must" として定義され、tasks.md T-13 AC「guard が jobId を受け取り、自 job のみを遷移させる」も明示的に要求している。実装はあるが正確性の保証がない。 | `tests/unit/core/lifecycle/exit-guard.test.ts` を新規作成し、(1) 複数 job が存在する状態で `createExitGuardHandler(repoRoot, targetJobId)` が発火したとき対象 job の state だけが `awaiting-resume` に遷移し他 job は変化しないこと、(2) jobId に対応する worktree が見つからない場合は global scan にフォールバックすることをアサートする。 | yes |
| 2 | MEDIUM | testing | tests/ (missing) | **TC-009 (must): slug-mode state.json から machine-local 値が除去されることのテスト未実装。** `stateToStateJson` の `slugMode: true` パスが `worktreePath` / `pid` / `session` を strip する実装（`job-state-store.ts` L719-727）は存在するが、実際に生成される state.json にこれらが含まれないことを確認する must テストがない。 | `tests/store/job-state-store.test.ts` に slug モードで `persist` した state.json のバイト列を読んで `worktreePath` / `pid` / `session` キーが存在しないことをアサートするテストを追加する。 | yes |
| 3 | MEDIUM | correctness | src/core/cancel/runner.ts:76, src/core/archive/orchestrator.ts:77 | **T-09 [ ]: cancel / archive が slug-mode で null になる `state.worktreePath` を読むため worktree が片付かない。** slug-based state では `worktreePath` が state.json から除去されるため、どちらも `worktreePath = null` を得て worktree 削除をスキップする。受け入れ基準「worktreePath を読む archive / cancel の各経路が動作する」を満たさない。tasks.md T-09 `[ ]` として明示された未着手タスクのため次イテレーション向け。 | cancel: `src/core/cancel/runner.ts` の `cleanupJobResources` に sidecar（`liveness.json`）→ `buildWorktreePath(repoRoot, slug, jobId)` 規約再導出の 2 段 fallback を追加する。archive: `src/core/archive/orchestrator.ts` Phase 2 も同様。tasks.md T-09 `[ ]` を完了させる。 | yes |
| 4 | LOW | testing | tests/store/event-journal.test.ts (missing case) | **TC-040 (should): fold が末尾 interruption record から `resumePoint` を materialize することのテスト未実装。** `loadSplitLayout` L669-677 に実装はあるが、interruption record を append した events.jsonl + state.json に対して `load()` が `resumePoint` を正しく復元することを確認するテストがない。 | `tests/store/event-journal.test.ts` に interruption record を append 後 `store.load()` を呼び `state.resumePoint.reason` が正しい値になることをアサートするケースを追加する。 | yes |
| 5 | LOW | testing | tests/util/paths.test.ts | **TC-034 (should): 新規 path helper（`slugStateJsonPath` / `slugEventsPath` / `livenessJsonPath` / `managedMarkerPath`）のテストが paths.test.ts に存在しない。** T-06 で追加した 4 helper が `tests/util/paths.test.ts` にインポートも記述もない。 | paths.test.ts に各 helper の期待値（例: `slugStateJsonPath("foo") → "specrunner/changes/foo/state.json"`）をアサートするケースを追加する。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 8.35

## Summary

段2 の主要機能（T-06 path helpers・T-07 slug-based list/buildDeps・T-09 liveness sidecar 書き込み・T-10 usage per-step・T-11 interruption record・T-12 worktree スキャン・T-13 per-job exit guard・T-18 doctor checks）は設計仕様（D5〜D8）に忠実に実装されており、`bun run typecheck && bun run test` は 272 files / 3206 tests all green。

**ブロッカーは finding 1（TC-037 must テスト欠如）。** T-13 で実装した per-job exit guard の分離動作（他 job に副作用を与えない）が未検証であり、test-cases.md の must 要件を満たさない。このテスト 1 件を追加すれば finding 1 は解消する。

finding 2（TC-009）はやはり must テストだが、実装ロジック（`stateToStateJson` の slugMode strip）は単純で誤りのリスクが低い。finding 3（T-09 cancel/archive pathways）は tasks.md 上 `[ ]` として明示された既知未着手であり次イテレーションで対応する内容。finding 4・5 は should 優先度。

以下の点は今回のイテレーション内で正しく実装されている:
- `stateToStateJson` の slugMode による worktreePath / pid / session の strip（D8）
- `loadSplitLayout` の slug inject（request.slug / request.path を convention から復元、D5）
- `LocalRuntime.writeLivenessSidecar` が `{pid, session: null, worktreePath, jobId}` を `.specrunner/local/<slug>/liveness.json` に書く（D8）
- `isStaleRunning` が sidecar path を優先して pid を参照する（D8 / T-13）
- `deriveAndWriteUsage` の no-op 化と executor の per-step usage append（T-10）
- `appendInterruption` と exit-guard / signal handler での interruption event 記録（T-11）
- `JobStateStore.list()` が slug-based（current checkout + worktrees）・split-layout・legacy を合成列挙（T-12）

tasks.md で `[ ]` のまま残っている T-08 fileContent/modelUsage 除去・T-09 worktreePath 3 pathways・T-12 managed marker・T-13 worktree 不変量・T-14〜T-17 は次イテレーション向けであり、今回はブロックしない。

