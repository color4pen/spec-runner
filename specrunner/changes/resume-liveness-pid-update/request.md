# resume 時に liveness sidecar の pid が更新されない

## Meta

- **type**: bug-fix
- **slug**: resume-liveness-pid-update
- **base-branch**: main
- **adr**: false

## 背景

`writeLivenessSidecar`（pid / worktreePath / jobId を `.specrunner/local/<slug>/liveness.json` に書く）は `setupWorkspace` 内からのみ呼ばれる。resume で既存 worktree を再利用する場合、`setupWorkspace` は新規 worktree を作らず既存パスを返すため、sidecar の pid が前回プロセスの値のまま更新されない。

結果、resume 後のプロセスは新しい pid で動いているのに sidecar には前回の死んだ pid が残り、`job ls` の `isStaleRunning` が古い pid を probe して stale と誤判定する（`running (stale?)`）。

## 要件

1. resume で既存 worktree を再利用する場合にも、sidecar の pid を現在のプロセス（`process.pid`）で上書きする。
2. sidecar の他フィールド（worktreePath / jobId）は既存値を保持する（worktree は変わらないため）。

## スコープ外

- sidecar のフォーマット変更
- `job ls` の stale 判定ロジック変更（#537 で対応済み）

## 受け入れ基準

- [ ] resume 後、`.specrunner/local/<slug>/liveness.json` の pid が現在のプロセスの pid に更新されている
- [ ] resume 後、`job ls` が当該 job を `running`（`stale?` なし）と表示する
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- `setupWorkspace` の既存 worktree 再利用パスで `writeLivenessSidecar` を呼ぶだけで済む。新規抽象は不要。
