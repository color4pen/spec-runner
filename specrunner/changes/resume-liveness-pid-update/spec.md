# Spec: resume 時の liveness sidecar pid 更新

## Requirements

### Requirement: 既存 worktree 再利用時に sidecar の pid を現在プロセスで更新する

`LocalRuntime.setupWorkspace` が resume で既存 worktree を再利用する（`existingWorktreePath` が指す
ディレクトリが disk 上に存在する）場合、`.specrunner/local/<slug>/liveness.json` の `pid` を
現在のプロセス（`process.pid`）で上書き SHALL する。

#### Scenario: 既存 worktree を再利用する resume

**Given** 既存の worktree ディレクトリが disk 上に存在し、`liveness.json` に前回プロセスの古い pid が記録されている
**When** `setupWorkspace` が `existingWorktreePath` に当該 worktree を指定して呼ばれる
**Then** `liveness.json` の `pid` が現在のプロセスの `process.pid` に更新される

#### Scenario: resume 後の job ls 表示

**Given** 既存 worktree を再利用して resume したプロセスが生存している
**When** ユーザーが `job ls` を実行する
**Then** その job の STATUS 列は素の `running` で表示され、`(stale?)` は付かない

### Requirement: sidecar の worktreePath / jobId は既存値を保持する

既存 worktree 再利用時の sidecar 更新において、`worktreePath` と `jobId` は再利用する worktree の値
（= 既存値）を保持 SHALL し、変更しては MUST NOT。

#### Scenario: worktreePath / jobId が変わらない

**Given** `liveness.json` に `worktreePath` と `jobId` が記録された既存 worktree がある
**When** `setupWorkspace` が当該 worktree を `existingWorktreePath` として再利用する
**Then** 更新後の `liveness.json` の `worktreePath` は再利用する worktree のパスのまま、`jobId` は当該 job の ID のままである
