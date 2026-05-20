# runFinishOrchestrator をフェーズ関数に分割する

## Meta

- **type**: refactoring
- **slug**: refactor-finish-orchestrator-phases
- **base-branch**: main

## 背景

`src/core/finish/orchestrator.ts` の `runFinishOrchestrator`（L64-316、約 250 行）に Phase 0〜4 の 5 フェーズが線形に展開されている。Phase 1-3 は `!prAlreadyMerged` 条件内に約 100 行ネストし、Phase 4 は worktree 有無 × isOnMain で 3 分岐する。

既に `checkoutFeatureBranch`, `pushFeatureBranch`, `mergeFeaturePrPhase3` がヘルパーとして抽出されているが、Phase 1 の archive/move/commit 部分と Phase 4 の cleanup/checkout 部分が未分離のまま runFinishOrchestrator 内にインラインで展開されている。

**前提**: R1（refactor-finish-preflight-split）で preflight.ts の分割と orchestrator.ts の import 変更が完了していること。

## 要件

### 1. Phase 1 の関数抽出

1. Phase 1（feature branch checkout → archive → git mv → commit）のロジックを `runPhase1Archive` 関数として同ファイル内に抽出する。archiveOpenspec, moveRequestsDir, git add/commit の一連を含む

### 2. Phase 2 の関数抽出

2. Phase 2（git push）のロジックを `runPhase2Push` 関数として抽出する。既存の `pushFeatureBranch` を内部で呼ぶ薄いラッパーでよい

### 3. Phase 4 の関数抽出

3. Phase 4（worktree cleanup / markJobArchived / git checkout+pull / branch 削除）のロジックを `runPhase4Finalize` 関数として抽出する。worktree 有無の分岐を含む

### 4. runFinishOrchestrator のディスパッチャ化

4. `runFinishOrchestrator` を各 Phase 関数の呼び出しとエラーハンドリングのみに縮小する。目標は 80 行以下

## スコープ外

- preflight.ts の分割（R1 で対応済みの前提）
- Phase 関数の更なる分割（各 Phase 内部の構造は現状維持）
- finish 以外のモジュールの変更
- spawnOrEscalate の追加適用（R1 で導入済みのヘルパーを使うかは実装者判断）

## 受け入れ基準

- [ ] runFinishOrchestrator が 80 行以下のディスパッチャになっている
- [ ] Phase 1, 2, 4 がそれぞれ独立した関数として抽出されている
- [ ] 全既存テストが pass する（振る舞い不変）
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
