# Code Review — worktree-freshness-and-conflict-guard — Iteration 1

## Meta

- **reviewer**: code-reviewer
- **iteration**: 1
- **verdict**: approved

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 10 | 0.25 | 2.50 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 9 | 0.10 | 0.90 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **9.05** |

## Summary

実装は request の全 9 要件を正確に充足している。責務分離（LocalRuntime が fetch、WorktreeManager は ref から worktree を作るのみ）が明確で、`spawnFn` の DI による testability も良い。DIRTY guard は preflight と orchestrator の両層で正しく実装されており、BEHIND は意図通り escalation しない。テストは主要パスを網羅しているが、resume パスの baseRef 検証に gap がある。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/unit/core/runtime/local.test.ts (TC-LR-003, TC-LR-004) | resume パス（existingWorktreePath が存在しない / null）のテストが `manager.create()` の第 4 引数 `"origin/main"` を検証していない。baseRef が変更されても検出できない | 両テストに `expect((manager.create as any).mock.calls[0]?.[3]).toBe("origin/main")` を追加する |
| 2 | LOW | correctness | src/core/runtime/local.ts:136 | `HEAD..origin/main` は HEAD（現在のブランチ）からの距離を測る。main ブランチ以外から `specrunner run` を実行した場合、warning メッセージ "local main is N behind" が不正確になる | spec が `HEAD..origin/main` を指定しているため現状で仕様準拠。将来改善時に `main..origin/main` への変更を検討 |
| 3 | LOW | testing | tests/unit/core/runtime/local.test.ts | `rev-list` 失敗時（`behindExitCode !== 0`）に warning をスキップして正常継続する分岐の明示テストがない | `buildMockSpawnFn({ behindExitCode: 1 })` で warning なし・throw なしを検証するテストを追加 |

## Acceptance Criteria Verification

- [x] `LocalRuntime.setupWorkspace()` の run パスで `git fetch origin` が走る — local.ts:128
- [x] `WorktreeManager.create()` に `baseRef` 引数があり、`origin/main` が渡される — manager.ts:62, local.ts:149
- [x] worktree が `origin/main` から作成される — manager.ts:70 で `ref` を使用
- [x] ローカル main が behind の場合 warning が出る — local.ts:141-144
- [x] finish で mergeStateStatus が DIRTY の場合、polling を即打ち切り escalation になる — preflight.ts:388, orchestrator.ts:209
- [x] BEHIND は escalation にならず merge を試みる — preflight.ts の DIRTY チェック後は retry 継続
- [x] resume の worktree 再作成パスでも `origin/main` が baseRef として渡される — local.ts:103, 117
- [x] `bun run typecheck && bun run test` が green — verification-result.md: 119 files, 1097 tests passed

## TODO Comments (Requirement 8)

- [x] `WorktreeManager.create()` — manager.ts:64
- [x] `LocalRuntime.setupWorkspace()` run パス — local.ts:148
- [x] `LocalRuntime.setupWorkspace()` resume パス 1 — local.ts:102
- [x] `LocalRuntime.setupWorkspace()` resume パス 2 — local.ts:116
- [x] `finish/orchestrator.ts` Phase 4 — orchestrator.ts:262
