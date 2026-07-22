# Cross-Boundary Invariants Review — permission-layer-git-write-denial（Iteration 2）

## 1. review-001 critical finding の修正確認

### 修正対象

review-001 で特定した「bootstrap commit OID が `synthesizedCommits` 台帳に記録されないため、初回 `runInlineEgressCheck` が `EGRESS_UNKNOWN_COMMIT` で halt する」問題。

### 確認結果：修正済み ✓

`src/core/runtime/local.ts`（+17 行）および `src/core/runtime/workspace-materializer.ts`（+19 行）の diff に、以下が追加されている：

```ts
const revParseResult = await this.spawnFn("git", ["rev-parse", "HEAD"], { cwd: ... });
const bootstrapOid = revParseResult.stdout.trim();
await this.updateJobState(jobId, (s) => appendSynthesizedCommit(s, bootstrapOid), slugOpts);
```

両ファイルとも `new-run` アーム内で bootstrap commit 直後に OID を補足し、`appendSynthesizedCommit` で台帳に記録する実装が復元されている。`runInlineEgressCheck`（`commit-push.ts`、無改変）が仮定する不変条件「`git rev-list HEAD --not --remotes=origin` の全 OID は `synthesizedCommits ∪ {newCommitOid}` に含まれる」は再び保たれる。

---

## 2. 新たな不変条件の検証

### 2-a. autoAllowBashIfSandboxed 変更と canUseTool 到達保証

`buildWorkspaceSandbox`（`agent-runner.ts`）の `autoAllowBashIfSandboxed` が `true`（main）→ `false`（本 branch）に変更された。
probe 観測 B の実測：`true` の場合、SDK は Bash tool call を `canUseTool` 呼び出し前に自動承認するため、guard の Bash 分類 deny が到達しない。`false` への変更により `canUseTool` が発火し、guard の deny 経路が有効になる。

TC-SB-02（`sandbox-scope.test.ts`）が `autoAllowBashIfSandboxed === false` かつ `allowedTools` に `"Bash"` を含まないことを固定している。この 2 条件が同時に崩れた場合にのみ deny 経路が無効化されるため、テストが 2 つの歯として機能している。✓

### 2-b. writeScope の production 生成サイト単一性

`AgentRunContext` の production 生成サイトは `src/core/step/executor.ts`（`buildStepContext` 呼び出し）のみ。`buildStepContext`（Step 7）が `writeScope` を unconditionally 設定するため、production 経路で `scope` が `undefined` になる経路は存在しない。guard は `scope` を optional として扱い（fallback: cwd 内 allow）、型安全かつ strictly-weaker フォールバックが成立している。✓

### 2-c. managedPaths の単一正典

`managedPaths` は `pipelineManagedPaths(slug)`（`round-git-scope.ts`、無改変）から計算され、guard 側（`buildStepContext` Step 7）と commit 層（`commit-push.ts`）の両方が同一関数を参照する。guard で allow された pipeline 管理パスを commit 層が拒否する逆転は生じない。✓

### 2-d. forbiddenPaths の単一正典

`forbiddenPaths = forbiddenWritePaths(step.name, slug, declaredWritePaths)`（`write-scope.ts`、無改変）。guard 側も commit 層も同一関数・同一引数で計算するため、guard の許可集合 ⊇ commit 層の許可集合 の関係が保たれる（guard が permit したものを commit 層が reject する経路はない）。✓

### 2-e. isJudgeArtifact の非対称（設計上のギャップ、非ブロッキング）

guard の guarded step 分岐は `managedPaths` / `.specrunner/` / `forbiddenPaths` のみを deny する。commit 層（`commit-push.ts`）の `findWriteScopeViolations` は追加で `isJudgeArtifact`（`*-result-NNN.md` / `review-feedback-*.md`）も deny する。

このため guarded step が `*-result-NNN.md` を書き込もうとした場合、guard では通過し commit 層で捕捉される経路が存在する。ただし、設計（D5）は permission 層を「多重防御の一層」として位置づけ、commit 層を wall として明示している。guard の non-admission は commit 層より upstream の防御であり、fail-open は意図的かつ文書化されている。新経路がこのギャップを拡大していないことも確認（旧実装でも guard に isJudgeArtifact 判定はなかった）。**非ブロッキング、設計通り。** ✓

### 2-f. Bash deny のスコープ独立性

guard の Bash 分岐は `classifyGitCommand(command).kind === "mutation"` で判定し、`scope` の有無に依存しない。`scope` が undefined でも `kind === "mutation"` なら deny される。write-scope threading と Bash git deny の安全性が独立していることを確認。✓

### 2-g. DSM closure（adapter → core 直接 import 禁止）

`pipelineManagedPaths` / `forbiddenWritePaths` の呼び出しは `buildStepContext`（core 層）で行い、結果を `AgentWriteScope` フィールドとして `AgentRunContext` 経由で渡す。`agent-runner.ts` はこれらを直接 import しない。`architecture/core-invariants.test.ts` の自動検証と一致する。✓

---

## 3. まとめ

review-001 の critical finding（bootstrap OID 台帳削除による `runInlineEgressCheck` 不変条件破壊）は `local.ts` および `workspace-materializer.ts` で修正されており、`runInlineEgressCheck` の前提が再び保たれることを確認した。

Iteration 2 の実装で新たな cross-boundary 不変条件違反は検出されなかった。隣接機構との相互作用（2-a〜2-g）はすべて前提が保たれている。
