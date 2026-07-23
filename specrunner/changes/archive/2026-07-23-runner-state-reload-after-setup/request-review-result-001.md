# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. runner.ts の手動 mirror コード（要件 1）

`src/core/command/runner.ts:169-181` を読んだ。

```typescript
// Reflect worktreePath into in-memory jobState so pipeline persist does not overwrite it.
if (workspace.worktreePath !== undefined) {
  jobState.worktreePath = workspace.worktreePath;
}
// Reflect branch set by setupWorkspace() into in-memory jobState (D3).
if (workspace.branch !== undefined && !jobState.branch) {
  jobState.branch = workspace.branch;
}
```

`worktreePath` と `branch` のみ mirror。`synthesizedCommits` の mirror は存在しない。request の記述と一致。

### 2. workspace-materializer.ts の new-run arm（要件 1）

`src/core/runtime/workspace-materializer.ts` を全文読んだ。new-run case（lines 154-256）で以下の順序を確認:

1. worktree 作成 → `registerWorkspace()` (invariant 1)
2. `bootstrapState` seed → `new JobStateStore(...).persist(opts.bootstrapState)` (lines 169-173)
3. `updateJobState(worktreePath)` (line 176)
4. request.md コピー・ステージ・commit
5. `git rev-parse HEAD` で bootstrap OID 取得
6. `updateJobState(appendSynthesizedCommit(bootstrapOid))` (lines 238-242) → **store のみ更新**
7. `updateJobState(branch)` (lines 248-252)

synthesizedCommits は store に書かれるが in-memory jobState には反映されない。request の根本原因診断と一致。

**注記**: request が引用した行番号 `workspace-materializer.ts:112-116` は resume-recreated / resume-without-recorded-worktree case の seed + updateJobState(worktreePath) のみ含む部分を指しており、appendSynthesizedCommit を含む全シーケンスは new-run arm（lines 154-256）にある。診断の意味は正確だが行番号は minor inaccuracy。

### 3. commit-push.ts のエグレスチェック（要件 1）

scoped mode（line 528）と guarded mode（line 597）の両方で:

```typescript
await runInlineEgressCheck(infra.spawnFn, cwd, branch, state.synthesizedCommits ?? []);
```

`state` は `commitAndPush(step, state, deps, ...)` の引数として渡された in-memory state を参照。store ではなく pipeline に渡された jobState から読む。request の診断と一致。

### 4. 既存テストのカバレッジギャップ（要件 3）

`tests/unit/core/runtime/bootstrap-egress-ledger-wm.test.ts` — TC-001（wm host mock 経由の mutator 検証）、R2（ledger persistence failure）、TC-004（rev-parse failure cleanup）を確認。

`tests/unit/core/runtime/bootstrap-egress-ledger-local.test.ts` — TC-002（local.ts no-worktree path の store 直読み検証）、TC-005 を確認。

**注記**: request で「TC-002(local)は wm test file 内」と読める記述があるが、TC-002 は `bootstrap-egress-ledger-local.test.ts` に存在する。minor attribution 違いで診断への影響なし。

「store に書いた ledger が pipeline の in-memory state に到達する経路をどのテストも踏んでいない」という claim を確認。TC-001 は mock で mutator 適用後の trackedState を見るが、pipeline.run() に渡される jobState とは別物。TC-002 は store を直読みで検証。どちらも「reload 後に in-memory 経路に bootstrap OID が含まれる」を assert していない。claim 一致。

### 5. in-memory 専用 field の保全確認（要件 2）

`src/core/command/pipeline-run.ts:127-157` を確認:

- `bootstrapJob()` → in-memory jobState 生成（no I/O）
- `jobState.reviewers = reviewers` (line 144) — seed 前に設定
- `jobState.noWorktree = true` (line 151) — seed 前に設定
- `jobState.issueNumber = this.options.issue` (line 156) — seed 前に設定
- `workspaceOpts: { bootstrapState: jobState }` (line 176) — これらを含む jobState を seed 対象として渡す

`setupWorkspace()` 内で `bootstrapState` を slug store に persist する時点でこれらの field を含む。reload 後の state にこれらが含まれることは構造的に保証される。要件 2 の "seed がそれらを含む時点で行われる現行順序を前提に" の記述と一致。

### 6. no-worktree path の対称性

`src/core/runtime/local.ts:331-442`（`setupWorkspaceNoWorktree`）を確認。worktree あり path（workspace-materializer.ts）と同型の処理を行い:

- seed → updateJobState(request.path) → updateJobState(appendSynthesizedCommit) → updateJobState(branch)

同様に in-memory jobState への mirror なし。要件 1 の修正対象となる。

### 7. 受け入れ基準の検証可能性確認

全 8 基準を読んだ。

- 実 store + 実 git の統合テスト（手動 seed なし） → 技術的に実装可能
- pipeline に渡る state の synthesizedCommits を in-memory 経路で assert → reload 後の state を参照すれば達成可能
- runner.ts の手動 mirror 削除 + reload への置換 → 実装 scope 明確
- reviewers / noWorktree / issueNumber の保全テスト → seed 順序が保証するため達成可能
- reload 失敗の fail-closed テスト → store.load() が throw した場合の分岐が必要
- 破壊確認の記録 → テスト内 DESTROY コメントまたは sabotage テストとして記録
- 既存テスト無改変で green → 要件に明示
- typecheck && test が green → 標準的な検証基準

## 検証できなかった項目

None。

## Findings 詳細

### F-001 [low] workspace-materializer.ts の行番号 minor inaccuracy

request.md の「`src/core/runtime/workspace-materializer.ts:112-116`」が参照する行は `resume-recreated` / `resume-without-recorded-worktree` case（seed + updateJobState(worktreePath) のみ）。request が説明している full sequence（seed → updateJobState(worktreePath / request.path / appendSynthesizedCommit / branch)）は `new-run` case（lines 154-256）にある。行番号の誤差であり、根本原因診断・修正方針・受け入れ基準への影響なし。implementer は new-run arm（lines 154-256）を修正対象として読むこと。

### F-002 [info] TC-002 の test file 帰属

request が TC-002 を `bootstrap-egress-ledger-wm.test.ts` に帰属させているように読めるが、TC-002 は `tests/unit/core/runtime/bootstrap-egress-ledger-local.test.ts` に存在する。`wm.test.ts` は TC-001 / R2 / TC-004 を収容。既存テスト参照時に混乱しないよう implementer は実ファイルを確認すること。診断への影響なし。
