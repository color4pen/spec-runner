## Context

local runtime は main cwd 上で全 step を実行する。verification step は temp worktree を作成するが、propagate も別の temp worktree を作成し、finish は main cwd で feature branch に checkout する。この「main cwd 直接操作 + 複数 temp worktree」設計が 5 つの failure mode を生んでいる（proposal.md 参照）。

既存コードには 3 箇所の worktree 操作がある:
1. `verification.ts` L47-96: 実行用 temp worktree（`--detach` mode、`/tmp/specrunner-verify-exec-*`）
2. `propagate.ts` L52-104: 結果 push 用 temp worktree（`-B` mode、`/tmp/specrunner-verify-*`）
3. `orchestrator.ts` L197-241: worktree 検出ロジック（Phase 4 checkout skip）

## Goals / Non-Goals

**Goals:**

- job 開始時に persistent worktree を作成し、pipeline 全体をその中で実行する
- main cwd を一切変更しない（untracked files なし、checkout 汚染なし）
- verification / propagate の temp worktree を廃止し、job worktree で代替する
- finish が worktree path 経由で操作し、main cwd の checkout を不要にする
- SIGINT/SIGTERM で orphan worktree を確実に cleanup する
- managed mode に影響を与えない

**Non-Goals:**

- 並列 job 実行の実装（設計的には可能だが今は不要）
- worktree の node_modules 共有最適化（symlink 等）
- managed runtime の worktree 化（managed は clone ベースで独自に分離済み）
- finish Phase 3（gh pr merge）の変更

## Decisions

### D1: WorktreeManager を src/core/worktree/manager.ts に新設

```ts
export interface WorktreeManager {
  create(repoRoot: string, slug: string, jobId: string): Promise<string>;
  remove(worktreePath: string): Promise<void>;
  prune(repoRoot: string): Promise<void>;
}
```

- `create`: `.git/specrunner-worktrees/<slug>-<jobId-short>/` に worktree を作成。`git worktree add --detach <path> HEAD` を実行後、`bun install --frozen-lockfile` を実行。worktree path を返す。`slug` は呼び出し元が供給し、path の一意性に使用する（`branch` パラメータは不要 — worktree 作成時点では branch 未確定のため detach モードを使用し、propose step 完了後に worktree 内で `git checkout -B <feature-branch>` を実行する）
- `remove`: `git worktree remove --force <path>` + directory の rm -rf（残骸対策）
- `prune`: `git worktree prune` で orphan 参照を掃除

**worktree path**: `.git/specrunner-worktrees/` 内に配置。理由: parent directory（プロジェクトルート）を汚染しない。`.git/` 内なので `.gitignore` 不要。`<slug>-<jobId-short>` で一意性を確保（jobId の先頭 8 文字）

**代替案**: `/tmp/specrunner-worktree-*` に配置する案。却下理由: reboot で消える、crash recovery 時に発見困難、state file の `worktreePath` が dangling pointer になる

### D2: JobState に worktreePath フィールドを追加

```ts
export interface JobState {
  // ...existing fields...
  worktreePath?: string | null;
}
```

Optional field（backward compat）。local runtime の run 開始時にセットし、finish 完了後に null に戻す。crash recovery: state file に worktreePath が残っていれば cleanup 対象として使用可能。

### D3: run.ts の worktree 統合（local runtime only）

`runRunCore` で worktree を作成し、`deps.cwd` を worktree path に差し替える:

```
1. config.runtime === "local" の場合のみ:
   a. WorktreeManager.create(cwd, slug, jobId) で worktree 作成（`--detach HEAD` モード）
      propose step 完了後に worktree 内で `git checkout -B <feature-branch>` を実行
   b. request ファイルを worktree にコピー（対象: request.md 単体）
   c. state.worktreePath に記録
2. deps.cwd = worktreePath ?? cwd
3. pipeline 実行
4. finally: cleanup（成功時は finish に委譲、失敗時は remove）
```

**branch 未確定問題**: propose step が branch 名を決定するため、worktree 作成時点では branch が不明。解決策: `git worktree add --detach <path> HEAD` で HEAD から detach 状態の worktree を作成し、propose step 完了後に worktree 内で `git checkout -B <feature-branch>` を実行する（pipeline の `deps.cwd` が worktree を指しているため propose step が自然に worktree 内で branch を切る）。

**代替案**: propose step 完了後に worktree を作成する案。却下理由: propose step 自体が change folder を main cwd に作成してしまう問題が解決しない

### D4: verification step の簡素化

verification.ts の L47-96（temp worktree 作成・cleanup）を削除。`verificationCwd = orchestratorCwd`（= job worktree path）のみで実行。

- worktree は既に feature branch をチェックアウト済み
- `bun install` は worktree 作成時に実行済み
- result file は worktree 内に直接書かれる → コピー不要

propagation（L98-115）も簡素化: job worktree から直接 `git add` + `git commit` + `git push` する。temp worktree 不要。

### D5: propagate.ts の簡素化

`propagateVerificationResult` の temp worktree ロジック（L52-104）を削除。代わりに `cwd`（= job worktree）内で直接操作:

```
1. verification-result.md を git add
2. git commit
3. git push origin <branch>
```

worktree は既に feature branch にいるため、fetch + worktree add が不要。

### D6: finish の worktree 対応

**Phase 0 (preflight.ts)**:
- `state.worktreePath` を読み、その path 内で Check 5+6 を実行（checkout 不要 — worktree は既に feature branch）
- worktreePath が null の場合（managed mode / crash recovery）: 既存の `checkoutForValidation` → validate → `restoreBranch` フローを維持する。新規 temp worktree は作成しない（managed mode の既存動作を壊さないため）
- `checkoutForValidation` / `restoreBranch` は null フォールバックに必要なため削除しない。local mode（worktreePath あり）では呼び出されない分岐として残す

**Phase 1 (orchestrator.ts)**:
- `state.worktreePath` の cwd で archive / git mv / commit を実行（checkout 不要）
- worktreePath が null の場合: 既存の `checkoutFeatureBranch` フローを維持する。`checkoutFeatureBranch` は null フォールバックのため削除しない

**Phase 2**:
- push 後に mergeStateStatus が CLEAN になるまで polling（既存の retry ロジックを活用）

**Phase 4**:
- worktree を `WorktreeManager.remove` で削除
- `state.worktreePath` を null に更新
- main cwd の checkout/pull は不要（worktree が分離されているため main は clean なまま）

### D7: signal handler による cleanup

`runRunCore` の pipeline 実行前に `process.on('SIGINT', ...)` / `process.on('SIGTERM', ...)` を登録:

```ts
const cleanup = async () => {
  if (worktreePath) {
    await manager.remove(worktreePath);
    await manager.prune(cwd);
  }
  process.exit(130); // 128 + SIGINT(2)
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
```

3 層防御: (1) signal handler、(2) state file の worktreePath による後続 cleanup、(3) `git worktree prune` による orphan 掃除。

### D8: managed mode への非影響

全ての worktree ロジックは `config.runtime === "local"` ガード内に配置。managed mode のコードパスには一切触れない。`deps.cwd` の差し替えは local runtime のみ。

## Risks / Trade-offs

- **[disk 使用量 + 時間]** worktree ごとに `bun install --frozen-lockfile` で node_modules をフル作成。大規模プロジェクトでは数百 MB / 10-30 秒の pipeline 遅延が発生しうる。spec-runner 自体は小規模（依存数十個）であり warm cache 時は実測 3-5 秒以内。許容範囲と判断。緩和策: finish 完了時に即 remove。並列実行は Non-Goal
- **[branch 未確定問題]** propose step が branch を決めるため、worktree 作成時の branch が main になる。propose 完了後に branch 切り替えが必要 → D3 で解決策を定義済み
- **[crash recovery]** process が kill -9 された場合、signal handler が動かず orphan worktree が残る → 緩和策: state file の worktreePath + `git worktree prune` の 2 層で対応。`specrunner doctor` に worktree orphan check を追加する案（本変更の scope 外）
- **[既存テストの改修]** verification.ts / propagate.ts / preflight.ts のテストが temp worktree 前提 → mock の書き換えが必要
- **[finish が worktree 前提になる]** managed mode の finish は worktreePath=null で動く必要がある → D6 のフォールバック（worktreePath=null 時は既存の checkout ベースフローを維持）で対応
