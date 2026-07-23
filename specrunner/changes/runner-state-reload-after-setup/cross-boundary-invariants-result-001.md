# Cross-Boundary Invariants Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証対象

`src/core/command/runner.ts` の setupWorkspace 後 reload ブロック、`src/core/port/runtime-strategy.ts` の `reloadJobState` 追加、`src/core/runtime/local.ts` / `managed.ts` の実装、および変更に隣接するコード（workspace-materializer.ts / exit-guard.ts / resume.ts / reopen.ts / archive orchestrator）を対象とした。

---

## 歩いた経路

### 1. 新規経路の列挙

diff が導入した新経路は以下の 4 本:

| # | 経路 | 条件 |
|---|------|------|
| A | 新規 run (local, worktree あり) → reloadJobState | existingWorktreePath === undefined, noWorktree !== true |
| B | 新規 run (local, no-worktree) → reloadJobState | existingWorktreePath === undefined, noWorktree === true |
| C | managed runtime 新規 run → reloadJobState → throw | existingWorktreePath === undefined, managed |
| D | resume / reopen 経路 → reload スキップ | existingWorktreePath !== undefined |

### 2. 経路 A（新規 run, worktree あり）

**触れていない側のコード**: workspace-materializer.ts の new-run arm が seed → updateJobState(worktreePath) → updateJobState(synthesizedCommits) → updateJobState(branch) の順で store を更新する前提。

- `reloadJobState` の `stateRoot = workspace.worktreePath` は materializeWorktree が返す `workspaceCtx.worktreePath` と同じ値であり、store の読取りパスは materializer の書込みパスと一致する。
- `storeFactory`（buildDeps 内）も `workspace.worktreePath` を stateRoot とするため、pipeline が使う store と reload が読む store が同一ディレクトリを指す。
- `registerCleanup` は `this.workspace?.worktreePath`（setupWorkspace が設定した値）をクローズするため reload は影響しない。
- `beforeExit` exit guard は `createExitGuardHandler(repoRoot, jobState.jobId, ...)` で登録される（reload 前）が、ハンドラ自体は store を直読するため in-memory の jobState を参照しない。jobId は bootstrapJob で割り当て済みで reload 後も不変。
- signal handler（registerCleanup 内）も store を直読する。

**判定**: 触れていない機構の前提は維持される。

### 3. 経路 B（no-worktree 新規 run）

- `setupWorkspaceNoWorktree` は `stateRoot = this.cwd` で store に書く。
- `reloadJobState` は `workspace.worktreePath ?? this.cwd = undefined ?? this.cwd = this.cwd` を stateRoot として使う。書込みパスと読取りパスが一致する。
- 以降の前提検証は経路 A と同じ。

**判定**: 触れていない機構の前提は維持される。

### 4. 経路 C（managed runtime 新規 run）

`ManagedRuntime.reloadJobState` は `throw new Error("reloadJobState not implemented for managed runtime")` を実装する。runner.ts の reload ブロックはこの throw を fail-closed catch で処理し、`failed` state を persist して exit code 1 を返す。**すべての managed 新規 run がこの経路を通る**。

この挙動は design.md D3 に明示されている: 「明示的な挙動変更(code-review F2): この選択により、managed runtime の**新規 run は setup 直後に exit code 1 で停止する**」。TC-022 / TC-011 が組み合わせとして封鎖する。

設計文書での明示的な設計判断であり、「黙って破る」クラスの不変条件違反ではない。

**判定**: 意図的な breaking change として設計文書に記録済み。

ただし以下の構造的リスクを観察として記録する:

> **Observation (MEDIUM)**: managed resume 経路は `existingWorktreePath !== undefined` を渡す(resume.ts / reopen.ts 両方とも `existingWorktreePath: resolvedWorktreePath` を設定)ため、reload は skip される。managed resume は従来通り動作する。しかし managed 新規 run は全滅するため、別 request の完了まで managed ワークフロー全体が「resume のみ可能（新規不可）」という非対称な状態に入る。この操作上の影響は design.md に記載されているが、managed を使う外部 operator には追加の通知が必要な可能性がある。

### 5. 経路 D（resume / reopen — reload スキップ）

ガード条件: `workspaceOpts.existingWorktreePath === undefined` が `false` → reload はスキップ。resume.ts と reopen.ts はいずれも `existingWorktreePath: resolvedWorktreePath`（文字列または null）を設定する。`null !== undefined` なので resume-without-recorded-worktree case（existingWorktreePath === null）も reload スキップになる。これは正しい。

#### resume-recreated サブケース: in-memory worktreePath の変化

**旧コード（mirror ブロック）**:
```ts
if (workspace.worktreePath !== undefined) {
  jobState.worktreePath = workspace.worktreePath;  // → 新 worktreePath に更新
}
```

**新コード（reload スキップ）**: resume-recreated では `existingWorktreePath` が設定されているため reload しない。materializer は store に `updateJobState(worktreePath: newPath)` を書くが、in-memory `jobState.worktreePath` は resume prepare() が load した旧 path のまま。

この差分の影響を辿った:

1. **pipeline step 実行**: step は `deps.cwd`（workspace.cwd = newPath）を使用。`src/core/step/` と `src/core/pipeline/` のどのファイルも `state.worktreePath` を step 実行パスとして読まない。影響なし。
2. **storeFactory**: `workspace.worktreePath`（newPath）を使う。in-memory state とは独立。影響なし。
3. **registerCleanup**: `this.workspace?.worktreePath`（newPath）をクローズ。影響なし。
4. **commitFinalState**: `deps.cwd` と `state.synthesizedCommits` を使う。`state.worktreePath` は使わない。影響なし。
5. **finalState の永続化**: pipeline 完了後に persisted された `state.worktreePath` は旧 path を含む。`job archive` → `resolveWorktreePathForArchive` は `state.worktreePath` を試みるが、旧 path が存在しない場合、liveness sidecar（setupWorkspace が newPath で更新済み）にフォールバックする。
6. **cancel runner**: 同様の 3-step フォールバック構造。影響なし。

具体的な破壊シナリオを構成しようとしたが、どの経路でも fallback が正常動作する。機能的な破壊には至らない。

> **Observation (LOW)**: runner.ts の reload スキップコメント「setupWorkspace() in the resume/recreate branch does not write synthesizedCommits to the store」は不完全。resume-recreated では `worktreePath` が store に書かれる（updateJobState 経由）が reload によってその値を拾わないため、finalState に旧 worktreePath が含まれる。archive の sidecar fallback がこれを吸収する。機能的影響はないが、将来 state.worktreePath に依存する code を追加する際に気づきにくい差異として残る。コメントを「does not write synthesizedCommits（そのため reload の主目的は達成されない）」と補足すると正確になる。

### 6. attach-from-checkpoint 経路

`src/cli/attach.ts` は `runtime.setupWorkspace()` を `CommandRunner.execute()` を通さず直接呼ぶ。runner.ts の reload ブロックはこの経路には到達しない。confirm: `attachCheckpoint` を `workspaceOpts` に渡す `CommandRunner` サブクラスは存在しない。

**判定**: attach 経路は影響を受けない。

### 7. crash handler（pipeline 例外）の store 参照

```ts
const store = deps.storeFactory(jobState.jobId);
const diskState = await store.load();
```

reload 後、`jobState.jobId` は変わらない（bootstrapJob が割り当て、seed・reload を通じて不変）。storeFactory は workspace.worktreePath を stateRoot とし、disk 上の最新 state を読む。影響なし。

### 8. NormalizedJobState → JobState cast

`store.load()` は `NormalizedJobState` を返す。reload 時点（setup 直後、step 実行前）では `steps = {}` が不変。`JobState.steps` は optional のため cast は安全。コードコメントで明示されている。

---

## Checked Items サマリー

| 検証項目 | 結果 |
|---------|------|
| 経路 A（local worktree 新規 run）の隣接機構前提 | ✓ 維持 |
| 経路 B（no-worktree 新規 run）の stateRoot 一致 | ✓ 一致 |
| 経路 C（managed 新規 run）の意図的 fail-closed | 設計文書に明示 |
| 経路 D（resume）スキップ条件の完全性 | ✓ 正確（null も スキップ対象） |
| resume-recreated の worktreePath stale による機能破壊 | シナリオ構成不可（fallback が吸収） |
| attach-from-checkpoint の非干渉 | ✓ CommandRunner 経由しない |
| exit guard / signal handler の store 直読 | ✓ in-memory 非依存 |
| jobId 不変性 | ✓ 確認 |
| NormalizedJobState cast 安全性 | ✓ 確認 |

---

## Observations（情報記録）

### OBS-1: managed runtime 新規 run が全停止する操作上の影響（MEDIUM）

設計 D3 で意図的に選択。managed resume は引き続き動作するが、managed 新規 run は別 request の完了まで exit code 1 で停止する。TC-022 が封鎖する。

### OBS-2: runner.ts コメントの不完全性（LOW）

`runner.ts:173–175` のコメント「setupWorkspace() in the resume/recreate branch does not write synthesizedCommits to the store」は、resume-recreated が store に `worktreePath` を書く事実を省略している。コメントの主旨（synthesizedCommits は resume 経路で書かれないため reload の主目的は達成されない）は正しいが、将来の保守者に「resume 経路では store に何も書かれない」という誤解を与えうる。
