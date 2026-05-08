# Proposal: runFinishOrchestrator をフェーズ関数に分割する

## 現状

`runFinishOrchestrator` は L62-313 の約 250 行。Phase 0-4 が線形展開されており、Phase 1-3 は `!prAlreadyMerged` 条件内に約 100 行ネスト、Phase 4 は worktree 有無 x isOnMain で 3 分岐する。

既存ヘルパー:
- `checkoutFeatureBranch` (L327-362): Phase 1 の fetch+checkout 部分
- `pushFeatureBranch` (L368-389): Phase 2 の git push 部分
- `mergeFeaturePrPhase3` (L405-429): Phase 3 全体

未抽出でインライン展開されているもの:
- **Phase 1 本体** (L142-183): checkout 判定 → archiveOpenspec → moveRequestsDir
- **Phase 2 post-push** (L195-219): pollMergeStateAfterPush → DIRTY guard
- **Phase 4 全体** (L239-310): worktree cleanup / checkout+pull / branch 削除 / markJobArchived

## 方針

### Extract Method のみ、同ファイル内

Phase 関数を `orchestrator.ts` 内の module-private 関数として抽出する。別ファイルへの分離はこのリファクタリングのスコープ外。

### Phase 2 は push + post-push polling を包含

`runPhase2Push` は既存 `pushFeatureBranch` の呼び出しに加え、`pollMergeStateAfterPush` と DIRTY guard を含む。Phase 3 に渡す `mergeStateAfterPush` を返り値で返す。これにより dispatcher から Phase 2-3 間のデータフローが明示的になる。

### Phase 3 は既存ヘルパーをそのまま使用

`mergeFeaturePrPhase3` は既に抽出済み。薄いラッパーを追加する理由がないため、dispatcher から直接呼ぶ。

### Phase 4 は branch 削除 + markJobArchived を包含

現在 Phase 4 コメントの後に branch 削除と markJobArchived が続くが、これらは論理的に Phase 4 の一部。`runPhase4Finalize` にまとめる。

## 影響範囲

- **変更ファイル**: `src/core/finish/orchestrator.ts` のみ
- **export 変更**: なし（`runFinishOrchestrator` のシグネチャ不変）
- **テスト影響**: 振る舞い不変のため既存テスト全 pass が期待される
