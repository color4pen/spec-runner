# Proposal: Fix finish preflight MERGED PR UNKNOWN retry loop

## 問題の本質

GitHub の PR API において、MERGED 状態の PR は mergeability 計算が行われないため、`gh pr view` で `mergeStateStatus: "UNKNOWN"` が返される。これは正常な挙動だが、現在の preflight.ts は UNKNOWN を「計算中」と解釈し、3回 retry → escalation する設計になっている。

その結果、orchestrator.ts の TC-106（prAlreadyMerged path: Phase 1-3 skip, Phase 4 only）に到達できず、finish コマンドが失敗する。

## 根本原因

`src/core/finish/preflight.ts` の `fetchPrViewWithRetry` 関数（Line 176-256）において、Check 4 の UNKNOWN 判定が `state` フィールドを考慮していない。

```typescript
// Line 222-241: 現在のロジック
if ((parsed.mergeStateStatus ?? "").toUpperCase() === "UNKNOWN") {
  if (attempt < UNKNOWN_RETRY_COUNT) {
    // retry...
  }
  // escalation
}
```

`state: "MERGED"` の場合、`mergeStateStatus: "UNKNOWN"` は恒久的であり、retry しても変わらない。

## 提案する修正

### 1. preflight.ts の Check 4 修正

UNKNOWN retry の**前**に `state === "MERGED"` を判定し、MERGED なら即座に成功を返す。

```typescript
// Check 4: state === "MERGED" → UNKNOWN is expected, bypass retry
if ((parsed.state ?? "").toUpperCase() === "MERGED") {
  return { ok: true, data: parsed };
}

// Check 4: UNKNOWN retry (for OPEN/CLOSED PRs where GitHub is computing)
if ((parsed.mergeStateStatus ?? "").toUpperCase() === "UNKNOWN") {
  if (attempt < UNKNOWN_RETRY_COUNT) {
    // retry...
  }
  // escalation
}
```

### 2. テストの修正

TC-106 の `makeHappyPathSpawn` は現在 `mergeStateStatus: "CLEAN"` を返しているが、実際の GitHub の挙動では MERGED PR は `mergeStateStatus: "UNKNOWN"` を返す。

修正後:
- `prState === "MERGED"` のとき、`mergeStateStatus: "UNKNOWN"` を返すように変更
- これにより、preflight の修正がなければ escalation することを検証できる

### 3. 新規テストケース

`tests/finish-preflight.test.ts` を追加（または既存のテストに追加）して、以下を検証:
- TC-MERGED-1: `state: "MERGED"`, `mergeStateStatus: "UNKNOWN"` → `{ ok: true }` を即座に返す
- TC-MERGED-2: retry が発生しない（sleepFn が呼ばれない）

## 影響範囲

- **変更ファイル**:
  - `src/core/finish/preflight.ts`: `fetchPrViewWithRetry` に1行追加
  - `tests/finish-orchestrator.test.ts`: `makeHappyPathSpawn` の MERGED path 修正
  - （オプション）`tests/finish-preflight.test.ts`: 新規テストケース追加

- **既存機能への影響**:
  - OPEN/CLOSED PR の UNKNOWN retry ロジックは変更なし
  - orchestrator の prAlreadyMerged path（TC-106）がアクティベートされる
  - Phase 1-3 skip, Phase 4 only の既存ロジックは変更なし

- **後方互換性**:
  - MERGED PR は以前は escalation していたが、修正後は正常完了する（改善）
  - 破壊的変更なし

## 受け入れ基準（再掲）

- [ ] MERGED 状態の PR に対して finish を実行しても escalation しない
- [ ] `bun run typecheck && bun test` が green
- [ ] TC-106 が実際の GitHub 挙動（mergeStateStatus=UNKNOWN）を再現する
