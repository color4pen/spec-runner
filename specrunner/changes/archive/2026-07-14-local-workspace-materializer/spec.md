# Spec: local の setupWorkspace を WorktreeMaterializationPlan / materializeWorktree へ集約する

## Requirements

### Requirement: WorktreeMaterializationPlan で 5 アームを型として表現する

`WorktreeMaterializationPlan` は 5 つの variant を持つ識別合併型（DU）として定義される SHALL。
各 variant は `setupWorkspace` の対応するアームと 1 対 1 に対応し、そのアームに固有のデータのみを保持する。

#### Scenario: new-run plan には remoteBaseRef と branchName が含まれる

**Given** `opts.existingWorktreePath` が未定義（新規 run）である
**When** `setupWorkspace` が plan を決定する
**Then** `{ kind: "new-run", remoteBaseRef: "origin/main", branchName: <値> }` の plan が生成される

#### Scenario: resume-existing plan には worktreePath が含まれる

**Given** `opts.existingWorktreePath` にパスが設定されており、そのパスがディスク上に存在する
**When** `setupWorkspace` が plan を決定する
**Then** `{ kind: "resume-existing", worktreePath: <existingWorktreePath> }` の plan が生成される

#### Scenario: resume-recreated plan は worktree が削除済みのときに生成される

**Given** `opts.existingWorktreePath` にパスが設定されているが、そのパスがディスク上に存在しない
**When** `setupWorkspace` が plan を決定する
**Then** `{ kind: "resume-recreated", remoteBaseRef: <値> }` の plan が生成される

---

### Requirement: materializeWorktree が実体化と registration を担う

`materializeWorktree` は `WorktreeMaterializationPlan` を受け取り、`this.workspace` のセット / bootstrap seed / `updateJobState` / liveness sidecar / recopy を実行して `WorkspaceContext` を返す SHALL。

#### Scenario: resume-existing arm では updateJobState(worktreePath) を呼ばない

**Given** `plan.kind === "resume-existing"` である
**When** `materializeWorktree` が実行される
**Then** `worktreePath` に関する `updateJobState` 呼び出しは行われない（既存 worktree パスは既に state に記録済みのため）

#### Scenario: resume-recreated arm では新規 worktree を作成して worktreePath を state に記録する

**Given** `plan.kind === "resume-recreated"` である
**When** `materializeWorktree` が実行される
**Then** `manager.create` で worktree が作成され、`updateJobState` で `worktreePath` が state に記録される

#### Scenario: new-run arm では requestFilePath が渡された場合に change folder へのコピーとコミットが行われる

**Given** `plan.kind === "new-run"` であり `opts.requestFilePath` が設定されている
**When** `materializeWorktree` が実行される
**Then** `changeFolderPath(slug)/request.md` へのコピー・git add・コミット（`add request.md for <slug>`）が実行される

---

### Requirement: setupWorkspace はアームの判定と materializeWorktree への委譲のみを行う

リファクタリング後、`setupWorkspace` は `WorktreeMaterializationPlan` を決定し `materializeWorktree` に渡す役割のみを持つ SHALL。実体化ロジック（`this.workspace` セット・bootstrap seed・`updateJobState`・liveness sidecar・recopy）を直接含まない。

#### Scenario: setupWorkspace の外部から見た振る舞いが変わらない

**Given** リファクタリング前と同じ `slug`, `jobId`, `opts` が渡される
**When** `setupWorkspace` を呼び出す
**Then** 返される `WorkspaceContext` の内容（cwd / worktreePath / branch / noWorktree）が変化しない

---

### Requirement: 既存テストが期待値書き換えなしで green のまま通る

本変更は挙動不変のリファクタリングである。既存テストの期待振る舞いを書き換えない SHALL。import パス / mock パスの機械的更新は許容する。

#### Scenario: bun run test が 0 exit で完了する

**Given** T-01〜T-03 のリファクタリングが完了している
**When** `bun run typecheck && bun run test` を実行する
**Then** 両コマンドが exit code 0 で完了する
