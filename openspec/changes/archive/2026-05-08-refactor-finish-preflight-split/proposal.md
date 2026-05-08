# Proposal: preflight.ts を 3 責務に分割し spawnOrEscalate ヘルパーを抽出する

## 問題の本質

`src/core/finish/preflight.ts`（504 行）に 3 つの独立した責務が混在している:

1. **事前チェック**: `runPreflight`, `runChecks5and6`, `checkBinaries`（L60-250）
2. **PR 状態ポーリング**: `fetchPrViewWithRetry`, `pollMergeStateAfterPush`（L256-406）
3. **git ブランチ操作**: `checkoutForValidation`, `restoreBranch`（L426-504）

`pollMergeStateAfterPush` は Phase 0 ではなく Phase 2 後に orchestrator.ts から呼ばれており、preflight の責務ではない。`fetchPrViewWithRetryForTest` / `pollMergeStateAfterPushForTest` という ForTest re-export の存在が、これらが本来 preflight 外の関数であることを示唆している。

加えて、finish 系全体で `spawn → exitCode check → formatEscalation` の定型コードが散在しており、orchestrator.ts と preflight.ts だけで 10 箇所存在する。

## 提案

### 1. preflight.ts を 3 ファイルに分離

| 新ファイル | 移動する関数 | 責務 |
|-----------|------------|------|
| `preflight.ts`（既存） | `runPreflight`, `runChecks5and6`, `checkBinaries` | Phase 0 事前チェック |
| `pr-status.ts`（新設） | `fetchPrViewWithRetry`, `pollMergeStateAfterPush` | PR 状態取得とポーリング |
| `branch-checkout.ts`（新設） | `checkoutForValidation`, `restoreBranch` | git ブランチ checkout/restore |

### 2. spawnOrEscalate ヘルパーの抽出

`spawn-helper.ts` を新設し、`spawn → exitCode !== 0 → formatEscalation` の定型パターンを 1 関数に集約する。preflight.ts と orchestrator.ts の該当箇所（8 箇所）をヘルパー呼び出しに置き換える。

### 3. orchestrator.ts の import 正規化

`preflight.js` からの ForTest alias import を `pr-status.js` からの直接 import に変更し、`ForTest` suffix を除去する。

### 4. process.stderr.write の DI 化

`runChecks5and6` 内の `process.stderr.write`（L209）を `warnFn` パラメータに置き換え、テストでキャプチャ可能にする。`runPreflight` 内 L173 も同様に置き換える。

## 影響範囲

- **変更ファイル**: `preflight.ts`, `orchestrator.ts`, `tests/unit/core/finish/preflight.test.ts`
- **新設ファイル**: `pr-status.ts`, `branch-checkout.ts`, `spawn-helper.ts`
- **既存機能への影響**: なし（振る舞い不変のリファクタリング）
- **後方互換性**: 外部 API は `runPreflight` と `runFinishOrchestrator` のみ。内部関数の移動のため破壊的変更なし

## スコープ外

- orchestrator.ts のフェーズ関数化
- archive-openspec.ts, move-requests-dir.ts への spawnOrEscalate 適用
- finish 以外のモジュールのリファクタリング
