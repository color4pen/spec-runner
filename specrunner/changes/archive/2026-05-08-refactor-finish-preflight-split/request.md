# preflight.ts を 3 責務に分割し spawnOrEscalate ヘルパーを抽出する

## Meta

- **type**: refactoring
- **slug**: refactor-finish-preflight-split
- **base-branch**: main

## 背景

`src/core/finish/preflight.ts`（504 行）に 3 つの責務が混在している:

1. **事前チェック**: `runPreflight`, `runChecks5and6`, `checkBinaries`（L60-250）
2. **PR 状態ポーリング**: `fetchPrViewWithRetry`, `pollMergeStateAfterPush`（L256-406）
3. **git ブランチ操作**: `checkoutForValidation`, `restoreBranch`（L426-504）

`pollMergeStateAfterPush` は Phase 0 ではなく Phase 2 後に orchestrator.ts から呼ばれており、preflight の責務ではない。現在 `pollMergeStateAfterPushForTest` / `fetchPrViewWithRetryForTest` として re-export されていることが、本来 preflight 外の責務であることを示唆している。

また、finish 系全体（preflight.ts + orchestrator.ts + archive-openspec.ts + move-requests-dir.ts）で「spawn → exitCode check → formatEscalation」の定型コードが 19 箇所に散在している。

## 要件

### 1. preflight.ts を 3 ファイルに分離

1. `src/core/finish/preflight.ts` に残すもの: `runPreflight`, `runChecks5and6`, `checkBinaries` と関連する型（`PreflightInput`, `PreflightResult`, `PrViewData`, `Checks5and6Result`, `BinaryCheckResult`）
2. `src/core/finish/pr-status.ts` を新設: `fetchPrViewWithRetry`, `pollMergeStateAfterPush` と関連する型（`PrViewFetchResult`）を移動する。PR 状態のポーリング責務を集約する
3. `src/core/finish/branch-checkout.ts` を新設: `checkoutForValidation`, `restoreBranch` と関連する型（`CheckoutForValidationInput`, `CheckoutForValidationResult`, `RestoreBranchInput`）を移動する

### 2. spawnOrEscalate ヘルパーの抽出

4. `src/core/finish/spawn-helper.ts` を新設し、spawn → exitCode → escalation の定型パターンをヘルパー関数として抽出する。成功時は SpawnResult を返し、失敗時は `{ ok: false; escalation: string }` を返す
5. preflight.ts, orchestrator.ts の該当箇所をヘルパー呼び出しに置き換える

### 3. import の更新

6. `orchestrator.ts` の import を更新する。現在 `preflight.js` から `fetchPrViewWithRetryForTest`, `pollMergeStateAfterPushForTest` を import しているのを `pr-status.js` からの直接 import に変更し、`ForTest` suffix を除去する
7. テストファイルの import パスを更新する

### 4. process.stderr.write の DI 化

8. `preflight.ts` L209 と `runChecks5and6` 内の `process.stderr.write` を `PreflightInput` 経由の `warnFn` に置き換え、テストでキャプチャ可能にする

## スコープ外

- orchestrator.ts のフェーズ関数化（別 request で対応）
- executor.ts の成功パス統合（別 request で対応）
- finish 以外のモジュールのリファクタリング
- archive-openspec.ts, move-requests-dir.ts の spawn 呼び出しへの spawnOrEscalate 適用（これらは行数が小さいため優先度低）

## 受け入れ基準

- [ ] preflight.ts が 250 行以下に縮小している
- [ ] pr-status.ts に PR ポーリング関数が集約されている
- [ ] branch-checkout.ts に git checkout/restore 関数が集約されている
- [ ] orchestrator.ts が pr-status.ts から直接 import している（ForTest suffix なし）
- [ ] spawnOrEscalate ヘルパーが preflight.ts と orchestrator.ts の少なくとも 5 箇所で使用されている
- [ ] 全既存テストが pass する（振る舞い不変）
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/refactor-finish-preflight-split.md` by `merged-to-archive-consolidation`.
