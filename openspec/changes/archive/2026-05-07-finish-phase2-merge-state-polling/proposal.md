## Why

`specrunner finish` の Phase 2 で feature branch を push した後、Phase 3 の `gh pr merge` が「Base branch was modified」で失敗する。push により PR の HEAD SHA が変わると、GitHub が mergeability を再計算するが、その間 `mergeStateStatus` は UNKNOWN 以外の非 CLEAN 状態（BEHIND 等）を返すことがある。

現在の post-push polling は `fetchPrViewWithRetry` を再利用しており、`mergeStateStatus === UNKNOWN` のみを retry 対象としている。push 後に BEHIND → CLEAN と遷移するケースでは retry せずに Phase 3 に進み、merge が失敗する。

## What Changes

- Phase 2 push 後の polling を専用関数 `pollMergeStateAfterPush` に分離
- retry 条件を `mergeStateStatus !== "CLEAN"` に拡大（UNKNOWN / BEHIND / DIRTY / PENDING 等すべて retry）
- retry 上限を 5 回、間隔を 3 秒に設定
- 上限到達時は escalation せず、現在の mergeStateStatus で Phase 3 に進む（merge が通る可能性があるため）

## Capabilities

### New Capabilities

- `post-push-merge-state-poll`: Phase 2 push 後に `mergeStateStatus === "CLEAN"` になるまで polling する関数。retry 上限に達しても escalation しない

### Modified Capabilities

- `cli-finish-command` spec: Phase 2→3 間の polling 要件を Requirement として追加

## Impact

- **コード**: `src/core/finish/preflight.ts`（新関数追加 + export）、`src/core/finish/orchestrator.ts`（post-push polling 呼び出し変更）
- **API / 動作変更**: Phase 2→3 間の待ち時間が最大 15 秒増加（5 × 3s）するが、merge 成功率が向上する
- **後方互換性**: 既存の Phase 0 preflight（`fetchPrViewWithRetry`）は変更なし
- **テスト**: 新関数のユニットテスト追加 + orchestrator テストの post-push mock 更新
