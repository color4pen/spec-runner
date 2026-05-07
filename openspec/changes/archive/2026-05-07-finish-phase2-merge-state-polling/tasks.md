# Tasks: finish Phase 2 push 後の merge state polling 改善

## 1. Phase 1 -- preflight.ts に `pollMergeStateAfterPush` を追加

- [x] 1.1 `src/core/finish/preflight.ts` にモジュールスコープ定数を追加:
  ```typescript
  const POST_PUSH_RETRY_COUNT = 5;
  const POST_PUSH_RETRY_DELAY_MS = 3000;
  ```

- [x] 1.2 `src/core/finish/preflight.ts` に `pollMergeStateAfterPush` 関数を追加（`fetchPrViewWithRetry` の直後、`sleep` 関数の手前あたりに配置）:
  ```typescript
  /**
   * Poll mergeStateStatus after Phase 2 push until CLEAN or retries exhausted.
   *
   * Unlike fetchPrViewWithRetry (Phase 0), this function:
   * - Retries on ANY non-CLEAN status (not just UNKNOWN)
   * - Does NOT escalate on exhaustion — returns current state for Phase 3 to attempt merge
   */
  async function pollMergeStateAfterPush(params: {
    prNumber: number;
    cwd: string;
    spawn: SpawnFn;
    slug: string;
    sleepFn?: (ms: number) => Promise<void>;
  }): Promise<{ mergeStateStatus: string }> {
    const { prNumber, cwd, spawn, slug } = params;
    const sleepImpl = params.sleepFn ?? sleep;

    for (let attempt = 1; attempt <= POST_PUSH_RETRY_COUNT; attempt++) {
      const result = await spawn(
        "gh",
        ["pr", "view", String(prNumber), "--json", "mergeStateStatus"],
        { cwd },
      );

      if (result.exitCode !== 0) {
        // gh pr view failed — return empty string so Phase 3 attempts merge without --admin
        return { mergeStateStatus: "" };
      }

      let parsed: { mergeStateStatus?: string };
      try {
        parsed = JSON.parse(result.stdout.trim());
      } catch {
        return { mergeStateStatus: "" };
      }

      const status = (parsed.mergeStateStatus ?? "").toUpperCase();
      if (status === "CLEAN") {
        return { mergeStateStatus: status };
      }

      if (attempt < POST_PUSH_RETRY_COUNT) {
        process.stdout.write(
          `Post-push polling: mergeStateStatus=${status}, retrying (${attempt}/${POST_PUSH_RETRY_COUNT})...\n`,
        );
        await sleepImpl(POST_PUSH_RETRY_DELAY_MS);
      }
    }

    // Exhausted — return last observed status, do NOT escalate
    // Phase 3 will attempt merge; if it fails, Phase 3 escalates
    return { mergeStateStatus: "" };
  }
  ```
  注: exhaustion 時に最後に取得した mergeStateStatus を返す実装も可。ここでは空文字列を返すことで Phase 3 が `--admin` なしで merge を試みる。implementer の判断で最後の observed status を返す設計にしても可。

- [x] 1.3 `src/core/finish/preflight.ts` の末尾に test-only export を追加:
  ```typescript
  export { pollMergeStateAfterPush as pollMergeStateAfterPushForTest };
  ```

## 2. Phase 2 -- orchestrator.ts の post-push polling を差し替え

- [x] 2.1 `src/core/finish/orchestrator.ts` の import に `pollMergeStateAfterPushForTest` を追加:
  ```typescript
  import {
    runPreflight,
    fetchPrViewWithRetryForTest as fetchPrViewWithRetry,
    pollMergeStateAfterPushForTest as pollMergeStateAfterPush,
  } from "./preflight.js";
  ```

- [x] 2.2 `src/core/finish/orchestrator.ts` の Phase 2 post-push polling（現在 Line 191-203）を差し替え:

  **Before:**
  ```typescript
  // Phase 2 post-push: wait for mergeStateStatus=CLEAN (Design D6)
  // After a push, GitHub may briefly set mergeStateStatus=UNKNOWN while recalculating.
  // Poll up to 3 times to avoid premature BLOCKED detection in Phase 3.
  const postPushPrView = await fetchPrViewWithRetry({
    prNumber: target.prNumber,
    cwd,
    spawn,
    slug: target.slug,
    sleepFn,
  });
  const mergeStateAfterPush = postPushPrView.ok
    ? (postPushPrView.data.mergeStateStatus ?? prViewData.mergeStateStatus ?? "")
    : (prViewData.mergeStateStatus ?? "");
  ```

  **After:**
  ```typescript
  // Phase 2 post-push: poll mergeStateStatus until CLEAN (Design D1)
  // After push, GitHub recalculates mergeability asynchronously.
  // Poll up to 5 times (3s interval) to wait for CLEAN.
  // On exhaustion, proceed with current status — Phase 3 will attempt merge anyway.
  const postPushPoll = await pollMergeStateAfterPush({
    prNumber: target.prNumber,
    cwd,
    spawn,
    slug: target.slug,
    sleepFn,
  });
  const mergeStateAfterPush = postPushPoll.mergeStateStatus || (prViewData.mergeStateStatus ?? "");
  ```

## 3. Phase 3 -- テスト追加

- [x] 3.1 `tests/unit/core/finish/preflight.test.ts` に `pollMergeStateAfterPush` のテストを追加:

  **TC-POST-PUSH-001**: 1 回目で CLEAN → 即座に返す（retry なし）
  ```typescript
  describe("pollMergeStateAfterPush", () => {
    it("TC-POST-PUSH-001: returns immediately when mergeStateStatus is CLEAN", async () => {
      const spawn = vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ mergeStateStatus: "CLEAN" }),
        stderr: "",
      });
      const sleepFn = vi.fn();

      const result = await pollMergeStateAfterPushForTest({
        prNumber: 42, cwd: "/tmp", spawn, slug: "test", sleepFn,
      });

      expect(result.mergeStateStatus).toBe("CLEAN");
      expect(sleepFn).not.toHaveBeenCalled();
      expect(spawn).toHaveBeenCalledTimes(1);
    });
  ```

  **TC-POST-PUSH-002**: BEHIND → BEHIND → CLEAN（2 回 retry で成功）
  ```typescript
    it("TC-POST-PUSH-002: retries on non-CLEAN and succeeds when CLEAN", async () => {
      let call = 0;
      const spawn = vi.fn().mockImplementation(() => {
        call++;
        const status = call < 3 ? "BEHIND" : "CLEAN";
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ mergeStateStatus: status }),
          stderr: "",
        });
      });
      const sleepFn = vi.fn().mockResolvedValue(undefined);

      const result = await pollMergeStateAfterPushForTest({
        prNumber: 42, cwd: "/tmp", spawn, slug: "test", sleepFn,
      });

      expect(result.mergeStateStatus).toBe("CLEAN");
      expect(sleepFn).toHaveBeenCalledTimes(2);
    });
  ```

  **TC-POST-PUSH-003**: 5 回全部 UNKNOWN → escalation せず空文字を返す
  ```typescript
    it("TC-POST-PUSH-003: returns empty string after exhausting retries (no escalation)", async () => {
      const spawn = vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ mergeStateStatus: "UNKNOWN" }),
        stderr: "",
      });
      const sleepFn = vi.fn().mockResolvedValue(undefined);

      const result = await pollMergeStateAfterPushForTest({
        prNumber: 42, cwd: "/tmp", spawn, slug: "test", sleepFn,
      });

      expect(result.mergeStateStatus).toBe("");
      expect(spawn).toHaveBeenCalledTimes(5);
      expect(sleepFn).toHaveBeenCalledTimes(4); // sleep between attempts, not after last
    });
  });
  ```

- [x] 3.2 `tests/finish-orchestrator.test.ts` の post-push mock を更新（`pollMergeStateAfterPush` が `gh pr view --json mergeStateStatus` のみを呼ぶ形に合わせる）

## 4. Phase 4 -- 検証

- [x] 4.1 `bun run typecheck` が exit 0
- [x] 4.2 `bun run test` が全 green
- [x] 4.3 `openspec validate finish-phase2-merge-state-polling` が pass

## タスク依存関係

```
Phase 1 (preflight.ts) ← 必須
  ↓
Phase 2 (orchestrator.ts) ← 必須（Phase 1 の export に依存）
  ↓
Phase 3 (テスト) ← 必須（Phase 1-2 の実装に依存）
  ↓
Phase 4 (検証) ← 必須
```

## 受け入れ基準の検証手順

### AC1: Phase 2 push 後に mergeStateStatus が CLEAN になるまで polling する
- TC-POST-PUSH-001, TC-POST-PUSH-002 で検証

### AC2: push 直後の merge が「Base branch was modified」で失敗しない
- orchestrator テストの Phase 2→3 フローで検証（polling が CLEAN を返してから merge に進む）

### AC3: delta spec が `openspec validate` を pass する
- Phase 4 の 4.3 で検証

### AC4: `bun run typecheck && bun run test` が green
- Phase 4 の 4.1, 4.2 で検証
