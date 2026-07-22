# Cross-Boundary Invariants Review — permission-layer-git-write-denial（Iteration 3）

## 1. 前回 finding の最終確認

### 対象: bootstrap commit OID の synthesizedCommits 台帳記録（Iteration 1 critical finding）

Iteration 1 で報告した「bootstrap commit OID が `synthesizedCommits` に記録されないため、
`runInlineEgressCheck`（`commit-push.ts`、無改変）が `EGRESS_UNKNOWN_COMMIT` で halt する」問題。
Iteration 2 では `local.ts` / `workspace-materializer.ts` の修正を確認済み。

**Iteration 3 確認**: `managed.ts`（+16 行）の修正も確認した。

```ts
// src/core/runtime/managed.ts 行 244–257
// Capture bootstrap commit OID and record in synthesizedCommits ledger (fail-closed)
const revParseResult = await this.spawnFn("git", ["rev-parse", "HEAD"], { cwd: this.cwd });
if (revParseResult.exitCode !== 0) {
  throw new Error(`Failed to capture bootstrap commit OID: ${revParseResult.stderr.trim()}`);
}
const bootstrapOid = revParseResult.stdout.trim();
await this.updateJobState(jobId, (s) => appendSynthesizedCommit(s, bootstrapOid));
```

3 ファイル（`managed.ts`・`local.ts`・`workspace-materializer.ts`）すべてで同形の修正が入っており、
`runInlineEgressCheck` の不変条件「`git rev-list HEAD --not --remotes=origin` の全 OID は
`synthesizedCommits ∪ {newCommitOid}` に含まれる」は完全に復元されている。✓

---

## 2. Iteration 3 の新規変更に対する不変条件検証

### 2-a. no-worktree モードの bootstrap OID 記録（TC-NW-017）

`local.ts` の `setupWorkspaceNoWorktree`（no-worktree run path）にも同形の bootstrap OID 記録が追加されている（行 414–428）。

```ts
// src/core/runtime/local.ts 行 414–428
const revParseResult = await this.spawnFn("git", ["rev-parse", "HEAD"], { cwd: this.cwd });
if (revParseResult.exitCode !== 0) {
  throw new Error(`Failed to capture bootstrap commit OID: ...`);
}
const bootstrapOid = revParseResult.stdout.trim();
await this.updateJobState(jobId, (s) => appendSynthesizedCommit(s, bootstrapOid), slugOpts);
```

`tests/unit/no-worktree-mode.test.ts`（TC-NW-017）がこの経路を機械的に固定している：

- `expect(finalState?.synthesizedCommits).toContain(BOOTSTRAP_OID)` — OID が台帳に含まれることを確認
- `revParseExitCode=1` の失敗ケースで `"Failed to capture bootstrap commit OID"` が throw されることを確認

no-worktree モードでも push 前に bootstrap OID が台帳に記録されるため、
後続の `commitAndPush` で `runInlineEgressCheck` が `EGRESS_UNKNOWN_COMMIT` で halt しない。✓

### 2-b. CLI step と guard の完全な非干渉

`verification`・`pr-create`・`bite-evidence` は `kind: "cli"` であることを実装（executor.ts 行 250）と
テストで確認した。CLI step は `runAgentStep` を経由せず `buildStepContext` が呼ばれないため、
`AgentWriteScope` threading および `canUseTool` guard は一切介在しない。

- `verification`: `kind: "cli"` — ビルド/テスト/lint を pipeline が直接 spawn。guard 非発火。✓
- `pr-create`: `kind: "cli"` — GitHub API 呼び出しを pipeline が直接実行。guard 非発火。✓
- `bite-evidence`: `kind: "cli"` — OID 収集とレポート書込を pipeline が直接実行。guard 非発火。✓

これら CLI step の `writes()` 宣言（`pipelineManagedPaths` に含まれる `bite-evidence-result.md` 等）は
guard の deny 対象だが、CLI step は tool call 経由で書込しないため矛盾は生じない。✓

### 2-c. guarded step の declared/actual パス不一致（adr-gen）

`adr-gen` は guarded step で、`writes()` が `"specrunner/adr/<slug>.md"`（日付プレフィックスなし）を返すが、
agent が実際に書くのは `"specrunner/adr/YYYY-MM-DD-<slug>.md"`（日付プレフィックスあり）。

guard の guarded 分岐は `scope.forbiddenPaths`（= `protectedCanonPaths(slug) - declaredWritePaths`）のみを deny する。
`protectedCanonPaths` は `specrunner/changes/<slug>/` 配下の 6 パスのみを含み、`specrunner/adr/` は対象外。
したがって `specrunner/adr/YYYY-MM-DD-<slug>.md` は `forbiddenPaths` に含まれず、guard は allow する。✓

宣言パス `specrunner/adr/<slug>.md` と実際のパスとの不一致はコメントに明記されており（`verify: false`）、
scoped ではなく guarded モードを使うことで正しく機能するよう設計されている。✓

### 2-d. utility query（bypassPermissions）と sandbox 設定の完全な分離

`LocalRuntime.buildSdkOptions()`（`local.ts` 行 283–298）は `permissionMode: "bypassPermissions"` を使用し、
`sandbox` フィールドを含まない。`buildWorkspaceSandbox`（`autoAllowBashIfSandboxed: false`）は
`ClaudeCodeRunner.run()` 内の `queryOptions` にのみ組み込まれる。

utility query（`query-one-shot.ts` / readiness probe）は `buildSdkOptions` を使用するため、
`autoAllowBashIfSandboxed: false` の影響を受けない。両経路の分離は完全。✓

### 2-e. カスタムレビューアー step の scoped mode での動作

`createCustomReviewerStep` は `writes()` で `customReviewerResultPath(deps.slug, snapshot.name, iteration)` を宣言する。
`stagingModeFor("cross-boundary-invariants")` = `"scoped"`（GUARDED_WRITE_STEPS に非含有）。

guard の scoped 分岐は宣言パス（例: `specrunner/changes/<slug>/cross-boundary-invariants-result-003.md`）への
Write のみを allow し、それ以外を deny する。

本レビュー自体がこのカスタムレビューアー経路で実行されており、結果ファイルへの Write のみが許可されている。✓

---

## 3. Iteration 3 での追加確認（全 15 items）

| No | 確認内容 | 結果 |
|----|---------|------|
| 1 | `managed.ts` bootstrap OID 記録（行 244–257） | ✓ |
| 2 | `local.ts` no-worktree bootstrap OID 記録（行 414–428） | ✓ |
| 3 | `workspace-materializer.ts` new-run bootstrap OID 記録（行 226–242） | ✓ |
| 4 | TC-NW-017 テストが synthesizedCommits に OID を含むことを固定 | ✓ |
| 5 | TC-NW-017 revParse 失敗ケースで fail-closed（throw） | ✓ |
| 6 | `verification` が `kind: "cli"` — guard 非干渉 | ✓ |
| 7 | `pr-create` が `kind: "cli"` — guard 非干渉 | ✓ |
| 8 | `bite-evidence` が `kind: "cli"` — guard 非干渉 | ✓ |
| 9 | `adr-gen` guarded mode での `specrunner/adr/` パス → forbiddenPaths 外 | ✓ |
| 10 | utility query の `buildSdkOptions` に sandbox 非含有 | ✓ |
| 11 | カスタムレビューアー `writes()` が動的 path を正しく返す | ✓ |
| 12 | `regression-gate` step が `writes()` でリザルトパスを宣言 | ✓ |
| 13 | pipelineManagedPaths が全 3 ファイルで同一関数参照 | ✓ |
| 14 | no-worktree で sidecar（`.specrunner/local/`）は pipeline が直接書込（guard 非経由） | ✓ |
| 15 | resume-recreated / resume-without-recorded-worktree arm に bootstrap commit なし（OID 記録不要） | ✓ |

---

## 4. まとめ

Iteration 3 の調査で、既報 finding の修正完了（bootstrap OID が 3 ファイル全てで記録）を確認し、
新たな cross-boundary 不変条件違反は検出されなかった。

`runInlineEgressCheck` の不変条件は完全に復元されており、no-worktree モードを含む全実行経路で保たれている。
CLI step 分離・utility query 分離・guarded step の path 不一致・カスタムレビューアーの scoped 動作はすべて
設計の意図通りに機能している。
