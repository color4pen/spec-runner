# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. Git依存性の現状確認（コードアサーション照合）

`src/core/worktree/manager.ts:106-188`（`WorktreeManager.create`）  
→ `git worktree add`, `git worktree remove --force`, `git worktree prune` を直接 spawn。リクエストの主張と一致。

`src/core/runtime/local.ts:350-477`（`setupWorkspaceNoWorktree`）  
→ `--no-worktree` モードでも `git status --porcelain`, `git checkout -b`, `git add`, `git commit`, `git rev-parse HEAD` を呼ぶ。  
リクエストが「`--no-worktree` は Git 非依存ではない」と述べていることを確認。**正確**。

`src/core/runtime/local.ts:924-943`（`listChangedFiles`）  
→ `git diff --name-only <baseBranch>...HEAD` を使用。changed-files 導出が Git に依存。

`src/core/runtime/local.ts:686-694`（`captureHeadSha`）  
→ `git rev-parse HEAD` を使用。revision identity が commit OID 依存。

`src/core/runtime/local.ts:1399-1429`（`validateStepInputs`）  
→ `artifact: "gitState"` 型が存在し、`git rev-parse --git-dir` で validate。

`src/core/runtime/local.ts:837-882`（`commitFinalState`）  
→ branch-borne state、push、`synthesizedCommits` ledger はすべて Git 依存。

### 2. preflight / capability gate の現状確認

`src/core/pipeline/runtime-capability-gate.ts:72-88`  
→ `assertRuntimeSupportsScope()` が既存の capability gate パターン。  
→ `canDeriveChangedFiles()` を判定する narrow capability interface を持ち、実行前に能力不足で throw する仕組みが実証済み。  
リクエストが「profile capabilityとして実行前に判定する」と述べている設計が、既存パターンで裏付けられている。

### 3. 既存プロファイル概念の確認

`src/state/profile.ts`  
→ 既存の profile（"standard"）は pipeline assurance（testDerivation / specReview level）を表す。実行隔離の runtime profile ではない。  
artifact-output profile は別次元の新設概念として整合性がある。

`src/core/runtime/workspace-materializer.ts:30-47`（`WorktreeMaterializationPlan`）  
→ 現在の materialization plan には `artifact-output` 相当の variant がなく、すべて Git worktree 前提。新規実装が必要な領域。

### 4. `--source <dir>` フラグの現状確認

`src/cli/flag-parser.ts`, `src/cli/job-start-handler.ts`, `src/cli/command-registry.ts` を確認。  
→ `--source` フラグは実装されていない（Grep で確認）。  
リクエストが「この指定方法自体が本 Issue の設計対象に含まれる」と明示していることは**正確**。

### 5. `--from-issue` / `--issue` の確認

`src/cli/job-start-handler.ts:97-103`  
→ `--from-issue` は既存の issue 連携パス。リクエストが「preflight で明示的 unsupported とする」と述べていることは対応可能な設計。

### 6. request.md フォーマット・内容品質の確認

- `type: new-feature`, `adr: true` → 設計判断を伴う新機能として適切
- Acceptance Criteria は明確かつ機械的に検証可能
- Stop Conditions は実装判断の安全弁として機能する
- Non-goals が具体的で「何をしないか」が明確
- 最小実測スコープが fixture ベースに限定されており、過剰な first-iteration スコープになっていない
- 「Gitの再実装」「隠れた一時repositoryの作成」などの anti-pattern が Non-goals に列挙されている

## 検証できなかった項目

- `src/core/step/commit-push.ts` 内部の詳細（commitAndPush 実装）: リクエストの主張に影響する新情報は期待されないため省略
- `specrunner init` が生成する `.gitignore` の内容: Git profile 維持に関係するが、artifact-output profile の設計に直接影響しない

## Findings 詳細

指摘事項なし。

---

**確認したコード上の主要アサーション（attestation 対象）**

| アサーション | 検証結果 |
|-------------|---------|
| `--no-worktree` も git コマンドを呼ぶ（`local.ts:setupWorkspaceNoWorktree`） | CONFIRMED |
| `WorktreeManager.create` は `git worktree add` を spawn（`manager.ts:121`） | CONFIRMED |
| `listChangedFiles` は `git diff --name-only` を使用（`local.ts:927`） | CONFIRMED |
| `captureHeadSha` は `git rev-parse HEAD` を使用（`local.ts:688`） | CONFIRMED |
| capability gate パターンが既存（`runtime-capability-gate.ts:72`） | CONFIRMED |
| `--source <dir>` フラグは現時点で未実装 | CONFIRMED |
| 既存 profile は pipeline assurance であり runtime isolation とは別次元（`profile.ts`） | CONFIRMED |
