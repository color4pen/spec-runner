# Spec Review Result — worktree-based-job-execution

- **iteration**: 2
- **date**: 2026-05-07
- **verdict**: approved
- **reviewed**: proposal.md, design.md, tasks.md

## Previous Iteration Resolution

Iteration 1 の 6 findings（HIGH: 2, MEDIUM: 3, LOW: 1）は全て修正済み:

| Iter 1 # | Severity | Status | Resolution |
|----------|----------|--------|------------|
| 1 | HIGH | **resolved** | D1/D3 を `--detach HEAD` モードに統一。`-B main` 記述を除去 |
| 2 | HIGH | **resolved** | D3 を単一方式（detach → propose 後に branch 切り替え）に確定。「または」併記を除去 |
| 3 | MEDIUM | **resolved** | `create(repoRoot, slug, jobId)` に slug パラメータを追加 |
| 4 | MEDIUM | **resolved** | tasks.md 4.5 に managed mode の finish テストケースを追加 |
| 5 | MEDIUM | **resolved** | Risks に「warm cache 時は実測 3-5 秒以内」の時間見積もりを追記 |
| 6 | LOW | **resolved** | tasks.md 2.1 のコピー対象を「request.md 単体」に明確化 |

## Summary

iteration 1 の HIGH findings が全て解消され、設計文書と実装タスクの整合性が取れた。`--detach HEAD` モードへの統一、slug パラメータの追加、managed mode テスト戦略の追加により、実装を阻害する曖昧さは解消されている。残存 findings は proposal.md の記述更新漏れと LOW レベルの明確化のみ。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | proposal.md:32-33,46-47 | proposal.md の "Modified Capabilities" が `checkoutForValidation` / `restoreBranch` / `checkoutFeatureBranch` を「廃止」と記述しているが、design.md D6 はこれらを managed mode フォールバックとして維持する判断を下している。design.md の判断は合理的だが proposal.md が未更新 | proposal.md の finish-orchestration 記述を「local mode では不使用（managed mode フォールバックとして維持）」に修正する |
| 2 | LOW | completeness | design.md:67, tasks.md:17 | request 要件 6「request ファイルを worktree にコピーしてコミット」のうち「コミット」が design/tasks から欠落。propose step が worktree 内で自然にコミットする前提と推測されるが明記されていない | D3 step 1b に「propose step が worktree 内で branch 作成時にコミットするため、コピー時点でのコミットは不要」と理由を追記する |
| 3 | LOW | completeness | design.md:74 | 「propose step 完了後に worktree 内で `git checkout -B <feature-branch>` を実行する」の実行主体が不明確。propose step 自身が行うのか、run.ts が propose 完了後に行うのか | 括弧内の補足「pipeline の `deps.cwd` が worktree を指しているため propose step が自然に worktree 内で branch を切る」を D3 本文に昇格させ、実行主体を明確にする |

## Completeness Check

| Request Requirement | Spec Coverage | Status |
|---|---|---|
| Phase 1: WorktreeManager (create/remove/prune) | D1, Task 1.1 | covered |
| Phase 1: worktree path `.git/specrunner-worktrees/` | D1, Task 1.1 | covered |
| Phase 1: `bun install --frozen-lockfile` | D1, Task 1.1 | covered |
| Phase 1: JobState worktreePath | D2, Task 1.2-1.3 | covered |
| Phase 2: worktree 作成 (local runtime) | D3, Task 2.1 | covered |
| Phase 2: request file copy | D3, Task 2.1 | covered |
| Phase 2: deps.cwd 差し替え | D3, Task 2.1 | covered |
| Phase 2: state file 記録 | D2/D3, Task 2.1 | covered |
| Phase 2: signal handler | D7, Task 2.2 | covered |
| Phase 2: managed mode 不変 | D8, Task 2.4 | covered |
| Phase 3: finish worktreePath 読み取り | D6, Task 4.1-4.2 | covered |
| Phase 3: checkout 関数の扱い | D6, Task 4.1-4.2 | covered (維持判断、要件からの意図的逸脱) |
| Phase 3: crash recovery fallback | D6, Task 4.1 | covered (既存フロー維持) |
| Phase 3: worktree 削除 (Phase 4) | D6, Task 4.2 | covered |
| Phase 3: merge state polling | D6, Task 4.2 | covered |
| Phase 4: verification temp worktree 廃止 | D4, Task 3.1 | covered |
| Phase 4: propagate temp worktree 廃止 | D5, Task 3.2 | covered |
| Phase 4: verification での bun install 不要 | D4, Task 3.1 | covered |

## Codebase Verification

design.md が参照する既存コードの行番号とシンボルを検証した:

- `verification.ts` L47-96: temp worktree 作成 — **一致**
- `propagate.ts` L52-104: temp worktree 作成 — **一致**
- `orchestrator.ts` L197-241: worktree 検出ロジック — **一致**
- `orchestrator.ts` `checkoutFeatureBranch`: L262-305 — **存在確認**
- `preflight.ts` `checkoutForValidation`: L319-365 — **存在確認**
- `preflight.ts` `restoreBranch`: L377-385 — **存在確認**
- `schema.ts` `JobState`: L128-145（worktreePath 未追加）— **一致**
- `run.ts` `runRunCore`: L86-210 — **一致**

## Verdict Rationale

CRITICAL: 0, HIGH: 0。iteration 1 の HIGH findings が全て解消済み。残存 findings は MEDIUM: 1（proposal.md 記述更新漏れ）、LOW: 2（設計意図の明記不足）のみ。いずれも実装を阻害しない。
