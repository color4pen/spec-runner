# Regression Gate Result — Iteration 002

- **verdict**: approved

## Ledger Verification

### [LOW] TC-016（must）：spawn failure パスが commitAndPush に直接スレッドされていない

- **Status**: fixed ✅
- **File**: tests/unit/step/commit-and-push.test.ts

#### Verification

`makeGitSpawnFnWithSpawnError` ヘルパー（line 288）が追加され、`error` イベントを emit する ChildProcess を返す（従来の `makeGitSpawnFn` は `close` イベントのみ）。これにより `runSubprocess` が reject → `gitExecResult` が `{ok:false, exitCode:-1}` を返す経路が直接テストされる。

TC-CAP-016（line 734）がこのヘルパーを使用し：
- `git add` で spawn failure が発生すること
- `commitAndPush` が `COMMIT_AND_PUSH_FAILED` で reject すること
- `diff` / `commit` / `push` が呼ばれないこと

を固定。`!addResult.ok` 分岐が commitAndPush 文脈で独立してテストされており、must ギャップは解消されている。

## Findings

なし（regression なし）
