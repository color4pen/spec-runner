# Design: worktree-retry-branch-fix

## 問題の本質

`git worktree add -b <branch> <path> <ref>` は内部で 2 操作を行う:

1. `git branch <branch> <ref>` — branch 作成
2. worktree dir を <path> に作成

lock contention で **2 が失敗しても 1 はロールバックされない**。
現在の retry logic は固定の `-b` args で再試行するため、2 回目以降は
`fatal: a branch named '<branch>' already exists` で即死する。

## 設計方針

retry loop 内で **エラー種別を判別し、args を動的に切り替える**。

### retry 前の branch 存在チェック（要件 1）

lock contention で fail した後、retry 前に以下を行う:

```
git rev-parse --verify refs/heads/<branchName>
```

- exit 0 → branch は既に存在する
  → `-b` を外し、既存 branch を使った worktree add に切り替える:
  ```
  git worktree add <worktreePath> <branchName>
  ```
  （`<ref>` ではなく `<branchName>` を指定。既存 branch の HEAD から checkout される）

- exit 非 0 → branch は存在しない
  → 元の `-b` args でそのまま retry

**なぜ stderr パースではなく事前チェックか**: stderr の文言は git バージョンに依存する。
`rev-parse --verify` は安定した exit code ベースの判定ができる。

### 全 retry 失敗後の branch cleanup（要件 2）

全 retry を使い切って throw する直前に:

```
git branch -D <branchName>
```

を実行する。失敗しても（branch が存在しない場合など）エラーは握りつぶす。
これにより次回 run で同一 branch 名が衝突しない。

cleanup 対象は `branchName` が指定されている場合のみ。
`--detach` モード（branchName なし）では branch が作成されないため cleanup 不要。

### 実装箇所

`src/core/worktree/manager.ts` の `create()` メソッド内 retry loop のみ。

変更前:
```typescript
const wtArgs = branchName
  ? ["worktree", "add", "-b", branchName, worktreePath, ref]
  : ["worktree", "add", "--detach", worktreePath, ref];

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  const wtResult = await spawn("git", wtArgs, { cwd: repoRoot });
  if (wtResult.exitCode === 0) break;
  // ...
}
```

変更後（概要）:
```typescript
let wtArgs = branchName
  ? ["worktree", "add", "-b", branchName, worktreePath, ref]
  : ["worktree", "add", "--detach", worktreePath, ref];

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  const wtResult = await spawn("git", wtArgs, { cwd: repoRoot });
  if (wtResult.exitCode === 0) break;

  const isLockContention = wtResult.stderr.includes("could not lock config file");
  if (!isLockContention || attempt === MAX_RETRIES) {
    // 全 retry 失敗: branch cleanup
    if (branchName) {
      await spawn("git", ["branch", "-D", branchName], { cwd: repoRoot });
    }
    throw new Error(...);
  }

  // retry 前: branch が作成済なら args を切り替え
  if (branchName) {
    const check = await spawn("git", ["rev-parse", "--verify", `refs/heads/${branchName}`], { cwd: repoRoot });
    if (check.exitCode === 0) {
      wtArgs = ["worktree", "add", worktreePath, branchName];
    }
  }

  await sleep(delayMs);
}
```

### インターフェースへの影響

- `WorktreeManager` の公開インターフェース変更なし
- `createWorktreeManager` のシグネチャ変更なし
- 呼び出し元（`local.ts` 等）の変更なし

### テスト戦略

既存の DI 機構（`spawnFn`, `sleepFn`）で全パスをカバー可能。
spawnFn のレスポンス配列に `rev-parse` / `branch -D` のモックを追加するだけ。

新規テストケース:
- lock contention → branch 存在 → `-b` なしで retry → 成功
- lock contention → branch 未存在 → `-b` 付きで retry → 成功
- 全 retry 失敗 → `git branch -D` が呼ばれる
- `--detach` モード（branchName なし）では branch cleanup が呼ばれない
- 既存テスト（TC-WTM-001〜012）が全て green
