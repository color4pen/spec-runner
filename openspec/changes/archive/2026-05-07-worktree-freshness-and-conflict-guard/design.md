## Context

worktree は `git worktree add --detach <path> HEAD` でローカル HEAD から作成される（`manager.ts:68`）。`LocalRuntime.setupWorkspace()` に `git fetch` が存在しないため、ローカル main が origin/main より古い場合に古い main から worktree が分岐する。PR #113 merge 直後に PR #114 を実行した際、pull 前のターミナルで run が走り、旧コードで propose/implement が実行された。

finish の `pollMergeStateAfterPush()` は DIRTY（conflict 確定状態）を明示的にハンドルしていない。DIRTY 時に merge を試みて失敗するのではなく、早期に検出して escalation すべき。

## Goals / Non-Goals

**Goals:**

- run パスで worktree が常に origin/main の最新から作成される
- ローカル main が behind の場合に warning が出力される
- resume パスの worktree 再作成でも origin/main が使用される
- finish で DIRTY を検出したら merge を試みずに escalation する
- BEHIND は escalation にしない（squash merge は BEHIND で通ることが多い）
- base branch 可変化の将来拡張ポイントが TODO コメントでマークされる

**Non-Goals:**

- base branch の可変化の実装（TODO コメントのみ）
- conflict 発生時の自動 rebase
- managed runtime での fetch（worktree を使わない）
- preflight へのネットワーク IO 追加（preflight は runtime-neutral な静的チェック）

## Decisions

### D1: git fetch は preflight ではなく LocalRuntime.setupWorkspace() に配置

preflight は runtime-neutral な静的チェックであり、ネットワーク IO は runtime 固有の責務。`LocalRuntime.setupWorkspace()` の run パスで `git fetch origin` を実行し、worktree 作成前に origin/main を更新する。

**代替案**: preflight に fetch を入れる → reject。preflight は `finish/preflight.ts` にあり runtime-neutral の設計原則に反する。run の workspace setup は `LocalRuntime` の責務。

### D2: WorktreeManager.create() に baseRef 引数追加（責務分離）

`WorktreeManager.create()` に `baseRef?: string`（デフォルト `"HEAD"`）を追加する。manager は「指定された ref から worktree を作る」責務のみを持ち、fetch は呼び出し側（LocalRuntime）の責務。

```typescript
// Before
create(repoRoot: string, slug: string, jobId: string): Promise<string>;

// After
create(repoRoot: string, slug: string, jobId: string, baseRef?: string): Promise<string>;
```

git worktree add の最後の引数を `"HEAD"` から `baseRef ?? "HEAD"` に変更する。

**代替案**: manager 内部で fetch する → reject。manager の責務は worktree 管理であり、ネットワーク IO は含めない。

### D3: behind 検出は warning のみ（error にしない）

`git fetch origin` 後・worktree 作成前に `git rev-list HEAD..origin/main --count` でローカル main の behind 数を取得する。0 より大きければ warning を出力するが error にはしない。

**理由**: worktree は `origin/main` から作成されるため、ローカル main が古くても動作に問題はない。warning はユーザーへの情報提供目的。

### D4: DIRTY は即 escalation、BEHIND は merge を試みる

`pollMergeStateAfterPush()` で `status === "DIRTY"` を検出したら即座にリトライを打ち切り `{ mergeStateStatus: "DIRTY" }` を返す。DIRTY は conflict が存在する確定状態であり、CLEAN にはならない。

orchestrator で `mergeStateAfterPush === "DIRTY"` の場合は Phase 3 に進まず escalation を返す。メッセージでユーザーに手動 rebase を促す。

BEHIND は escalation にしない。`gh pr merge --squash` は BEHIND でも通ることが多い（GitHub が自動で最新 base と合成する）。BEHIND で merge が失敗した場合は既存の Phase 3 エラーハンドリングで escalation になる。

### D5: resume パスでは fetch 不要

resume パスで worktree を再作成する場合（`setupWorkspace()` の 2 箇所）も `"origin/main"` を baseRef として渡す。ただし run パスで fetch した origin/main がローカルに存在する前提のため、resume パスでは fetch を再実行しない。

## Risks / Trade-offs

- **[Risk] git fetch origin がネットワーク到達不能で失敗**: fetch 失敗は error として伝播させる。offline 環境での run は元々成立しない（gh pr create 等で失敗する）ため追加リスクではない
- **[Risk] origin/main が存在しない（fork 等）**: default remote が origin でない場合は失敗する。base branch 可変化（将来 request）で対応。現時点では origin/main を前提とする
- **[Risk] baseRef のデフォルト値変更で既存テスト破壊**: デフォルト `"HEAD"` を維持するため、既存の `create(repoRoot, slug, jobId)` 呼び出しは互換。テストでの spawn mock は `"HEAD"` を期待しており変更不要
