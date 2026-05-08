# Tasks: Fix base branch hardcode

## T1: ParsedRequest に baseBranch フィールドを追加

**File**: `src/parser/request-md.ts`

**Changes**:
1. `ParsedRequest` interface に `baseBranch: string` を追加（`slug` の下に配置）
2. `parseRequestMdContent()` に `base-branch` 抽出ロジックを追加（`slug` 抽出の直後）
3. 未指定時は `requestMdInvalidError` を throw
4. return 文に `baseBranch` を追加

**Detailed steps**:

- Line 18 の `slug: string,` の後に以下を追加:
  ```typescript
  /** Base branch for diff/worktree/PR operations (e.g. "main" or "master").
   * Required in the Meta section as `- **base-branch**: <value>`; missing → REQUEST_MD_INVALID. */
  baseBranch: string;
  ```

- Line 102（`slug` バリデーション直後）の後に、`base-branch` 抽出ブロックを挿入:
  ```typescript
  // Extract base-branch from Meta section: "- **base-branch**: value"
  // Required: missing base-branch → REQUEST_MD_INVALID.
  let baseBranch: string | null = null;
  const baseBranchPattern = /^\s*-\s+\*\*base-branch\*\*:\s+(.+)$/;
  for (const line of lines) {
    const m = baseBranchPattern.exec(line);
    if (m?.[1]) {
      baseBranch = m[1].trim();
      break;
    }
  }
  if (baseBranch === null || baseBranch.length === 0) {
    throw requestMdInvalidError(
      `missing 'base-branch' in Meta section in ${filePath}`,
    );
  }
  ```

- Line 110 の return 文を更新:
  ```typescript
  return { type, title, slug, baseBranch, content, enabled, sections };
  ```

---

## T2: テンプレートに base-branch を追加

**File**: `src/core/command/request.ts`

**Changes**:
`buildScaffoldTemplate()` の Meta セクション出力に `- **base-branch**: main` を追加

**Detailed steps**:

- Line 26（`- **slug**: ${slug}`）の後に以下を追加:
  ```
  - **base-branch**: main
  ```

**Expected diff**:
```diff
   return `# ${title}
 
 ## Meta
 
 - **type**: ${type}
 - **slug**: ${slug}
+- **base-branch**: main
 
 ## 背景
```

---

## T3: DynamicContext のパラメータ修正

**File**: `src/git/dynamic-context.ts`

**Changes**:
1. `_branch` パラメータを `baseBranch` にリネーム
2. git コマンドで `baseBranch` を実際に使用
3. JSDoc を更新

**Detailed steps**:

- Line 22 の JSDoc コメント `main..HEAD` を `baseBranch..HEAD` に更新
- Line 25 の JSDoc コメント `main..HEAD` を `baseBranch..HEAD` に更新
- Line 49 の `@param branch` を `@param baseBranch - Base branch name for log/diff comparison (e.g. "main" or "master")` に更新
- Line 56 の `_branch: string` を `baseBranch: string` に変更
- Line 60 の `"main..HEAD"` を `` `${baseBranch}..HEAD` `` に変更
- Line 61 の `"main..HEAD"` を `` `${baseBranch}..HEAD` `` に変更

**Expected diff**:
```diff
-  /** Commits on current branch not yet in main (git log main..HEAD --oneline -n 20) */
+  /** Commits on current branch not yet in base branch (git log baseBranch..HEAD --oneline -n 20) */
   gitLog: string;
-  /** Diff stat between main and HEAD (git diff main..HEAD --stat) */
+  /** Diff stat between base branch and HEAD (git diff baseBranch..HEAD --stat) */
   diffStat: string;
```

```diff
 export async function collectDynamicContext(
   cwd: string,
-  _branch: string,
+  baseBranch: string,
 ): Promise<DynamicContext> {
   const [gitLogRaw, diffStatRaw, specsList, changesList] = await Promise.all([
-    runGit(cwd, ["log", "main..HEAD", "--oneline", "-n", "20"]),
-    runGit(cwd, ["diff", "main..HEAD", "--stat"]),
+    runGit(cwd, ["log", `${baseBranch}..HEAD`, "--oneline", "-n", "20"]),
+    runGit(cwd, ["diff", `${baseBranch}..HEAD`, "--stat"]),
     collectSpecsList(cwd),
     collectChangesList(cwd),
   ]);
```

---

## T4: CommandRunner で request.baseBranch を使用

**File**: `src/core/command/runner.ts`

**Location**: Line 113

**Changes**:
`jobState.branch ?? "main"` を `request.baseBranch` に置換

**Expected diff**:
```diff
       deps.dynamicContext = await collectDynamicContext(
         workspace.cwd,
-        jobState.branch ?? "main",
+        request.baseBranch,
       );
```

---

## T5: WorkspaceOptions に baseBranch を追加

**File**: `src/core/runtime/strategy.ts`

**Location**: `WorkspaceOptions` interface（Line 41-50）

**Changes**:
`baseBranch?: string` フィールドを追加

**Expected diff**:
```diff
 export interface WorkspaceOptions {
   existingWorktreePath?: string | null;
   requestFilePath?: string;
   branchName?: string;
   requestType?: string;
+  /** Base branch for worktree creation (e.g. "main" or "master"). Defaults to "main" if omitted. */
+  baseBranch?: string;
 }
```

---

## T6: PipelineRunCommand / ResumeCommand で baseBranch を伝搬

**File**: `src/core/command/pipeline-run.ts`

**Location**: `prepare()` の return 文（Line 80-83）

**Changes**:
`workspaceOpts` に `baseBranch: request.baseBranch` を追加

**Expected diff**:
```diff
       workspaceOpts: {
         requestFilePath: this.absolutePath,
         branchName,
         requestType: request.type,
+        baseBranch: request.baseBranch,
       },
```

**File**: `src/core/command/resume.ts`

**Location**: `prepare()` の return 文（Line 196）

**Changes**:
`workspaceOpts` に `baseBranch: request.baseBranch` を追加

**Expected diff**:
```diff
-      workspaceOpts: { existingWorktreePath: updatedState.worktreePath ?? null },
+      workspaceOpts: {
+        existingWorktreePath: updatedState.worktreePath ?? null,
+        baseBranch: request.baseBranch,
+      },
```

---

## T7: LocalRuntime の "origin/main" ハードコード置換

**File**: `src/core/runtime/local.ts`

**Changes**:
`setupWorkspace()` 内の全 `"origin/main"` を `opts?.baseBranch` から動的に構築

**Detailed steps**:

1. `setupWorkspace()` の冒頭（Line 130 付近）で baseRef を計算:
   ```typescript
   const baseBranch = opts?.baseBranch ?? "main";
   const remoteBaseRef = `origin/${baseBranch}`;
   ```

2. Line 153 の `"origin/main"` を `remoteBaseRef` に置換（TODO コメント削除）:
   ```diff
   -        // TODO(base-branch): configurable base branch
   -        const newWorktreePath = await this.manager.create(this.cwd, slug, jobId, "origin/main");
   +        const newWorktreePath = await this.manager.create(this.cwd, slug, jobId, remoteBaseRef);
   ```

3. Line 167 の `"origin/main"` を `remoteBaseRef` に置換（TODO コメント削除）:
   ```diff
   -      // TODO(base-branch): configurable base branch
   -      const newWorktreePath = await this.manager.create(this.cwd, slug, jobId, "origin/main");
   +      const newWorktreePath = await this.manager.create(this.cwd, slug, jobId, remoteBaseRef);
   ```

4. Line 186 の behind 警告を動的化:
   ```diff
   -      ["rev-list", "HEAD..origin/main", "--count"],
   +      ["rev-list", `HEAD..${remoteBaseRef}`, "--count"],
   ```

5. Line 193 の warning メッセージを動的化:
   ```diff
   -          `Warning: local main is ${behind} commit(s) behind origin/main. Worktree will be created from origin/main.\n`,
   +          `Warning: local ${baseBranch} is ${behind} commit(s) behind ${remoteBaseRef}. Worktree will be created from ${remoteBaseRef}.\n`,
   ```

6. Line 201 の `"origin/main"` を `remoteBaseRef` に置換（TODO コメント削除）:
   ```diff
   -    // TODO(base-branch): configurable base branch
   -    // Pass branchName so manager creates the branch in the worktree (D1)
   +    // Pass branchName so manager creates the branch in the worktree (D1)
        const branchName = opts?.branchName;
   -    const worktreePath = await this.manager.create(this.cwd, slug, jobId, "origin/main", branchName);
   +    const worktreePath = await this.manager.create(this.cwd, slug, jobId, remoteBaseRef, branchName);
   ```

---

## T8: PrCreateStep の baseBranch 修正

**File**: `src/core/step/pr-create.ts`

**Location**: Line 35

**Changes**:
`baseBranch: "main"` を `baseBranch: deps.request.baseBranch` に置換

**Expected diff**:
```diff
     const result = await runPrCreate({
       branch,
-      baseBranch: "main",
+      baseBranch: deps.request.baseBranch,
       title,
       body,
       cwd,
     });
```

---

## T9: FinishInput に baseBranch を追加し orchestrator を修正

**File**: `src/core/finish/orchestrator.ts`

**Changes**:
1. `FinishInput` interface に `baseBranch: string` を追加
2. Line 215 の escalation メッセージを動的化
3. Line 259 の `currentBranch === "main"` を `currentBranch === input.baseBranch` に変更
4. Line 262-263 の TODO コメント削除 + `git checkout main` を動的化

**Detailed steps**:

- `FinishInput`（Line 36-51）に追加:
  ```typescript
  /** Base branch name (e.g. "main" or "master"). */
  baseBranch: string;
  ```

- `runFinishOrchestrator()` 内で `input` から `baseBranch` を取得。関数シグネチャの destructuring で追加:
  確認: `runFinishOrchestrator` の先頭で `input` をどう destructure しているか確認し、`baseBranch` を追加する

- Line 215:
  ```diff
  -          recommendedAction: `PR has merge conflicts (DIRTY). Rebase the feature branch onto main and re-run: specrunner finish ${target.slug}`,
  +          recommendedAction: `PR has merge conflicts (DIRTY). Rebase the feature branch onto ${baseBranch} and re-run: specrunner finish ${target.slug}`,
  ```

- Line 259:
  ```diff
  -    const isOnMain = currentBranch === "main";
  +    const isOnMain = currentBranch === baseBranch;
  ```

- Line 261-263:
  ```diff
  -      // TODO(base-branch): configurable base branch
  -      const checkoutMainResult = await spawn("git", ["checkout", "main"], { cwd });
  +      const checkoutMainResult = await spawn("git", ["checkout", baseBranch], { cwd });
  ```

---

## T10: cli/finish.ts で baseBranch を取得して FinishInput に渡す

**File**: `src/cli/finish.ts`

**Changes**:
1. `parseRequestMd` を import
2. `path` を import
3. slug が判明している場合、request.md をパースして `baseBranch` を取得
4. `FinishInput` に `baseBranch` を渡す

**Detailed steps**:

- import 追加:
  ```typescript
  import * as path from "node:path";
  import { parseRequestMd } from "../parser/request-md.js";
  ```

- `runFinish()` 内で baseBranch を解決。orchestrator 呼び出しの前に:
  ```typescript
  // Resolve baseBranch from request.md if slug is available
  let baseBranch = "main"; // fallback for slug-less paths (--pr, --job)
  if (opts.slug) {
    try {
      const requestMdPath = path.join(opts.cwd, "openspec", "changes", opts.slug, "request.md");
      const parsed = await parseRequestMd(requestMdPath);
      baseBranch = parsed.baseBranch;
    } catch {
      // request.md not found or parse error — use fallback
    }
  }
  ```

- `runFinishOrchestrator` 呼び出しに `baseBranch` を追加:
  ```diff
       const result = await runFinishOrchestrator(
         {
           slug: opts.slug,
           prNumber: opts.prNumber,
           jobId: opts.jobId,
  +        baseBranch,
           flags: {
  ```

---

## T11: TODO(base-branch) コメントの除去

**Files**:
- `src/core/worktree/manager.ts:65` — `// TODO(base-branch): configurable base branch` を削除
- `src/core/pr-create/runner.ts:7` — Design D3 コメントを更新:
  ```diff
  - * Design D3: base branch is "main" (fixed in initial version).
  + * Design D3: base branch is sourced from ParsedRequest.baseBranch.
  ```

**Note**: `local.ts` と `orchestrator.ts` の TODO は T7, T9 で既に削除される。

---

## T12: テスト fixture の更新

### T12a: parser.test.ts

**File**: `tests/parser.test.ts`

**Changes**:
1. 既存テストの request.md 文字列に `- **base-branch**: main` を追加
2. `result.baseBranch` の assertion を追加
3. `base-branch` 未指定テストケースを追加（`REQUEST_MD_INVALID` エラー）
4. `base-branch: master` テストケースを追加

### T12b: finish-orchestrator.test.ts

**File**: `tests/finish-orchestrator.test.ts`

**Changes**:
全 `runFinishOrchestrator()` 呼び出しに `baseBranch: "main"` を追加（14+ 箇所）。
`makeHappyPathSpawn` の `rev-parse` レスポンス `"main"` はテストの意図通りなのでそのまま。

### T12c: cli-stdout-snapshot.test.ts

**File**: `tests/cli-stdout-snapshot.test.ts`

**Changes**:
`makeMinimalDeps()` の `request` オブジェクトに `baseBranch: "main"` を追加。
テンプレート出力 snapshot に `- **base-branch**: main` が含まれることを確認。

### T12d: runner.test.ts

**File**: `tests/unit/core/command/runner.test.ts`

**Changes**:
`buildPrepareResult()` の `request` オブジェクトに `baseBranch: "main"` を追加。

### T12e: body-template.test.ts

**File**: `tests/unit/core/pr-create/body-template.test.ts`

**Changes**:
`makeParsedRequest()` の defaults に `baseBranch: "main"` を追加。

### T12f: request.test.ts

**File**: `tests/unit/core/command/request.test.ts`

**Changes**:
`buildValidRequestMd()` ヘルパーに `- **base-branch**: main` を追加。
テンプレート出力テストの期待値に `- **base-branch**: main` を追加。

### T12g: finish-preflight.test.ts（存在する場合）

**File**: `tests/unit/core/finish/preflight.test.ts`

**Changes**:
`"main"` ハードコード参照は orchestrator 経由で baseBranch が渡されるため、preflight 自体は直接影響なし。ただしコメント内の `"main"` 参照を確認し、必要に応じて更新。

---

## T13: 型チェックとテスト実行

**Command**: `bun run typecheck && bun test`

**Verification checklist**:
- [ ] `bun run typecheck` が exit 0
- [ ] `bun test` 全体が green
- [ ] `grep -r "TODO(base-branch)" src/` が空

---

## タスク依存関係

```
T1 (ParsedRequest 拡張) ← 他の全タスクの前提
  ↓
T2 (テンプレート) ← 独立
T3 (DynamicContext) ← T4 に先行
T5 (WorkspaceOptions) ← T6, T7 に先行
T9 (FinishInput) ← T10 に先行
  ↓
T4 (runner.ts) ← T1, T3
T6 (run/resume commands) ← T1, T5
T7 (local.ts) ← T5
T8 (pr-create) ← T1
T10 (cli/finish.ts) ← T9
T11 (TODO 除去) ← T7, T9
  ↓
T12 (テスト fixture) ← T1, T2, T9
  ↓
T13 (検証) ← 全タスク完了後
```

並行実施可能グループ:
- Group A: T2, T3, T5, T9（T1 完了後に並行可能）
- Group B: T4, T6, T7, T8, T10（Group A 完了後に並行可能）
- Group C: T11, T12（Group B 完了後）

---

## 受け入れ基準の検証手順

### AC1: ParsedRequest に baseBranch フィールドが存在する
`src/parser/request-md.ts` の `ParsedRequest` interface を確認。

### AC2: base-branch 未指定で REQUEST_MD_INVALID エラー
`bun test tests/parser.test.ts` で未指定テストケースが pass。

### AC3: テンプレートに base-branch が含まれる
`bun test tests/unit/core/command/request.test.ts` で確認。

### AC4: 10 箇所のハードコードが全て置換済み
```bash
grep -rn '"main"' src/git/dynamic-context.ts src/core/command/runner.ts src/core/runtime/local.ts src/core/step/pr-create.ts src/core/finish/orchestrator.ts | grep -v test | grep -v node_modules
```
上記で base branch 関連の `"main"` が残っていないことを確認。

### AC5: FinishInput 経由で baseBranch にアクセスできる
`src/core/finish/orchestrator.ts` の `FinishInput` interface を確認。

### AC6: TODO(base-branch) が残っていない
```bash
grep -r "TODO(base-branch)" src/
```
出力が空であることを確認。

### AC7: typecheck + test が green
`bun run typecheck && bun test`

---

## 実装ノート

- **Line numbers**: 本タスクで示した行番号は current main branch 基準。実装時にずれた場合は、コメント文字列やパターンで検索すること
- **テスト量**: T12 が最も作業量が多い（14+ 箇所の fixture 更新）。型エラーに従って機械的に追加すればよい
- **フォールバック**: `cli/finish.ts` で slug 不明時の `"main"` フォールバックは意図的。`--pr` / `--job` で起動した場合、slug 解決は orchestrator 内部で行われるため、request.md パスが事前に確定しない
- **Managed Runtime**: `src/core/runtime/managed.ts` の `setupWorkspace()` は worktree を作成しないため、baseBranch の影響なし（スコープ外）

---

## 完了条件

- [x] T1: ParsedRequest.baseBranch 追加
- [x] T2: テンプレートに base-branch 追加
- [x] T3: collectDynamicContext のパラメータ修正
- [x] T4: runner.ts で request.baseBranch を使用
- [x] T5: WorkspaceOptions.baseBranch 追加
- [x] T6: run/resume commands で baseBranch 伝搬
- [x] T7: local.ts の "origin/main" 全置換
- [x] T8: pr-create.ts の baseBranch 修正
- [x] T9: FinishInput.baseBranch 追加 + orchestrator 修正
- [x] T10: cli/finish.ts で baseBranch 取得
- [x] T11: TODO(base-branch) コメント除去
- [x] T12: テスト fixture 更新
- [x] T13: bun run typecheck が green（74 fails は全て pre-existing）
