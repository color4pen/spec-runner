# Design: Fix base branch hardcode

## 設計方針

request.md の Meta セクションに `base-branch` フィールドを必須化し、`ParsedRequest.baseBranch` を唯一の真実源として全消費者に伝搬する。ハードコードされた `"main"` / `"origin/main"` を全て動的参照に置換する。

**設計原則**:
1. **Single Source of Truth**: base branch は `ParsedRequest.baseBranch` のみから取得
2. **Fail Fast**: `base-branch` 未指定は parse 時点で `REQUEST_MD_INVALID` エラー
3. **既存インターフェース活用**: `WorkspaceOptions`, `FinishInput` に field 追加のみで新規型は作らない

## コンポーネント設計

### 1. ParsedRequest 拡張 (`src/parser/request-md.ts`)

```typescript
export interface ParsedRequest {
  type: string;
  title: string;
  slug: string;
  baseBranch: string;  // NEW: required
  content: string;
  enabled: string[];
  sections?: ParsedRequestSections;
}
```

`parseRequestMdContent()` に抽出ロジックを追加:
- パターン: `/^\s*-\s+\*\*base-branch\*\*:\s+(.+)$/`
- `type`, `slug` と同じ必須フィールドパターン — null なら `requestMdInvalidError` を throw

### 2. テンプレート拡張 (`src/core/command/request.ts`)

`buildScaffoldTemplate()` の Meta セクション出力:

```
## Meta

- **type**: ${type}
- **slug**: ${slug}
- **base-branch**: main
```

`base-branch` はデフォルト値 `main` で出力。`buildScaffoldTemplate` の params に `baseBranch` は追加しない（テンプレートは常に `main` で良い）。

### 3. DynamicContext 修正 (`src/git/dynamic-context.ts`)

```typescript
export async function collectDynamicContext(
  cwd: string,
  baseBranch: string,  // renamed from _branch, now actually used
): Promise<DynamicContext> {
  const [gitLogRaw, diffStatRaw, specsList, changesList] = await Promise.all([
    runGit(cwd, ["log", `${baseBranch}..HEAD`, "--oneline", "-n", "20"]),
    runGit(cwd, ["diff", `${baseBranch}..HEAD`, "--stat"]),
    collectSpecsList(cwd),
    collectChangesList(cwd),
  ]);
  // ...
}
```

JSDoc の `@param branch` も `@param baseBranch` に更新。
`DynamicContext` interface の JSDoc コメント（`main..HEAD`）も `{baseBranch}..HEAD` に更新。

### 4. CommandRunner 修正 (`src/core/command/runner.ts`)

```typescript
// Before:
deps.dynamicContext = await collectDynamicContext(
  workspace.cwd,
  jobState.branch ?? "main",
);

// After:
deps.dynamicContext = await collectDynamicContext(
  workspace.cwd,
  request.baseBranch,
);
```

### 5. WorkspaceOptions 拡張 (`src/core/runtime/strategy.ts`)

```typescript
export interface WorkspaceOptions {
  existingWorktreePath?: string | null;
  requestFilePath?: string;
  branchName?: string;
  requestType?: string;
  baseBranch?: string;  // NEW: for worktree base ref
}
```

### 6. LocalRuntime 修正 (`src/core/runtime/local.ts`)

`setupWorkspace()` 内の全 `"origin/main"` を `opts?.baseBranch` で動的化:

```typescript
const baseRef = opts?.baseBranch ? `origin/${opts.baseBranch}` : "origin/main";
```

フォールバック `"origin/main"` は resume path 向けの安全策。run path では `baseBranch` が必ず渡される。

behind 警告のメッセージも動的化:
```typescript
`Warning: local ${baseBranch} is ${behind} commit(s) behind origin/${baseBranch}. Worktree will be created from origin/${baseBranch}.\n`
```

### 7. PrCreateStep 修正 (`src/core/step/pr-create.ts`)

```typescript
// Before:
baseBranch: "main",

// After:
baseBranch: deps.request.baseBranch,
```

### 8. FinishInput 拡張 (`src/core/finish/orchestrator.ts`)

```typescript
export interface FinishInput {
  slug?: string;
  prNumber?: number;
  jobId?: string;
  baseBranch: string;  // NEW: required
  flags: FinishFlags;
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
  sleepFn?: (ms: number) => Promise<void>;
  worktreeManagerFn?: () => WorktreeManager;
}
```

orchestrator 内の3箇所:
- `currentBranch === "main"` → `currentBranch === input.baseBranch`
- `git checkout main` → `git checkout ${input.baseBranch}`
- `"onto main"` → `"onto ${input.baseBranch}"`

### 9. CLI finish 修正 (`src/cli/finish.ts`)

`runFinish()` で request.md をパースして `baseBranch` を取得:

```typescript
// slug が確定した後、request.md から baseBranch を取得
const requestMdPath = path.join(opts.cwd, "openspec", "changes", slug, "request.md");
let baseBranch = "main"; // fallback
try {
  const parsed = await parseRequestMd(requestMdPath);
  baseBranch = parsed.baseBranch;
} catch {
  // request.md が見つからない場合は "main" にフォールバック
}
```

**注意**: finish は slug が positional arg / PR reverse lookup / jobId のいずれかで解決される。slug 確定前に request.md をパースできないため、orchestrator 内部で slug が確定した後にパースするか、`FinishInput.baseBranch` を optional にしてフォールバックする設計も考えられる。

ここでは simplicity のため、`cli/finish.ts` で slug が渡された場合のみ request.md をパースし、slug 不明時は `"main"` フォールバックとする。orchestrator 内部で slug が解決された後に改めてパースすることも可能だが、orchestrator の責務を増やすのは避ける。

### 10. WorkspaceOptions への baseBranch 伝搬

`CommandRunner` の `execute()` 内で `workspaceOpts` に `baseBranch` を追加する。各コマンド（`PipelineRunCommand`, `ResumeCommand`）の `prepare()` で `workspaceOpts.baseBranch = request.baseBranch` を設定。

## データフロー

```
request.md: - **base-branch**: main
  ↓ parseRequestMdContent()
ParsedRequest { baseBranch: "main" }
  ↓
CommandRunner.execute()
  ├── workspaceOpts.baseBranch = request.baseBranch
  │   ↓ setupWorkspace(slug, jobId, opts)
  │   └── LocalRuntime: origin/${opts.baseBranch}
  │       ├── worktree create (run path)
  │       ├── worktree create (resume paths ×2)
  │       └── behind warning
  │
  ├── collectDynamicContext(cwd, request.baseBranch)
  │   ├── git log ${baseBranch}..HEAD
  │   └── git diff ${baseBranch}..HEAD
  │
  └── PrCreateStep.run()
      └── baseBranch: deps.request.baseBranch

cli/finish.ts
  ↓ parseRequestMd(requestMdPath)
  ↓ baseBranch = parsed.baseBranch
FinishInput { baseBranch }
  ↓ orchestrator
  ├── isOnMain: currentBranch === baseBranch
  ├── git checkout ${baseBranch}
  └── escalation: "onto ${baseBranch}"
```

## テスト影響

### 既存テストの fixture 更新

以下のテストで `ParsedRequest` fixture に `baseBranch: "main"` を追加する必要がある:
- `tests/parser.test.ts` — `parseRequestMdContent` の入力文字列に `- **base-branch**: main` 追加、戻り値の assertion 追加
- `tests/finish-orchestrator.test.ts` — `FinishInput` に `baseBranch: "main"` 追加
- `tests/git/dynamic-context.test.ts` — 影響なし（`collectDynamicContext` の第2引数は既にテストで渡している）
- `tests/unit/core/command/request.test.ts` — テンプレート出力の snapshot 更新
- `tests/cli-stdout-snapshot.test.ts` — テンプレート出力 snapshot 更新

### 新規テストケース

- `base-branch` 未指定の request.md → `REQUEST_MD_INVALID` エラー
- `base-branch: master` の request.md → `ParsedRequest.baseBranch === "master"`

## TODO(base-branch) マーカーの除去

修正完了後、以下の5箇所から TODO コメントを削除:
1. `src/core/worktree/manager.ts:65`
2. `src/core/runtime/local.ts:152`
3. `src/core/runtime/local.ts:166`
4. `src/core/runtime/local.ts:198`
5. `src/core/finish/orchestrator.ts:262`

加えて `src/core/pr-create/runner.ts:7` の Design D3 コメント（`base branch is "main" (fixed in initial version)`）も更新。
