# Design: finish-conflict-precheck

## 概要

Phase 3 の `gh pr merge` 実行直前に `gh pr view --json mergeable` で PR の mergeable 状態を確認する guard を追加する。conflict がある場合は rebase を促すメッセージを出して早期停止し、merge 失敗による UX 劣化を防ぐ。

## 現状の問題

Phase 2 の post-push poll で `mergeStateStatus=DIRTY` を検出する guard は存在する（orchestrator.ts L236-247）。しかし以下の gap がある:

1. Phase 2 poll 完了後〜Phase 3 merge 実行前の間に base branch が変更された場合、DIRTY ガードをすり抜ける
2. `mergeStateStatus` と `mergeable` は別フィールド。`mergeStateStatus=BLOCKED` でも `mergeable=CONFLICTING` のケースがある
3. `gh pr merge` が "Base branch was modified" で失敗してから escalation するため、Phase 1-2 の archive/push が無駄になる

`mergeable` フィールドで merge 直前に最終確認することで、これらの gap を埋める。

## 設計判断

### D1: pr-status.ts に `checkMergeableForMerge` 関数を追加

`gh pr view <num> --json mergeable` を実行し、mergeable フィールドで判定する関数を pr-status.ts に追加する。

返り値:
- `MERGEABLE` → `{ ok: true }`
- `CONFLICTING` → `{ ok: false, escalation }` — rebase を促すメッセージ
- `UNKNOWN` → 最大 3 回リトライ（5 秒間隔）。全リトライ後も UNKNOWN なら escalation

既存の `fetchPrViewWithRetry`（Phase 0）や `pollMergeStateAfterPush`（Phase 2）と同じモジュールに配置し、PR 状態照会の責務を集約する。

リトライパラメータは module-level 定数 `MERGEABLE_RETRY_COUNT = 3`, `MERGEABLE_RETRY_DELAY_MS = 5000` で定義。既存の `UNKNOWN_RETRY_COUNT`, `POST_PUSH_RETRY_COUNT` と同じパターンに揃える。

シグネチャ:

```typescript
export async function checkMergeableForMerge(params: {
  prNumber: number;
  cwd: string;
  spawn: SpawnFn;
  slug: string;
  baseBranch: string;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<{ ok: true } | { ok: false; escalation: string }>
```

`baseBranch` は escalation メッセージ内の rebase コマンド例に使用する。

### D2: orchestrator.ts の `mergeFeaturePrPhase3` 先頭に guard を挿入

`mergeFeaturePrPhase3` 関数の先頭で `checkMergeableForMerge` を呼び出す。`ok: false` の場合は escalation で即返却。

`MergePhase3Params` に `baseBranch` と `sleepFn` を追加する（`baseBranch` は escalation メッセージ用、`sleepFn` はテスト用 DI）。呼び出し元の `runFinishOrchestrator` から値を渡す。

既存の Phase 2 DIRTY ガードと相補的な関係:
- Phase 2 DIRTY: push 直後の即座な検出（`mergeStateStatus` ベース）
- Phase 3 CONFLICTING: merge 直前の最終確認（`mergeable` ベース）

### D3: PrViewData は変更しない

`mergeable` フィールドは Phase 3 guard 専用の一時的なクエリ結果。Phase 0 で取得する `PrViewData`（state, mergeStateStatus, headRefName）とは用途が異なるため、型を膨らませない。

### D4: テスト更新

**`makeHappyPathSpawn` の更新**: `gh pr view --json mergeable` クエリに対して `{ "mergeable": "MERGEABLE" }` を返すように分岐追加。`args.includes("mergeable")` で Phase 3 の mergeable チェックを識別する。

**新規テストケース** (`tests/finish-orchestrator.test.ts`):
- TC-CONFLICT-001: `mergeable=CONFLICTING` → escalation、`gh pr merge` 未実行
- TC-CONFLICT-002: `mergeable=MERGEABLE` → 通常通り merge（happy path で既にカバー）
- TC-CONFLICT-003: `mergeable=UNKNOWN` → リトライ後 `MERGEABLE` → merge 成功
- TC-CONFLICT-004: `mergeable=UNKNOWN` × 3 回リトライ超過 → escalation

## 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/core/finish/pr-status.ts` | `checkMergeableForMerge` 関数追加、定数追加 |
| `src/core/finish/orchestrator.ts` | `MergePhase3Params` に `baseBranch`/`sleepFn` 追加、guard 呼び出し挿入 |
| `tests/finish-orchestrator.test.ts` | `makeHappyPathSpawn` 更新、TC-CONFLICT-001/003/004 追加 |

## リスク

- **既存テスト破壊**: `makeHappyPathSpawn` が `gh pr view --json mergeable` を返さない場合、新しい guard で `undefined` になる。T-01 で `makeHappyPathSpawn` を先に更新することで回避。
- **Phase 2 DIRTY との二重検出**: DIRTY と CONFLICTING が同時に発生するケースでは Phase 2 で先に止まるため問題なし。Phase 3 の guard は Phase 2 をすり抜けたケースのみ捕捉する。
