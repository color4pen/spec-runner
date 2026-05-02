# Code Review Result — finish-redesign — Iteration 1

## Verdict

- **verdict**: needs-fix
- **score**: 7.05 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (initial)
- **agents**: code-reviewer, security-reviewer (skipped — not enabled), pattern-reviewer
- **blocking_findings**: CRITICAL: 0, HIGH: 1

> security-reviewer は `pipeline-context.md` の `enabled: [test-case-generator, adr, module-architect, pattern-reviewer]` に含まれず `status: skipped`。code-reviewer 内で security 観点の暫定評価（subprocess injection / input validation）を補い、最終 weight は 0.85 で再正規化したスコアを併記する。

## Verification Summary

| Phase | Result | Details |
|-------|--------|---------|
| Build | PASS | tsc --outDir dist clean |
| Type Check | PASS | 0 errors |
| Lint | SKIP | no `lint` script in package.json |
| Tests | PASS | 721 / 721 (92 files), duration 2.26s |
| Security | PASS | npm audit: 0 vulnerabilities |

`test_count`: 721 (passed: 721, failed: 0)

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| correctness | 7 | 0.30 | 2.10 |
| security | 8 | 0.25 | 2.00 |
| architecture | 6 | 0.15 | 0.90 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 6 | 0.10 | 0.60 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **7.20** |

> security は subagent skip のため code-reviewer が暫定評価。再正規化（weight 0.75 = 全 weight − security 0.25）すると total 5.20 / 0.75 = **6.93**。canonical スコアは security を含めた **7.20** を採用する（spec-review iter2 と同じ補完方針）。一方 HIGH ≥ 1 が存在するため pass threshold を超えていても verdict は `needs-fix`。

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | architecture | src/core/finish/merge-feature-pr.ts (entire file) | 2-PR モデル時代の `mergeFeaturePr` step module。Phase 3 は orchestrator.ts:334 の内部関数 `mergeFeaturePrPhase3` に再実装され、`src/` 内のどこからも import されていない（参照は tests/finish-merge-feature-pr.test.ts のみ）。spec.md C3 の「2-PR モデル前提モジュールを削除」精神に反する dead code が残存し、prState ベースの分岐ロジック（OPEN_BEHIND / OPEN_CONFLICTS / OPEN_CHECKS_FAILING / CLOSED → 各種 escalation）と内部 Phase 3 実装の二重メンテ状態。次に finish 周辺を触る implementer が誤参照するリスクが高い | `src/core/finish/merge-feature-pr.ts` を削除。`tests/finish-merge-feature-pr.test.ts` も削除（既に Phase 3 の挙動は `tests/finish-orchestrator.test.ts` の TC-122/123/124/125 でカバー済み）。あわせて `src/core/finish/types.ts:65` の `cleanupOnly?: boolean` deprecated field と `src/core/finish/escalation.ts:37-58` の `getRecommendedAction` も削除（merge-feature-pr.ts 専用の dead chain）|
| 2 | MEDIUM | architecture | src/core/finish/pr-state.ts (entire file) | 同様に dead code。`src/` 内から import されておらず、参照は `tests/finish-pr-state.test.ts` のみ。orchestrator は `gh pr view` の結果を直接 `mergeStateStatus` 文字列で扱い、`NormalizedPrState` 型への正規化は使われていない。`MergeFeaturePrResult` 連鎖と一緒に削除候補 | `src/core/finish/pr-state.ts` を削除。`tests/finish-pr-state.test.ts` も削除。`src/core/finish/types.ts:10-26` の `NormalizedPrState` 型と `ALL_NORMALIZED_PR_STATES` も他箇所で参照されないか確認の上削除（escalation.ts の `getRecommendedAction` を削除すれば unused になる） |
| 3 | MEDIUM | maintainability | src/core/finish/archive-openspec.ts:62, 63, 78, 79 | escalation の `recommendedAction` / `resumeCommand` に `${jobId}` を埋め込んでいる。jobId は UUID（`state.jobId`）であり、ユーザに表示すると `specrunner finish <UUID>` という再実行コマンドになる。これは `--job` flag を経由しなければ動かないが、メッセージはそれを示唆していない。spec.md は再実行コマンドを `specrunner finish <slug>` 前提にしており、orchestrator / preflight / move-requests-dir は `target.slug` を渡している（一貫性 drift） | archive-openspec.ts の関数シグネチャを `slug` を受け取る形に変更し（既に slug 引数はある）、escalation の jobId 部分を slug に置き換える。あわせて `move-requests-dir.ts:65, 95` の `${jobId}` も slug に統一すべきか確認。orchestrator から渡される jobId は実装ロジック内では使われていないので関数引数からも削除できる |
| 4 | MEDIUM | maintainability | src/core/finish/types.ts:65 | `FinishFlags.cleanupOnly?: boolean` に `@deprecated Use dryRun instead` JSDoc が付いているが、CLI 入力（bin/specrunner.ts）からは渡されておらず実機能は無い。`merge-feature-pr.ts` 削除と同時に削除し、deprecated field の永続化を防ぐ | types.ts:65 の cleanupOnly 行を削除。orchestrator.ts:120 周辺の `flags.dryRun ?? false` のみ残すので、追加の修正は merge-feature-pr.ts 削除に伴う import 整理のみ |
| 5 | MEDIUM | correctness | src/core/finish/orchestrator.ts:200-225 | Phase 4 で無条件に `git checkout main` → `git pull --ff-only` を実行する。worktree 配下から finish を起動した場合、main worktree が別ディレクトリで checkout 中だと `git checkout main` は失敗する（`fatal: 'main' is already checked out at ...`）。spec.md C4 は Phase 4 を「markJobArchived + git checkout main + git pull --ff-only」と明記しているが、worktree シナリオでの挙動が定義されていない | (a) 現 worktree が main の場合のみ checkout する（`git rev-parse --abbrev-ref HEAD` で確認）、(b) `git fetch origin main` のみに変更する、(c) worktree のとき main 操作を skip する旨の警告を出す、のいずれかを採用。spec を更新して挙動を確定させる必要があれば spec.md cli-finish-command の Phase 4 を修正する |
| 6 | MEDIUM | architecture | src/core/finish/escalation.ts:37-58 | `getRecommendedAction(state, jobId, force)` は `merge-feature-pr.ts` 専用の helper で、内容は `--cleanup-only` 言及（line 49）/ `specrunner finish ${jobId} --force`（line 45, 47）など stale な CLI 文法を含む。`MERGED` 分岐の "Run without --cleanup-only to proceed" は spec から消えた flag に依存。即削除候補 | `getRecommendedAction` を削除。merge-feature-pr.ts と一緒に消えるなら追加修正は不要。escalation.ts は formatEscalation のみ残す |
| 7 | LOW | maintainability | src/core/finish/idempotency.ts:6 | コメントの `TC-046: feature MERGED + archive not done → skip merge, continue from archive` および `TC-057: archive PR already MERGED → skip archive` は 2-PR モデル時代の test case。現在 `isFullyFinished` は `state.status === "archived"` の単純判定のみ | コメントを `TC-126: state.status=archived → "Already archived" no-op` のみに更新（または現 TC との対応に書き換え） |
| 8 | LOW | maintainability | openspec/changes/finish-redesign/module-analysis.md:8-15 | `merge-feature-pr.ts` / `pr-state.ts` / `archive-pr.ts` を「既存コードパターン」として観察した記述が残っているが、本 PR で archive-pr.ts は削除済み、merge-feature-pr.ts/pr-state.ts も #1/#2 で削除推奨。module-analysis.md は propose 段階の生成物なので残してもよいが、その旨の補注（現状 vs 提案後）があると後続のレビュアーが混乱しない | module-analysis.md の冒頭に「§1.1 のリスト中、archive-pr.ts は削除済み、merge-feature-pr.ts / pr-state.ts は削除候補」の補注を追加するか、PR merge 前に section 1.1 を最新化 |
| 9 | LOW | testing | tests/finish-merge-feature-pr.test.ts, tests/finish-pr-state.test.ts | 削除予定 dead code に対する test だが、production code から参照されない module の test を維持し続けると CI 時間と認知コストが累積する | #1, #2 の削除に伴い、本 test ファイルも削除する |
| 10 | LOW | security | src/core/finish/preflight.ts:114-118, 188-192 | `slug` をそのまま subprocess args に渡している（`openspec validate <slug>`、`gh pr view`）。args 配列形式なので shell injection は防げるが、`slug` の文字種制約（記号や空白を含めない）が schema レベルで明文化されていない。register_branch handler / pipeline-context.md 経由の slug は実質的に安全だが、validation 層は将来的にあった方がよい | 現時点で実害は無いが、follow-up として `src/state/job-slug.ts` に `isValidSlug(s: string): boolean`（`/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/` 等）を追加し、register_branch handler / run.ts の slug populate / preflight 入口で assert する |

## Iteration Comparison

初回 iteration のため Improvements / Regressions / Unchanged Issues は無し。

## Summary

- **総合所見**: spec-change のスケールに対して実装は概ね spec を忠実に反映しており、テスト網羅性は高い（must シナリオ TC-101〜TC-129 系列は実装で網羅、721/721 PASS、`vi.fn()` での subprocess injection も統一）。slug を canonical schema field に固定する D1/D2 の方針は `getJobSlug` / `stripBranchPrefix` に集約されており、3 箇所以上で散在していた `path.basename` 呼び出しの整理は完了している。1-PR モデル転換も orchestrator.ts の Phase 0〜4 構造として再設計されている。
- **主要な指摘**: spec.md C3 の「2-PR モデル前提モジュールを削除」は archive-pr.ts のみ実行されており、その依存連鎖（merge-feature-pr.ts / pr-state.ts / getRecommendedAction / FinishFlags.cleanupOnly）が dead code として残存している。次に finish 周辺を触る implementer がこれらを誤って参照する構造的リスクがある。**HIGH #1 は本 spec-change の意図（"Capabilities の clean-up"）と直接衝突するため code-fixer での解消が必要**。
- **副次的指摘**: archive-openspec.ts の jobId/slug 不統一（MEDIUM #3）、Phase 4 の worktree-aware でない git checkout main（MEDIUM #5）。前者は code-fixer で即修正可能、後者は spec を補強するか follow-up で別途扱うかの判断が必要。
- **収束トレンド**: 初回。HIGH #1 を解消すれば iter 2 で `approved` 確実。MEDIUM #3 / #5 は次イテレーションで合わせて修正することを推奨。
