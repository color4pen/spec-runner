# Tasks: Session Lifecycle Extraction

## Phase 1: RuntimeStrategy インターフェースと実装

### Task 1.1: RuntimeStrategy インターフェース定義
- **file**: `src/core/runtime/strategy.ts` (新規)
- **action**: `RuntimeStrategy` インターフェースと supporting types（`QueryOptions`, `WorkspaceOptions`, `WorkspaceContext`, `CleanupHandle`）を定義
- **details**:
  - `query(prompt, opts): AsyncGenerator<Message>` — agent 実行プリミティブ
  - `createAgentRunner(): AgentRunner` — pipeline step 用ラッパー
  - `setupWorkspace(slug, jobId, opts?): Promise<WorkspaceContext>` — workspace 準備
  - `buildDeps(config, repo, request, slug, workspace): PipelineDeps` — deps 組み立て
  - `registerCleanup(jobId, startStep): CleanupHandle` — cleanup 登録
  - `teardown(handle, finalStatus): Promise<void>` — cleanup 実行
  - `CleanupHandle` は opaque type（branded type pattern）
- **test**: 型定義のみ。テスト不要

### Task 1.2: LocalRuntime 実装
- **file**: `src/core/runtime/local.ts` (新規)
- **action**: `RuntimeStrategy` を実装する `LocalRuntime` クラスを作成
- **details**:
  - constructor: `(cwd: string, githubClient: GitHubClient, manager?: WorktreeManager)`
  - `query()`: Claude Code SDK `query()` のラップ。`src/adapter/claude-code/agent-runner.ts` の `ClaudeCodeRunnerDeps._queryFn` と同等の構成
  - `createAgentRunner()`: `createClaudeCodeRunner({ cwd: this.workspace.cwd })` を返す。workspace 設定前は `this.cwd` を使用
  - `setupWorkspace()`:
    - `opts.existingWorktreePath` がある場合: fs.access で存在確認 → reuse / recreate 判定（`resume.ts` L201-251 のロジックを移動）
    - ない場合: `manager.create()` → request.md コピー → `git add` → state 記録（`run.ts` L223-252 のロジックを移動）
    - `WorkspaceContext { cwd, worktreePath }` を返す
  - `buildDeps()`: `{ client: undefined, config, repo, request, slug, githubClient, cwd: workspace.cwd, runner: this.createAgentRunner() }`
  - `registerCleanup()`:
    - `cleanupWorktreeOnFailure` クロージャを構築（`run.ts` L259-272 のロジック）
    - SIGINT/SIGTERM signal handler を登録（`run.ts` L275-293 のロジック）
    - handler 参照を `CleanupHandle` に格納して返す
  - `teardown()`: signal handler 解除 + `finalStatus` が success 以外なら worktree cleanup
- **test**: `tests/unit/core/runtime/local.test.ts` — setupWorkspace（create/reuse/recreate）、registerCleanup/teardown、buildDeps の検証。既存の `run-worktree-git-staging.test.ts` と `run-worktree-signal.test.ts` のロジックを参考にする

### Task 1.3: ManagedRuntime 実装
- **file**: `src/core/runtime/managed.ts` (新規)
- **action**: `RuntimeStrategy` を実装する `ManagedRuntime` クラスを作成
- **details**:
  - constructor: `(cwd: string, sessionClient: SessionClient, githubClient: GitHubClient, repo: OriginInfo)`
  - `query()`: SessionClient 経由の SSE stream（将来用。最小実装で良い）
  - `createAgentRunner()`: `createManagedAgentRunner({ sessionClient, githubClient, repo })` を返す
  - `setupWorkspace()`: `{ cwd: this.cwd }` を返す（no-op）
  - `buildDeps()`: `{ client: sessionClient, config, repo, request, slug, githubClient, cwd: workspace.cwd, runner: this.createAgentRunner() }`
  - `registerCleanup()`: 空の `CleanupHandle` を返す（no-op）
  - `teardown()`: no-op
- **test**: `tests/unit/core/runtime/managed.test.ts` — setupWorkspace が cwd をそのまま返すこと、createAgentRunner が ManagedAgentRunner を返すこと

### Task 1.4: RuntimeStrategy ファクトリ
- **file**: `src/core/runtime/factory.ts` (新規)
- **action**: `createRuntime(config, cwd, githubClient, repo): RuntimeStrategy` ファクトリ関数
- **details**:
  - `config.runtime === "local"` → `new LocalRuntime(cwd, githubClient)`
  - else → `createAnthropicClient` → `createAnthropicSessionClient` → `new ManagedRuntime(cwd, sessionClient, githubClient, repo)`
  - **`config.runtime` 分岐はコードベース全体でこの 1 箇所のみ**
- **file**: `src/core/runtime/index.ts` (新規) — barrel export
- **test**: `tests/unit/core/runtime/factory.test.ts` — config.runtime の値に応じて正しい型が返ること

## Phase 2: PipelineDeps 拡張と pipeline/run.ts の分岐解消

### Task 2.1: PipelineDeps に runner フィールド追加
- **file**: `src/core/types.ts` (変更)
- **action**: `PipelineDeps` に `runner: AgentRunner` フィールドを追加
- **details**:
  - `runner: AgentRunner` — `createStandardPipeline` と `runProposePipeline` が使用
  - import `AgentRunner` from `./port/agent-runner.js`
- **test**: 型変更のみ。既存テストのコンパイルで検証

### Task 2.2: createStandardPipeline の runtime 分岐解消
- **file**: `src/core/pipeline/run.ts` (変更)
- **action**: `createStandardPipeline` 内の runtime 分岐（L34-46）を `deps.runner` に置き換え
- **details**:
  - Before: `if (deps.config.runtime === "local") { ... } else { ... }`
  - After: `const runner = deps.runner;` + null guard（`if (!runner) throw ...`）
  - `deps.client` の直接参照も不要になる（managed runtime の場合、buildDeps が client を設定済み）
  - import 文の整理: `createManagedAgentRunner` と `createClaudeCodeRunner` の import を削除
- **test**: 既存の `tests/unit/core/pipeline/run.test.ts` が pass すること（deps に runner を追加）

### Task 2.3: runProposePipeline の runtime 分岐解消
- **file**: `src/core/pipeline/run.ts` (変更)
- **action**: `runProposePipeline` 内の runtime 分岐（L116-129）を `deps.runner` に置き換え
- **details**: Task 2.2 と同じパターン
- **test**: `tests/pipeline.test.ts` の TC-035〜TC-042 が pass すること（deps に runner を追加）

### Task 2.4: runPipeline の簡素化
- **file**: `src/core/pipeline/run.ts` (変更)
- **action**: `runPipeline` 内の重複した EventBus 生成を整理
- **details**: `createStandardPipeline` に events を渡すだけの thin wrapper を維持。runtime 分岐コメントを削除
- **test**: 既存テストが pass すること

## Phase 3: CommandRunner と具象コマンド

### Task 3.1: CommandRunner 抽象クラス
- **file**: `src/core/command/runner.ts` (新規)
- **action**: pipeline 実行コマンドの Template Method を定義
- **details**:
  - `execute(): Promise<number>` — テンプレートメソッド
    1. `prepare()` → `PrepareResult`
    2. `runtime.setupWorkspace()` → `WorkspaceContext`
    3. `runtime.buildDeps()` → `PipelineDeps`
    4. `runtime.registerCleanup()` → `CleanupHandle`
    5. `runPipeline()` — EventBus + createStandardPipeline + pipeline.run()
    6. `handleResult()` — `handlePostPipelineState` 相当のロジック
    7. `runtime.teardown()`
  - `prepare(): Promise<PrepareResult>` — 唯一の抽象メソッド
  - `handleResult()` 内に `handlePostPipelineState` + `outputPipelineThrowError` + `outputSpecReviewVerdict` + `parseSpecReviewFindingsSummary` を統合（`run.ts` からの移動）
  - error handling: pipeline throw は catch → `outputPipelineThrowError` → cleanup → return 1
- **file**: `src/core/command/index.ts` (新規) — barrel export
- **test**: `tests/unit/core/command/runner.test.ts` — mock RuntimeStrategy で execute() のフロー検証

### Task 3.2: PrepareResult 型定義
- **file**: `src/core/command/runner.ts` に含める
- **action**: `PrepareResult` インターフェースを定義
- **details**:
  ```
  PrepareResult {
    jobState: JobState
    startStep: StepName
    request: ParsedRequest
    config: SpecRunnerConfig
    repo: OriginInfo
    slug: string
    verbose: boolean
    workspaceOpts: WorkspaceOptions
  }
  ```

### Task 3.3: PipelineRunCommand 実装
- **file**: `src/core/command/pipeline-run.ts` (新規)
- **action**: `CommandRunner` を継承した run コマンド用クラス
- **details**:
  - constructor: `(runtime, requestMdPath, options: { cwd?, verbose? })`
  - `prepare()`:
    1. `setVerbose()`
    2. `runPreflight(absolutePath, cwd)` → `{ config, repo, request }`
    3. slug 導出（canonical path detection）
    4. `createJobState(...)` → jobState
    5. return PrepareResult with `startStep: "propose"`, `workspaceOpts: { requestFilePath }`
  - error handling: preflight 失敗時の stderr 出力 + return from prepare
- **test**: `tests/unit/core/command/pipeline-run.test.ts` — preflight 成功/失敗、job 作成の検証

### Task 3.4: ResumeCommand 実装
- **file**: `src/core/command/resume.ts` (新規)
- **action**: `CommandRunner` を継承した resume コマンド用クラス
- **details**:
  - constructor: `(runtime, slug, options: ResumeOptions)`
  - `prepare()`:
    1. `setVerbose()`
    2. `resolveJobStateBySlug(slug)` → state
    3. Status gate（running / not awaiting-resume）
    4. Safety checks（consecutive escalations, stale state）
    5. `resolveResumeStep(options.from, resumePoint, fallbackStep)` → startStep
    6. `parseRequestMd(state.request.path)` → request
    7. `loadConfig()` → config
    8. State preparation（status: "running"）
    9. return PrepareResult with `workspaceOpts: { existingWorktreePath }`
  - exit code: prepare 失敗時は 1 or 2（argument error）
- **test**: `tests/unit/core/command/resume.test.ts` — status gate、safety check、resume step 解決の検証

## Phase 4: CLI エントリポイントのスリム化

### Task 4.1: run.ts のスリム化
- **file**: `src/cli/run.ts` (変更)
- **action**: `runRunCore` を `createRuntime` → `new PipelineRunCommand(runtime).execute()` に置き換え
- **details**:
  - `handlePostPipelineState`, `outputPipelineThrowError`, `parseSpecReviewFindingsSummary`, `outputSpecReviewVerdict` を削除（CommandRunner に移動済み）
  - `runRunCore` は preflight → createRuntime → PipelineRunCommand.execute() の 3 行
  - `runRun` は従来通り process.exit()
  - **目標: 50 行以下**
- **test**: 既存の `tests/cli-run-verdict.test.ts`, `tests/unit/cli/run-worktree-git-staging.test.ts`, `tests/unit/cli/run-worktree-signal.test.ts` が pass すること

### Task 4.2: resume.ts のスリム化
- **file**: `src/cli/resume.ts` (変更)
- **action**: `runResumeCore` を `createRuntime` → `new ResumeCommand(runtime).execute()` に置き換え
- **details**:
  - `outputPipelineThrowError` を削除（CommandRunner に移動済み）
  - `handlePostPipelineState` の import を削除
  - `runResumeCore` は loadConfig → createRuntime → ResumeCommand.execute() の数行
  - **目標: 50 行以下**
- **test**: 既存の `tests/unit/cli/resume.test.ts`, `tests/unit/cli/specrunner-resume-dispatch.test.ts` が pass すること

### Task 4.3: 既存テストの修正
- **files**: 影響を受ける全テストファイル
- **action**: PipelineDeps に `runner` フィールドを追加するなど、型変更に伴うテスト修正
- **details**:
  - `tests/unit/core/pipeline/run.test.ts` — deps に mock runner を追加
  - `tests/pipeline.test.ts` — deps に mock runner を追加
  - `tests/pipeline-integration.test.ts` — deps に mock runner を追加
  - `tests/cli-run-verdict.test.ts` — import パスの変更があれば修正
  - `tests/unit/cli/resume.test.ts` — import パスの変更があれば修正
  - その他、`config.runtime` を直接参照しているテストの修正
- **test**: `bun run typecheck && bun run test` が全て green

## Phase 5: 検証

### Task 5.1: 全体検証
- **action**: `bun run typecheck && bun run test` を実行し、全テスト pass を確認
- **acceptance**:
  - `config.runtime` の if/else が `src/core/runtime/factory.ts` の 1 箇所のみ（`src/config/` 内のスキーマ定義・migration は除く）
  - `run.ts` が 50 行以下
  - `resume.ts` が 50 行以下
  - `pipeline/run.ts` に runtime 分岐なし
  - 全テスト pass

## Dependency Graph

```
Phase 1 (RuntimeStrategy)
  ├── Task 1.1 (interface)
  ├── Task 1.2 (LocalRuntime)  ← depends on 1.1
  ├── Task 1.3 (ManagedRuntime) ← depends on 1.1
  └── Task 1.4 (factory)        ← depends on 1.2, 1.3

Phase 2 (pipeline 分岐解消)  ← depends on Phase 1
  ├── Task 2.1 (PipelineDeps)
  ├── Task 2.2 (createStandardPipeline) ← depends on 2.1
  ├── Task 2.3 (runProposePipeline)     ← depends on 2.1
  └── Task 2.4 (runPipeline)            ← depends on 2.2

Phase 3 (CommandRunner)  ← depends on Phase 1, Phase 2
  ├── Task 3.1 (CommandRunner abstract)
  ├── Task 3.2 (PrepareResult)          ← depends on 3.1
  ├── Task 3.3 (PipelineRunCommand)     ← depends on 3.1
  └── Task 3.4 (ResumeCommand)          ← depends on 3.1

Phase 4 (CLI スリム化)  ← depends on Phase 3
  ├── Task 4.1 (run.ts)
  ├── Task 4.2 (resume.ts)
  └── Task 4.3 (テスト修正)  ← depends on 4.1, 4.2

Phase 5 (検証)  ← depends on Phase 4
  └── Task 5.1 (全体検証)
```

## Notes

- `rm.ts` の `config.runtime` 分岐（session terminate 判定）は本 request のスコープ外。rm は pipeline 実行コマンドではなく、CommandRunner を使わない
- `handlePostPipelineState` は現在 `run.ts` から export されており `resume.ts` が import している。CommandRunner 内部メソッドへの移動で export を廃止する
- `runProposePipeline` のテスト（pipeline.test.ts TC-035〜TC-042）では deps に mock runner を設定する必要がある。テスト側の修正が必要
