# Design: Fix finish preflight MERGED PR UNKNOWN retry loop

## 設計方針

MERGED PR に対する `gh pr view` が `mergeStateStatus: "UNKNOWN"` を返すのは GitHub の正常な挙動である。この状態を「計算中」ではなく「mergeability 計算不要」と解釈し、preflight を即座に通過させる。

**設計原則**:
1. **Early return on MERGED**: UNKNOWN retry の前に MERGED を判定し、bypass する
2. **Preserve existing retry logic**: OPEN/CLOSED PR の UNKNOWN retry は維持
3. **Test fidelity**: テストが実際の GitHub 挙動を再現する

## コンポーネント設計

### 1. preflight.ts の修正

#### 変更箇所

`src/core/finish/preflight.ts` の `fetchPrViewWithRetry` 関数内、Line 221（`// Check 4: UNKNOWN retry`）の直前に以下を挿入:

```typescript
// Check 4: state === "MERGED" → UNKNOWN is expected, bypass retry
if ((parsed.state ?? "").toUpperCase() === "MERGED") {
  return { ok: true, data: parsed };
}
```

#### ロジックフロー

```
gh pr view
  ↓
parsed.state === "MERGED"? 
  ↓ YES → return { ok: true, data: parsed } (即座に成功)
  ↓ NO
parsed.mergeStateStatus === "UNKNOWN"?
  ↓ YES → retry (existing logic)
  ↓ NO → return { ok: true, data: parsed }
```

#### コメント追記

Check 4 のコメント（Line 221）を以下のように拡充:

```typescript
/**
 * Check 4: MERGED PR bypass + UNKNOWN retry
 * 
 * MERGED PRs return mergeStateStatus=UNKNOWN because GitHub doesn't compute
 * mergeability for already-merged PRs. This is expected, not an error.
 * For OPEN/CLOSED PRs, UNKNOWN indicates computation in progress → retry.
 */
```

### 2. テストの修正

#### `tests/finish-orchestrator.test.ts`

`makeHappyPathSpawn` 関数（Line 93-148）の修正:

**修正前** (Line 99-105):
```typescript
if (cmd === "gh" && args[1] === "view" && args.includes("--json")) {
  const out = {
    state: prState,
    mergeStateStatus: "CLEAN",  // ← 常に CLEAN
    headRefName: "feat/test-slug",
  };
  return Promise.resolve({ exitCode: 0, stdout: JSON.stringify(out), stderr: "" });
}
```

**修正後**:
```typescript
if (cmd === "gh" && args[1] === "view" && args.includes("--json")) {
  const out = {
    state: prState,
    // MERGED PRs return UNKNOWN (GitHub doesn't compute mergeability)
    mergeStateStatus: prState === "MERGED" ? "UNKNOWN" : "CLEAN",
    headRefName: "feat/test-slug",
  };
  return Promise.resolve({ exitCode: 0, stdout: JSON.stringify(out), stderr: "" });
}
```

#### （オプション）新規テストファイル追加

`tests/finish-preflight.test.ts` を作成し、以下のテストケースを追加:

**TC-MERGED-1: state=MERGED, mergeStateStatus=UNKNOWN → 即座に成功**
```typescript
it("TC-MERGED-1: state=MERGED with mergeStateStatus=UNKNOWN returns ok immediately", async () => {
  const spawn: SpawnFn = vi.fn().mockResolvedValue({
    exitCode: 0,
    stdout: JSON.stringify({
      state: "MERGED",
      mergeStateStatus: "UNKNOWN",
      headRefName: "feat/test",
    }),
    stderr: "",
  });

  const result = await fetchPrViewWithRetry({
    prNumber: 123,
    cwd: "/test",
    spawn,
    slug: "test-slug",
  });

  expect(result.ok).toBe(true);
  expect(spawn).toHaveBeenCalledTimes(1); // No retry
});
```

**TC-MERGED-2: state=OPEN, mergeStateStatus=UNKNOWN → retry**
```typescript
it("TC-MERGED-2: state=OPEN with mergeStateStatus=UNKNOWN retries", async () => {
  let callCount = 0;
  const spawn: SpawnFn = vi.fn().mockImplementation(async () => {
    callCount++;
    if (callCount === 1) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          state: "OPEN",
          mergeStateStatus: "UNKNOWN",
        }),
        stderr: "",
      };
    }
    // 2nd call: resolved to CLEAN
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
      }),
      stderr: "",
    };
  });

  const sleepCalled: number[] = [];
  const sleepFn = async (ms: number) => { sleepCalled.push(ms); };

  const result = await fetchPrViewWithRetry({
    prNumber: 123,
    cwd: "/test",
    spawn,
    slug: "test-slug",
    sleepFn,
  });

  expect(result.ok).toBe(true);
  expect(spawn).toHaveBeenCalledTimes(2);
  expect(sleepCalled).toEqual([3000]); // 1 retry
});
```

### 3. orchestrator.ts への影響

**変更なし**。orchestrator.ts の Line 126-127 の既存ロジックが活性化される:

```typescript
const prAlreadyMerged = prViewData.state === "MERGED";

if (!prAlreadyMerged) {
  // Phase 1-3...
} else {
  stdoutWrite(`PR #${target.prNumber} already merged. Skipping Phase 1-3.`);
}
// Phase 4...
```

preflight 修正により、`prViewData.state === "MERGED"` がトラップされるようになる。

## データフロー

```
specrunner finish <slug>
  ↓
resolveTarget (target.prNumber)
  ↓
runPreflight
  ↓
fetchPrViewWithRetry
  ↓
gh pr view --json state,mergeStateStatus,headRefName
  ↓ (MERGED PR case)
parsed.state = "MERGED"
parsed.mergeStateStatus = "UNKNOWN"
  ↓
[NEW] state === "MERGED" check → return { ok: true, data: parsed }
  ↓
orchestrator receives prViewData.state = "MERGED"
  ↓
prAlreadyMerged = true
  ↓
Phase 1-3 skip
  ↓
Phase 4 (markJobArchived + git pull)
  ↓
exit 0
```

## エラーハンドリング

- **MERGED + UNKNOWN**: 正常ケースとして処理（新規）
- **OPEN/CLOSED + UNKNOWN**: 既存の retry ロジックを維持
- **UNKNOWN × 3 escalation**: OPEN/CLOSED のみ発動（MERGED は1回で bypass）

## テスト戦略

### ユニットテスト

- `tests/finish-preflight.test.ts` で `fetchPrViewWithRetry` の MERGED bypass を検証
- TC-MERGED-1, TC-MERGED-2 で retry 有無を確認

### インテグレーションテスト

- `tests/finish-orchestrator.test.ts` の TC-106 で end-to-end を検証
- `makeHappyPathSpawn` の MERGED path が `mergeStateStatus: "UNKNOWN"` を返すことを確認

### 手動テスト（optional）

実際に MERGED 状態の PR に対して `specrunner finish` を実行し、Phase 1-3 skip を確認。

## 実装優先度

1. **MUST**: `preflight.ts` の MERGED check 追加
2. **MUST**: `tests/finish-orchestrator.test.ts` の `makeHappyPathSpawn` 修正
3. **SHOULD**: `tests/finish-preflight.test.ts` 追加（ユニットテスト補強）
4. **NICE-TO-HAVE**: コメント拡充

## リスク分析

| リスク | 影響度 | 対策 |
|--------|--------|------|
| MERGED 判定のタイミングミス | 中 | retry ループの前に配置することで確実に bypass |
| テストが実態を反映しない | 低 | `makeHappyPathSpawn` 修正で GitHub 実挙動を再現 |
| OPEN/CLOSED の retry が壊れる | 低 | MERGED check は early return なので既存ロジックに影響なし |

## 実装順序

1. `preflight.ts` の MERGED check 追加
2. `makeHappyPathSpawn` の MERGED path 修正
3. `bun test` で TC-106 が green になることを確認
4. （optional）`finish-preflight.test.ts` 追加
5. `bun run typecheck && bun test` で全体 green 確認
