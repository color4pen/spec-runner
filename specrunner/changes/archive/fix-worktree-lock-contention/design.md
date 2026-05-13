# Design: fix-worktree-lock-contention

## Problem

並列 `specrunner run` 実行時、複数の `WorktreeManager.create()` が同時に `git worktree add` を呼ぶと `.git/config` のファイルロックが競合する。

```
error: could not lock config file .git/config: File exists
error: unable to write upstream branch configuration
```

ロック競合は一時的なもので、リトライで吸収可能。

## Approach

`WorktreeManager.create()` 内の `git worktree add` 呼び出しを retry ループで包む。修正箇所は `manager.ts` の 1 箇所のみ。`local.ts` の 3 つの `manager.create()` 呼び出しは全て自動的に恩恵を受ける。

### Why manager.ts, not local.ts

`manager.create()` は worktree 作成の単一責任ポイント。リトライを `local.ts` の各呼び出し側に入れると 3 箇所の重複が生じ、将来の呼び出し追加時にもリトライが漏れる。

## Detailed Design

### D1: Retry logic in `WorktreeManager.create()`

**File**: `src/core/worktree/manager.ts`

`git worktree add` の spawn 呼び出しを `for` ループで包む:

```typescript
const MAX_RETRIES = 3;

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  const wtResult = await spawn("git", wtArgs, { cwd: repoRoot });

  if (wtResult.exitCode === 0) break;

  const isLockContention = wtResult.stderr.includes("could not lock config file");

  if (!isLockContention || attempt === MAX_RETRIES) {
    throw new Error(
      `git worktree add failed (exit ${wtResult.exitCode}): ${wtResult.stderr.trim()}`,
    );
  }

  // Lock contention detected — retry with random jitter
  const delayMs = 1000 + Math.floor(Math.random() * 4000); // 1-5s
  process.stderr.write(
    `Retrying worktree add: lock contention (attempt ${attempt}/${MAX_RETRIES})\n`,
  );
  await sleep(delayMs);
}
```

### D2: Injectable sleep for testability

既存パターン（`pr-status.ts` の `sleepFn` DI）に倣い、`createWorktreeManager` に `sleepFn` を追加する。

```typescript
type SleepFn = (ms: number) => Promise<void>;

export function createWorktreeManager(
  spawnFn?: SpawnFn,
  rmFn?: RmFn,
  sleepFn?: SleepFn,
): WorktreeManager { ... }
```

production では `const sleep = sleepFn ?? ((ms) => new Promise(r => setTimeout(r, ms)));` を使用。テストでは即座に resolve する mock を注入する。

### D3: Error detection heuristic

stderr に `"could not lock config file"` が含まれるかどうかで判定する。これは git が出力する一意のエラーメッセージで、他のエラーと誤認するリスクは極めて低い。

lock contention 以外の失敗（例: `fatal: worktree already exists`）はリトライせず即 throw する（既存動作を維持）。

## Out of scope

- ロック取得の根本的排他制御（mutex / file lock）— over-engineering。リトライで十分
- `bun install` のリトライ — 別の問題。lock contention とは無関係
- config.json での retry 回数設定 — 固定値で十分。必要になったら追加

## Risks

- **Random jitter 不足**: 同一 seed で同時 retry すると再衝突するが、`Math.random()` + 1-5s range で実用上十分
- **3 回で不足**: 4 並列以上で理論上あり得るが、実運用上 2-3 並列が上限。不足なら定数を増やすだけ
