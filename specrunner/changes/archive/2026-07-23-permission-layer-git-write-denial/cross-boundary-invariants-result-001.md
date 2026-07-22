# Cross-Boundary Invariants Review — permission-layer-git-write-denial

## 1. Critical Finding: bootstrap 台帳削除による egress チェック不変条件の破壊

### 対象コード（変更されていない側）

`src/core/step/commit-push.ts` の `runInlineEgressCheck`（行 352–385）が保持する不変条件：

> **「`git rev-list HEAD --not --remotes=origin` が返す全 OID は `synthesizedCommits ∪ {newCommitOid}` の集合（ledger）に含まれなければならない。含まれない OID が 1 つでもあれば `EGRESS_UNKNOWN_COMMIT` で halt する。」**

この関数は無改変だが、diff が ledger の前提を破る経路を作っている。

### diff が導入した変更

`src/core/runtime/local.ts`、`src/core/runtime/managed.ts`、`src/core/runtime/workspace-materializer.ts` の 3 ファイルから、bootstrap commit OID を `synthesizedCommits` 台帳に記録するコードが削除された。

```diff
-      // Capture bootstrap commit OID and record in synthesizedCommits ledger (fail-closed)
-      const revParseResult = await this.spawnFn("git", ["rev-parse", "HEAD"], { cwd: this.cwd });
-      ...
-      const bootstrapOid = revParseResult.stdout.trim();
-      await this.updateJobState(jobId, (s) => appendSynthesizedCommit(s, bootstrapOid), slugOpts);
```

### 破れる具体的な実行列

1. `LocalRuntime.materializeWorkspace()`（または managed / workspace-materializer 相当）が `git commit -m "add request.md for <slug>"` で bootstrap commit を作成する
2. この時点では `git push` は *まだ行われていない*（worktree 初期化フローの通常順序）
3. bootstrap commit OID は `state.synthesizedCommits` に記録されない（削除されたコードが担っていた）
4. 第 1 ステップ（例: `design`）の agent が実行され、`commit-push.ts` が呼び出される
5. `runInlineEgressCheck(infra.spawnFn, cwd, branch, state.synthesizedCommits ?? [])` — `state.synthesizedCommits` は `[]` または bootstrap OID を含まない配列
6. ledger = `{<design-step-OID>}`（`synthesizedCommits` が空なら design commit のみ）
7. `git rev-list HEAD --not --remotes=origin` が返す OID: `[<bootstrap-OID>, <design-step-OID>]`
8. `<bootstrap-OID>` が ledger に存在しない → `EGRESS_UNKNOWN_COMMIT` で halt

### 歴史的文脈

この削除されたコードは PR #895「bootstrap の materialization commit を egress 台帳に記録し、初回 push の誤 halt を解消する」で追加されたものである。本 diff はその修正を 3 ファイル合計で 52 行削除することで実質的に revert している。既存テストは bootstrap OID が台帳にない経路を踏まない（`synthesizedCommits` を stub として渡すため）ので green のまま通る。

---

## 2. 確認済みの不変条件（問題なし）

以下は全経路を走査し、隣接機構の前提が保たれることを確認した。

### 2-a. DSM closure：adapter → core/pipeline 直接 import 禁止

`createWorkspaceToolGuard` が `managedPaths` / `forbiddenPaths` を必要とするにもかかわらず、`agent-runner.ts` から `round-git-scope.ts` / `write-scope.ts` を直接 import していない。`buildStepContext`（core 層）で pre-compute した値を `AgentWriteScope` フィールド経由で渡す設計。`architecture/core-invariants.test.ts` の自動検証と一致する。✓

### 2-b. writeScope が常に設定される（生成サイト保証）

`AgentRunContext` の唯一の production 生成サイトは `src/core/step/executor.ts` の `buildStepContext` 呼び出し（行 313）のみ。`buildStepContext` は `writeScope` を unconditionally 設定する（行 179）。`AgentRunContext` を直接 literal 構築するのはテストのみ（`writeScope` 省略でも optional なので型は通る）。guard の `scope` が `undefined` になる経路は production には存在しない。✓

### 2-c. Bash git deny がスコープ依存しない

`createWorkspaceToolGuard` の Bash 分岐は `scope` の有無に関わらず常に `classifyGitCommand` を呼び出す（scope is undefined でもガード適用）。guard を呼ぶのは `buildStepContext` 経由なので scope は実際には常に設定されているが、Bash git deny の安全性が scope threading に依存していないことを確認。✓

### 2-d. guard の path 計算と commit 層の path 計算の一貫性

`declaredWritePaths` の計算式：
- guard 側（`buildStepContext` step 7）: `(step.writes?.(state, deps) ?? []).filter((r) => r.artifact !== "gitState").map((r) => r.path)`
- commit 層（`commit-push.ts` 行 449–450）: 同一式

両者は同じ state と deps を参照するため「guard が許可したパスを commit 層が拒否する」逆転は生じない。✓

### 2-e. 全 step の writes() と guard ルールの整合

| step | stagingMode | declaredWritePaths（抜粋） | guard 挙動 |
|------|------------|--------------------------|-----------|
| design | scoped | [design.md, tasks.md, spec.md] | 宣言パスのみ allow ✓ |
| spec-review | scoped | [result-NNN.md, attestation] | 宣言パスのみ allow ✓ |
| test-case-gen | scoped | [test-cases.md] | 宣言パスのみ allow ✓ |
| implementer | guarded | [tasks.md]（gitState 除外後） | forbiddenPaths 以外 allow ✓ |
| build-fixer | guarded | []（gitState のみ → 除外後 空） | 全 protectedCanon deny ✓ |
| code-fixer | guarded | [tasks.md] | tasks.md を forbiddenPaths から除外 ✓ |
| test-materialize | guarded | []（gitState のみ → 除外後 空） | 全 protectedCanon deny ✓ |
| adr-gen | guarded | [specrunner/adr/<slug>.md] | dynamic filename は forbiddenPaths 外 ✓ |

### 2-f. query-one-shot は guard 対象外（意図的）

`src/adapter/claude-code/query-one-shot.ts` は `permissionMode: "bypassPermissions"` を使用し `canUseTool` が発火しない。この utility query は agent step ではないため、`AgentWriteScope` threading の対象外である。`allowedTools` に Bash を含んでいるが bypassPermissions 下では guard を通らないため、本変更とは無関係。✓

### 2-g. .specrunner vs specrunner の区別

guard の `.specrunner/` deny は `resolve(cwd, ".specrunner/")` に対して正規化パスを前方一致する。`specrunner/changes/<slug>/...`（先頭ドットなし）は合致しない。state ファイル等の実際のパス（`.specrunner/local/...`）のみが deny される。✓

---

## 3. まとめ

「変更されていないコードの不変条件を新経路が破る」具体的なシナリオを 1 件特定した（§1）。他の隣接機構との相互作用（§2-a〜g）は全経路で前提が保たれることを確認した。
