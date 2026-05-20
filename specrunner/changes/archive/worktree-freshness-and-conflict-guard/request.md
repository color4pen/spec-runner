# worktree の freshness 保証と finish 時の conflict guard

## Meta

- **type**: bug-fix
- **slug**: worktree-freshness-and-conflict-guard

## 背景

worktree は `git worktree add --detach <path> HEAD` でローカルの HEAD から作成される（`src/core/worktree/manager.ts:68`）。`LocalRuntime.setupWorkspace()` に `git fetch` がないため、ローカル main が origin/main より古い場合、古い main から worktree が分岐する。

実例: PR #113 を merge した直後に PR #114 の `specrunner run` を実行したところ、別ターミナルで `git pull` していたにもかかわらず、run を実行したターミナルでは pull 前の状態で worktree が作成され、PR #113 の変更が含まれない worktree で pipeline が走った。

これにより：
- propose が旧 spec を前提に設計する
- implementer が旧コードを前提に実装する
- finish 時に merge conflict が発生する

また、finish の Phase 3（`gh pr merge --squash`）は mergeStateStatus を polling するが、DIRTY（conflict あり）を明示的にハンドルしていない。conflict 時に merge を試みて失敗するのではなく、早期に検出して escalation すべき。

## 要件

### 1. run 時の freshness 保証

1. `LocalRuntime.setupWorkspace()` の run パスで、worktree 作成前に `git fetch origin` を実行する。preflight には入れない（preflight は runtime-neutral な静的チェックであり、ネットワーク IO は runtime 固有の責務）
2. `WorktreeManager.create()` に `baseRef?: string` 引数を追加する（デフォルト `"HEAD"`）。`LocalRuntime.setupWorkspace()` が `this.manager.create(this.cwd, slug, jobId, "origin/main")` と呼ぶ。manager 内部で fetch は行わない（manager の責務は「指定された ref から worktree を作る」こと）
3. fetch 後・worktree 作成前に `git rev-list HEAD..origin/main --count` でローカル main の behind 数を取得し、0 より大きければ warning を出す（error にはしない — worktree は origin/main から作成されるので動作に問題はない）
4. resume パスで worktree を再作成する場合（`LocalRuntime.setupWorkspace()` の 2 箇所）も `"origin/main"` を baseRef として渡す。ただし resume パスでは fetch は不要（run パスで fetch した origin/main がローカルに存在する前提）

### 2. finish 時の conflict guard

5. `pollMergeStateAfterPush()` 内で `mergeStateStatus === "DIRTY"` を検出したら即座にリトライを打ち切り `{ mergeStateStatus: "DIRTY" }` を返す（DIRTY は conflict が存在する確定状態で、CLEAN にならない）
6. orchestrator.ts で `mergeStateAfterPush === "DIRTY"` の場合、Phase 3 に進まず escalation を返す。メッセージ: `"PR has merge conflicts (DIRTY). Rebase the feature branch onto main and re-run: specrunner finish <slug>"`
7. BEHIND は escalation にしない（`gh pr merge --squash` は BEHIND でも通ることが多い。GitHub が自動で最新 base と合成する）。BEHIND で merge が失敗した場合は既存の Phase 3 エラーハンドリングで escalation になる

### 3. base branch の将来対応（設計のみ）

8. 以下の箇所に `// TODO(base-branch): configurable base branch` コメントを追加する：
   - `WorktreeManager.create()` の baseRef デフォルト値
   - `LocalRuntime.setupWorkspace()` の `"origin/main"` リテラル
   - `finish/orchestrator.ts` Phase 4 の `"main"` リテラル
9. 実際の可変化は別 request で行う

## スコープ外

- base branch の可変化の実装（本 request では拡張ポイントのコメントのみ）
- conflict 発生時の自動 rebase（ユーザーに手動 rebase を促す）
- managed runtime での fetch（worktree を使わないため不要）

## 受け入れ基準

- [ ] `LocalRuntime.setupWorkspace()` の run パスで `git fetch origin` が走る
- [ ] `WorktreeManager.create()` に `baseRef` 引数があり、`origin/main` が渡される
- [ ] worktree が `origin/main` から作成される
- [ ] ローカル main が behind の場合 warning が出る
- [ ] finish で mergeStateStatus が DIRTY の場合、polling を即打ち切り escalation になる（merge を試みない）
- [ ] BEHIND は escalation にならず merge を試みる
- [ ] resume の worktree 再作成パスでも `origin/main` が baseRef として渡される
- [ ] `bun run typecheck && bun run test` が green

## 補足

### architect 評価済みの設計判断

- git fetch は preflight ではなく `LocalRuntime.setupWorkspace()` に配置。preflight は runtime-neutral な静的チェック、ネットワーク IO は runtime 固有の責務
- `WorktreeManager.create()` への baseRef 引数追加。manager 内部で fetch しない（責務分離）
- behind 検出は warning のみ。worktree は origin/main から作成されるのでローカル main が古くても動作に問題はない
- DIRTY は即 escalation。BEHIND は merge を試みる（squash merge は BEHIND で通ることが多い）


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/worktree-freshness-and-conflict-guard.md` by `merged-to-archive-consolidation`.
