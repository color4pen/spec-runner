# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: コードアサーションの事実確認

#### `src/core/pipeline/round-git-scope.ts` — `excludeChangeFolderPaths`

- `excludeChangeFolderPaths`（lines 37–41）: `changesDirRel()` が返す `"specrunner/changes"` をプレフィックスとして、その配下すべてのパスを除外する実装を確認。request が言う「change folder 全体（`specrunner/changes` 配下すべて）を除外」は正確。
- `pipelineManagedPaths`（lines 54–56）: `state.json / events.jsonl / usage.json` のみを対象とする別関数。invalidation 除外とは別の用途（halt detection / scoped staging）であることを確認。

#### `src/core/pipeline/reviewer-status.ts:190–199` — `aggregateVerdict`

- 190–199 行で `aggregateVerdict` 関数が定義されていることを確認。
- 全 verdict が `"skipped"` の場合はいずれにも一致しないため、`hasNeedsFix = false` のまま関数末尾に到達し `"approved"` を返す。
- 空配列も同様に `"approved"` を返す。request の主張は正確。

#### `src/core/pipeline/parallel-review-round.ts` — 承認維持ロジック

- lines 119–158: approved member の `approvedAtCommit` から `listChangedFiles` を呼び出し、`excludeChangeFolderPaths` で除外した結果を `computeInvalidations` に渡す構造を確認。
- `sourceTouched = excludeChangeFolderPaths(touched)` により `specrunner/changes/**` の全変更が除外されていることを確認（line 139）。これにより正典文書の変更が invalidation diff として現れない現状を確認。

#### `src/core/pipeline/reviewer-status.ts` — `selectPendingMembers`

- lines 95–122: revision 束縛（`approvedAtCommit !== baselineCommit`）が既に実装済みであることを確認（T-04 コメント付き）。
- `baselineCommit == null` の場合は revision check 無効（managed fail-safe）、`approvedAtCommit == null` の場合は fail-closed（pending）であることを確認。

#### `runtimeStrategy.digestArtifacts`

- `src/core/port/runtime-strategy.ts:442`: `digestArtifacts` メソッドが RuntimeStrategy ポートに定義されていることを確認。
- `src/core/runtime/local.ts:1158`: LocalRuntime で sha256 実装あり。
- `src/core/runtime/managed.ts:530`: ManagedRuntime では `hash: null` を返す（best-effort、スコープ外の既知制約と一致）。
- `src/core/step/commit-orchestrator.ts:231–232` および `bite-evidence/step.ts` で lineage 記録に使用中であることを確認。

#### `state.reviewerStatuses` 後方互換

- `src/kernel/reviewer-snapshot.ts:41–64`: `ReviewerStatus` インターフェースに `approvedAtCommit?: string | null` 等がオプション定義されていることを確認。
- `src/state/schema/operations.ts:243–262`: `reviewerStatuses` の validation は `name` と `status` のみをチェック（他フィールドはスルー）。`canonHash` などの追加フィールドは backward compat で受け入れ可能。

### Step 2: 要件・設計の整合性確認

- 要件 1（canonHash 束縛）: `digestArtifacts` が既存 seam として利用可能。`selectPendingMembers` の引数拡張で純粋関数性を維持できる構造になっている（revision 束縛の実装パターンと同じ構図）。
- 要件 2（除外絞り込み）: `excludeChangeFolderPaths` の実装は `round-git-scope.ts` に局所化されており修正範囲が明確。テスト `round-git-scope.test.ts` が存在。
- 要件 3（全 skip 非 green 化）: `aggregateVerdict` に「member > 0 かつ全 skipped → escalation」を追加する修正は実装容易。`reviewer-status.test.ts` line 177 に「全 skipped → approved（D5）」を固定するテストが存在し、本変更の意図に沿って期待を更新する必要があることを確認。
- 要件 4（legacy 互換）: `selectPendingMembers` に `canonHash` 引数を追加し、canonHash が null/undefined の record は fail-closed（pending）とする実装で対応可能。既存 record への書き換え不要。
- 要件 5（E2E）: fabricated state + 実 git 操作のパターンは `parallel-review-round-resume.test.ts` 等の既存テストと一致。

### Step 3: 受け入れ基準の検証可能性確認

受け入れ基準 7 件はすべて具体的な入出力条件を持ち、単体テスト・E2E テストとして記述可能であることを確認。

## 検証できなかった項目

None — コードアサーションはすべて対象ファイルの現在実装で確認できた。

## Findings 詳細

### 観察（非ブロッキング）

#### `aggregateVerdict` 変更の境界ケース

要件 3 は「全 member verdict が "skipped"」で escalation とするが、`aggregateVerdict` は pending メンバーの結果（今ラウンドで実行されたもの）のみを受け取る。既に approved（前ラウンド承認済み）のメンバーは `selectPendingMembers` で除外され、今ラウンドの `memberVerdicts` に含まれない。

このため「A 承認済み（前ラウンド）+ B,C pending → 両方 skipped」の場合も `aggregateVerdict(["skipped", "skipped"])` → escalation となる。実用上この経路が発生するには（a）B,C が `computeInvalidations` で invalidate されており、かつ（b）再実行で activation 条件が満たされない、という二重条件が必要で極めて稀。また request の architect 評価セクションに本挙動が intentional と読める根拠が示されているため、ブロッキング指摘としない。

実装者は design.md の Scenario にこの境界ケースを明記し、意図的であることを記録しておくことを推奨する。
