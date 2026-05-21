# CommandRunner で worktreePath が pipeline persist に上書きされるバグを修正する

## Meta

- **type**: bug-fix
- **slug**: fix-worktreepath-persist-in-command-runner

## 背景

PR #114（session-lifecycle-extraction）で `run.ts` / `resume.ts` を `CommandRunner` + `RuntimeStrategy` にリファクタリングした際、worktreePath の state 反映が抜けた。

### 旧コード（run.ts、PR #114 以前）

```ts
await updateJobState(jobState.jobId, (s) => ({ ...s, worktreePath }));
jobState = { ...jobState, worktreePath };  // ← in-memory も更新
```

2 行目で in-memory の `jobState` を更新していたため、pipeline が `persist(state)` しても worktreePath が維持された。

### 新コード（PR #114 以降）

`LocalRuntime.setupWorkspace()` は `updateJobState()` で state store を更新するが、`CommandRunner.execute()` が pipeline に渡す in-memory `jobState` オブジェクトは更新されない。pipeline が step ごとに `persist(state)` すると、worktreePath のない古い state で上書きされる。

### 結果

- `worktreePath` が `null` のまま state に永続化される
- `finish` が worktree を認識できず、main から `git checkout -B <branch>` を試みる
- worktree がブランチを hold しているため checkout が失敗する
- PR #115 の finish で実際にこの問題が発生し、手動で worktree 削除 + ブランチ削除が必要だった

## 要件

1. `CommandRunner.execute()` で `runtime.setupWorkspace()` の返り値 `workspace.worktreePath` を `jobState` に反映してから pipeline に渡す
2. `CommandRunner` のテスト（`tests/unit/core/command/runner.test.ts`）に、pipeline に渡される `jobState` の `worktreePath` が `workspace.worktreePath` と一致することを検証するテストを追加する

## 受け入れ基準

- [ ] pipeline に渡される `jobState.worktreePath` が `workspace.worktreePath` の値と一致する
- [ ] finish が worktree を認識し、main からの checkout なしで操作できる
- [ ] `bun run typecheck && bun run test` が green


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/fix-worktreepath-persist-in-command-runner.md` by `merged-to-archive-consolidation`.
