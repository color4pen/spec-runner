# Tasks: resume 時の liveness sidecar pid 更新

## T-01: 既存 worktree 再利用 path で `writeLivenessSidecar` を呼ぶ

`src/core/runtime/local.ts` の `setupWorkspace` を編集する。

- [x] `existingWorktreePath` が指定され、かつ `worktreeExists === true`（既存 worktree を再利用する）分岐で、
  `WorkspaceContext` を return する直前に sidecar 書き込みを追加する:
  - `this.workspace = workspace;` の後、`return workspace;` の前に
    `await this.writeLivenessSidecar(slug, jobId, existingWorktreePath);` を 1 行追加する。
  - 渡す `worktreePath` 引数は再利用する worktree のパス（`existingWorktreePath`。`workspace.worktreePath` と同値）を
    使い、`worktreePath` / `jobId` を既存値のまま保持する（要件 2）。
- [x] state（`updateJobState`）は再書き込みしない。worktree は変わらないため `state.worktreePath` の更新は不要
    （新規作成 3 経路との差分。design D2）。
- [x] 新規 worktree 作成 3 経路（run / recreate / null）の既存 `writeLivenessSidecar` 呼び出しは変更しない。

**Acceptance Criteria**:
- `setupWorkspace` の既存 worktree 再利用 path（`manager.create` を呼ばず既存パスを return する分岐）で
  `writeLivenessSidecar` が呼ばれている。
- 渡される `worktreePath` / `jobId` が既存 worktree の値であり、フォーマット（フィールド構成）は不変。
- `bun run typecheck` が green。

## T-02: 再利用 path の sidecar pid 更新を検証するテストを追加する

`tests/unit/core/runtime/local.test.ts` にテストを追加する（既存 `TC-LR-002` の再利用 path と同じ
セットアップを踏襲。`runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager })`、
既存 worktree dir を `fs.mkdir` で作成）。T-01 のインターフェース確定後に着手する。

- [x] 再利用 path で sidecar の pid が現在プロセスに更新されることを検証する:
  - 既存 worktree dir（例 `path.join(tempDir, "existing-worktree")`）を作成する。
  - sidecar path `path.join(tempDir, ".specrunner/local/test-slug/liveness.json")` に、古い pid
    （例 `999999`）・`worktreePath`（= 既存 worktree パス）・`jobId`（= `jobState.jobId`）を持つ
    `liveness.json` を事前に書き込む（親ディレクトリは `fs.mkdir(..., { recursive: true })`）。
  - `setupWorkspace("test-slug", jobState.jobId, { existingWorktreePath: <既存パス> })` を呼ぶ。
  - sidecar を read → JSON parse し、`pid === process.pid` を assert する。
- [x] worktreePath / jobId が保持されることを検証する:
  - 同じ sidecar の `worktreePath` が既存 worktree パスのまま、`jobId` が `jobState.jobId` のままであることを assert する。
- [x] 事前 sidecar が存在しない場合でも、再利用 path で sidecar が新規生成され `pid === process.pid` で
  書かれることを検証する（best-effort で例外を投げずに workspace が return されることも確認する）。

**Acceptance Criteria**:
- spec.md の各 Scenario（pid 更新 / worktreePath・jobId 保持）に対応するテストが存在する。
- 追加テストが green。
- `bun run test` が green。

## T-03: 受け入れ基準の最終検証

- [x] `bun run typecheck && bun run test` を実行し、全 green を確認する。
- [x] request.md の受け入れ基準を満たしていることを確認する:
  - resume 後、`.specrunner/local/<slug>/liveness.json` の `pid` が現在のプロセスの pid に更新されている。
  - resume 後、`job ls` が当該 job を `running`（`stale?` なし）と表示する（生存 pid の probe が成功するため）。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- request.md の 3 つの受け入れ基準がすべて満たされている。
