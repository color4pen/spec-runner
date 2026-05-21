# Tasks: Fix finish preflight MERGED PR UNKNOWN retry loop

## T1: preflight.ts の MERGED bypass 追加

**File**: `src/core/finish/preflight.ts`

**Location**: `fetchPrViewWithRetry` 関数内、Line 221（`// Check 4: UNKNOWN retry` コメントの直前）

**Changes**:
1. Check 4 のコメントを拡充（MERGED PR の挙動を説明）
2. `parsed.state === "MERGED"` 判定を追加し、MERGED なら `{ ok: true, data: parsed }` を即座に返す

**Detailed steps**:
- Line 221 の `// Check 4: UNKNOWN retry` を以下に置き換え:
  ```typescript
  /**
   * Check 4: MERGED PR bypass + UNKNOWN retry
   * 
   * MERGED PRs return mergeStateStatus=UNKNOWN because GitHub doesn't compute
   * mergeability for already-merged PRs. This is expected, not an error.
   * For OPEN/CLOSED PRs, UNKNOWN indicates computation in progress → retry.
   */
  // Check 4a: state === "MERGED" → UNKNOWN is expected, bypass retry
  if ((parsed.state ?? "").toUpperCase() === "MERGED") {
    return { ok: true, data: parsed };
  }

  // Check 4b: UNKNOWN retry (for OPEN/CLOSED PRs where GitHub is computing)
  ```
- Line 222 の既存 `if ((parsed.mergeStateStatus ?? "").toUpperCase() === "UNKNOWN") {` はそのまま残す

**Expected diff**:
```diff
     }

-    // Check 4: UNKNOWN retry
+    /**
+     * Check 4: MERGED PR bypass + UNKNOWN retry
+     * 
+     * MERGED PRs return mergeStateStatus=UNKNOWN because GitHub doesn't compute
+     * mergeability for already-merged PRs. This is expected, not an error.
+     * For OPEN/CLOSED PRs, UNKNOWN indicates computation in progress → retry.
+     */
+    // Check 4a: state === "MERGED" → UNKNOWN is expected, bypass retry
+    if ((parsed.state ?? "").toUpperCase() === "MERGED") {
+      return { ok: true, data: parsed };
+    }
+
+    // Check 4b: UNKNOWN retry (for OPEN/CLOSED PRs where GitHub is computing)
     if ((parsed.mergeStateStatus ?? "").toUpperCase() === "UNKNOWN") {
```

---

## T2: finish-orchestrator.test.ts の makeHappyPathSpawn 修正

**File**: `tests/finish-orchestrator.test.ts`

**Location**: `makeHappyPathSpawn` 関数、Line 99-105

**Changes**:
MERGED PR に対して `mergeStateStatus: "UNKNOWN"` を返すように修正（実際の GitHub 挙動を再現）

**Detailed steps**:
- Line 101 の `mergeStateStatus: "CLEAN",` を以下に置き換え:
  ```typescript
  // MERGED PRs return UNKNOWN (GitHub doesn't compute mergeability)
  mergeStateStatus: prState === "MERGED" ? "UNKNOWN" : "CLEAN",
  ```

**Expected diff**:
```diff
     if (cmd === "gh" && args[1] === "view" && args.includes("--json")) {
       const out = {
         state: prState,
-        mergeStateStatus: "CLEAN",
+        // MERGED PRs return UNKNOWN (GitHub doesn't compute mergeability)
+        mergeStateStatus: prState === "MERGED" ? "UNKNOWN" : "CLEAN",
         headRefName: "feat/test-slug",
       };
```

---

## T3: 型チェックとテスト実行

**Command**: `bun run typecheck && bun test`

**Expected outcome**:
- 型エラーなし
- 全テスト green（特に TC-106 が pass することを確認）

**Verification checklist**:
- [ ] `bun run typecheck` が exit 0
- [ ] `bun test tests/finish-orchestrator.test.ts` の TC-106 が pass
- [ ] `bun test` 全体が green

---

## T4 (Optional): finish-preflight.test.ts 追加

**File**: `tests/finish-preflight.test.ts` (新規作成)

**Purpose**: `fetchPrViewWithRetry` の MERGED bypass をユニットテストで検証

**Test cases**:
1. **TC-MERGED-1**: `state: "MERGED"`, `mergeStateStatus: "UNKNOWN"` → 即座に `{ ok: true }` 返す
2. **TC-MERGED-2**: `state: "OPEN"`, `mergeStateStatus: "UNKNOWN"` → retry が発生する
3. **TC-MERGED-3**: `state: "MERGED"` → `sleepFn` が呼ばれない（retry しない）

**Template**:
```typescript
import { describe, it, expect, vi } from "vitest";
import type { SpawnFn } from "../src/util/spawn.js";

// NOTE: fetchPrViewWithRetry is not exported. 
// Either export it for testing or test via runPreflight wrapper.

describe("preflight MERGED PR bypass", () => {
  it("TC-MERGED-1: state=MERGED with mergeStateStatus=UNKNOWN returns ok immediately", async () => {
    // Mock spawn to return MERGED + UNKNOWN
    // Assert: result.ok === true, spawn called once
  });

  it("TC-MERGED-2: state=OPEN with mergeStateStatus=UNKNOWN retries", async () => {
    // Mock spawn to return OPEN + UNKNOWN on 1st call, OPEN + CLEAN on 2nd
    // Assert: result.ok === true, spawn called twice, sleepFn called once
  });
});
```

**Note**: `fetchPrViewWithRetry` は現在 export されていないため、以下の選択肢がある:
- **Option A**: `preflight.ts` で `export { fetchPrViewWithRetry }` を追加（テスト専用 export）
- **Option B**: `runPreflight` をテストし、間接的に検証（integration test 寄り）
- **Option C**: このタスクをスキップし、TC-106 で十分とみなす

**Decision**: Optional タスクとし、実装者の判断に委ねる。TC-106 が pass すれば受け入れ基準を満たす。

---

## タスク依存関係

```
T1 (preflight.ts 修正) ← 必須
  ↓
T2 (test 修正) ← 必須
  ↓
T3 (typecheck + test) ← 必須
  ↓
T4 (追加テスト) ← オプション
```

T1, T2 は並行実施可能。T3 で検証。T4 はスキップ可。

---

## 受け入れ基準の検証手順

### AC1: MERGED 状態の PR に対して finish を実行しても escalation しない

**手順**:
1. T1, T2 を実装
2. `bun test tests/finish-orchestrator.test.ts -t "TC-106"` を実行
3. TC-106 が pass することを確認

**Expected output**:
```
✓ TC-106: feature PR already MERGED → Phase 1-3 skip, Phase 4 only
```

### AC2: `bun run typecheck && bun test` が green

**手順**:
1. T3 を実行
2. 全テストが pass することを確認

**Expected output**:
```
✓ All tests passed
✓ Type checking completed
```

---

## 実装ノート

- **Line numbers**: 本タスクで示した行番号は current main branch 基準。実装時にコンフリクトした場合は、コメント文字列で検索すること
- **Retry logic preservation**: MERGED check は early return なので、既存の UNKNOWN retry ロジック（OPEN/CLOSED PR 用）には影響しない
- **Test fidelity**: `makeHappyPathSpawn` の修正により、テストが実際の GitHub 挙動（MERGED → UNKNOWN）を再現するようになる

---

## 完了条件

- [ ] T1: `preflight.ts` に MERGED bypass 追加
- [ ] T2: `makeHappyPathSpawn` に MERGED → UNKNOWN マッピング追加
- [ ] T3: `bun run typecheck && bun test` が green
- [ ] AC1, AC2 を検証
