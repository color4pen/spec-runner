# Design: Session Lifecycle Extraction

## Architecture Overview

```
CLI (run.ts / resume.ts)          ← 50行以下。CommandRunner に委譲するだけ
  └── CommandRunner (abstract)    ← pipeline 実行の Template Method
        ├── PipelineRunCommand    ← prepare(): preflight → createJobState
        └── ResumeCommand         ← prepare(): resolveJob → safety check → resolveStep
        │
        └── RuntimeStrategy       ← runtime 中立の共通基盤（DI で注入）
              ├── LocalRuntime    ← worktree, ClaudeCodeRunner, signal handler
              └── ManagedRuntime  ← SessionClient, ManagedAgentRunner, no-op workspace
```

## D1: RuntimeStrategy Interface

### Location

`src/core/runtime/strategy.ts`

### Interface Definition

```typescript
interface RuntimeStrategy {
  // Agent 実行プリミティブ。pipeline step（AgentRunner 経由）と将来の dialog（直接）の両方から使える
  query(prompt: string, opts: QueryOptions): AsyncGenerator<Message>;

  // query() を pipeline step 用にラップした AgentRunner を返す
  createAgentRunner(): AgentRunner;

  // local: worktree 作成 + request.md コピー + git add
  // managed: cwd をそのまま返す
  setupWorkspace(slug: string, jobId: string, opts?: WorkspaceOptions): Promise<WorkspaceContext>;

  // runtime 固有の PipelineDeps を組み立てる
  buildDeps(config: SpecRunnerConfig, repo: OriginInfo, request: ParsedRequest, slug: string, workspace: WorkspaceContext): PipelineDeps;

  // local: signal handler + failure cleanup を登録。managed: no-op
  registerCleanup(jobId: string, startStep: StepName): CleanupHandle;

  // local: signal handler 解除 + worktree cleanup。managed: no-op
  teardown(handle: CleanupHandle, finalStatus: string): Promise<void>;
}
```

### Supporting Types

```typescript
interface QueryOptions {
  cwd?: string;
  maxTurns?: number;
  systemPrompt?: string;
}

interface WorkspaceOptions {
  existingWorktreePath?: string | null;  // resume の reuse/recreate 判定用
  requestFilePath?: string;              // run 時の request.md パス
}

interface WorkspaceContext {
  cwd: string;              // pipeline が使う作業ディレクトリ
  worktreePath?: string;    // local のみ。state 記録用
}

// Opaque type — CommandRunner は内部構造にアクセスしない
type CleanupHandle = { readonly __brand: unique symbol } & Record<string, unknown>;
```

### Rationale

- `query()` は agent 実行の最小プリミティブ。pipeline step も将来の dialog もこれを使う
- `createAgentRunner()` は `query()` を pipeline step 用の `AgentRunContext` ラッパーで包む
- `setupWorkspace` は worktree ライフサイクルの create 側を抽象化
- `registerCleanup` / `teardown` は worktree ライフサイクルの cleanup 側を抽象化
- `CleanupHandle` を opaque にすることで、`CommandRunner` が cleanup 内部構造に依存しない

## D2: LocalRuntime

### Location

`src/core/runtime/local.ts`

### Responsibilities

1. **query()**: Claude Code SDK の `query()` をラップ。`ClaudeCodeRunnerDeps` と同等の構成
2. **createAgentRunner()**: `createClaudeCodeRunner({ cwd })` を呼ぶ
3. **setupWorkspace()**: `WorktreeManager.create()` → request.md コピー → `git add` → state 記録。`opts.existingWorktreePath` がある場合は reuse/recreate 判定（resume.ts L201-251 のロジックを移動）
4. **buildDeps()**: `{ client: undefined, config, repo, request, slug, githubClient, cwd: workspace.cwd }`
5. **registerCleanup()**: `cleanupWorktreeOnFailure` + signal handler（SIGINT/SIGTERM）を登録。`CleanupHandle` に handler 参照を格納
6. **teardown()**: signal handler 解除 + status に応じた worktree cleanup

### Constructor

```typescript
class LocalRuntime implements RuntimeStrategy {
  constructor(
    private readonly cwd: string,
    private readonly githubClient: GitHubClient,
    private readonly manager?: WorktreeManager,  // DI for testing
  )
}
```

## D3: ManagedRuntime

### Location

`src/core/runtime/managed.ts`

### Responsibilities

1. **query()**: SessionClient + Anthropic API を使った SSE stream
2. **createAgentRunner()**: `createManagedAgentRunner({ sessionClient, githubClient, repo })` を呼ぶ
3. **setupWorkspace()**: `{ cwd: this.cwd }` をそのまま返す
4. **buildDeps()**: `{ client: sessionClient, config, repo, request, slug, githubClient, cwd: workspace.cwd }`
5. **registerCleanup()**: no-op。空の `CleanupHandle` を返す
6. **teardown()**: no-op

### Constructor

```typescript
class ManagedRuntime implements RuntimeStrategy {
  constructor(
    private readonly cwd: string,
    private readonly sessionClient: SessionClient,
    private readonly githubClient: GitHubClient,
    private readonly repo: OriginInfo,
  )
}
```

## D4: Factory

### Location

`src/core/runtime/factory.ts`

### Implementation

```typescript
function createRuntime(config: SpecRunnerConfig, cwd: string, githubClient: GitHubClient, repo: OriginInfo): RuntimeStrategy {
  if (config.runtime === "local") {
    return new LocalRuntime(cwd, githubClient);
  }
  const anthropicClient = createAnthropicClient(config.anthropic.apiKey);
  const sessionClient = createAnthropicSessionClient(anthropicClient);
  return new ManagedRuntime(cwd, sessionClient, githubClient, repo);
}
```

**`config.runtime` 分岐はコードベース全体でこの 1 箇所のみ。**

## D5: CommandRunner (Template Method)

### Location

`src/core/command/runner.ts`

### Template Method

```typescript
abstract class CommandRunner {
  constructor(protected readonly runtime: RuntimeStrategy) {}

  async execute(): Promise<number> {
    // 1. prepare() — サブクラスが override（唯一の override ポイント）
    const prepared = await this.prepare();

    // 2. setupWorkspace — RuntimeStrategy に委譲
    const workspace = await this.runtime.setupWorkspace(...);

    // 3. buildDeps — RuntimeStrategy に委譲
    const deps = this.runtime.buildDeps(...);

    // 4. registerCleanup — RuntimeStrategy に委譲
    const handle = this.runtime.registerCleanup(...);

    // 5. runPipeline — protected final
    const finalState = await this.runPipeline(prepared, deps);

    // 6. handleResult — protected final
    const exitCode = await this.handleResult(finalState, ...);

    // 7. teardown — RuntimeStrategy に委譲
    await this.runtime.teardown(handle, finalState.status);

    return exitCode;
  }

  protected abstract prepare(): Promise<PrepareResult>;
}
```

### PrepareResult

```typescript
interface PrepareResult {
  jobState: JobState;
  startStep: StepName;
  request: ParsedRequest;
  config: SpecRunnerConfig;
  repo: OriginInfo;
  slug: string;
  events: EventBus;
  workspaceOpts: WorkspaceOptions;
}
```

### Error Handling

`execute()` 内で各ステップの失敗を sequential に catch。`prepare()` 失敗は即 return 1。pipeline 実行失敗は `outputPipelineThrowError` → cleanup → return 1。

## D6: PipelineRunCommand

### Location

`src/core/command/pipeline-run.ts`

### prepare() Implementation

1. `runPreflight(absolutePath, cwd)` — fail-fast チェック
2. `createJobState(...)` — 新規 job 作成
3. return `{ jobState, startStep: "propose", ... workspaceOpts: { requestFilePath: absolutePath } }`

## D7: ResumeCommand

### Location

`src/core/command/resume.ts`

### prepare() Implementation

1. `resolveJobStateBySlug(slug)` — job 解決
2. Status gate（running / not awaiting-resume）
3. Safety checks（consecutive escalations, stale state）
4. `resolveResumeStep(...)` — 再開 step 解決
5. `parseRequestMd(state.request.path)` — request.md パース
6. State preparation（status: "running"）
7. return `{ jobState, startStep, ... workspaceOpts: { existingWorktreePath: state.worktreePath } }`

## D8: pipeline/run.ts の runtime 分岐解消

`createStandardPipeline` と `runProposePipeline` の AgentRunner 生成を変更：

```typescript
// Before:
let runner: AgentRunner;
if (deps.config.runtime === "local") {
  runner = createClaudeCodeRunner({ cwd: deps.cwd });
} else {
  runner = createManagedAgentRunner({ ... });
}

// After:
// PipelineDeps に runner を追加
const runner = deps.runner;  // CommandRunner が buildDeps() で注入済み
```

`PipelineDeps` に `runner: AgentRunner` を追加する。`createStandardPipeline` は `deps.runner` を直接使い、runtime 分岐を持たない。

## D9: runProposePipeline の扱い

`runProposePipeline` はテストコードで 8 箇所使用されている（pipeline.test.ts）。dead code ではないため削除しない。ただし内部の runtime 分岐は `deps.runner` 経由で解消する。

## Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | `prepare()` のみ override 可 | override ポイントを絞り、error handling の複雑化を防ぐ |
| 2 | `CleanupHandle` は opaque type | `CommandRunner` が cleanup 内部構造に依存しない |
| 3 | `PipelineDeps` に `runner` 追加 | `createStandardPipeline` が runtime 分岐を持たなくなる |
| 4 | `runProposePipeline` は保持 | テスト 8 件で使用。runtime 分岐のみ解消 |
| 5 | `CommandRunner` は pipeline 実行専用 | 将来の dialog コマンドは `RuntimeStrategy.query()` を直接使う |
| 6 | factory に repo を渡す | ManagedRuntime の AgentRunner 生成に必要 |
