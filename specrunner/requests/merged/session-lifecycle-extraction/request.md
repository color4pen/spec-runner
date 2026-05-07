# run / resume のコマンド実行基盤をポリモーフィズムで統合する

## Meta

- **type**: refactoring
- **slug**: session-lifecycle-extraction

## 背景

`config.runtime` による if/else がコードベースに 4 箇所散在している：

| # | ファイル | 行 | 内容 |
|---|---------|-----|------|
| 1 | `src/cli/run.ts` | 181-185 | client 生成 |
| 2 | `src/cli/resume.ts` | 177-181 | client 生成（#1 と同一パターン） |
| 3 | `src/core/pipeline/run.ts` | 34-46 | `createStandardPipeline` 内の AgentRunner 生成 |
| 4 | `src/core/pipeline/run.ts` | 117-129 | `runProposePipeline` 内の AgentRunner 生成（#3 と同一パターン） |

さらに `run.ts`（363行）と `resume.ts`（341行）に以下の重複がある：

- **worktree ライフサイクル**: create → state 記録 → request.md コピー → git add → cleanup → signal handler（run: 100行、resume: 93行）
- **PipelineDeps の組み立て**: client, config, repo, request, slug, githubClient, cwd をほぼ同一の構造で構築
- **signal handler**: SIGINT/SIGTERM の登録・解除・cleanup が両方で個別実装
- **outputPipelineThrowError**: 同名関数が 2 ファイルで別実装

今後 `request-create` コマンドで対話式の agent query を追加すると、runtime 分岐が 5 箇所目に散らばる。関数抽出では分岐が呼び出し側に残る。ポリモーフィズムで分岐自体を消す。

### 注意: 用語の区別

- **session**: Claude Managed Agent API の session（`SessionClient` が管理する API リソース）。本 request では触れない
- **command**: specrunner の CLI コマンド実行単位（run / resume / request-create）。本 request の抽象化対象

### agent 実行の本質

pipeline step も対話 query も、本質的にやっていることは同じ「prompt を LLM に送って結果を受け取る」である。差異は：

- **pipeline step**: pipeline が orchestrate。result file をパース、verdict で分岐
- **dialog**: 単発の query。result file 不要、人間と対話

現在の `AgentRunner` は pipeline step 専用の `AgentRunContext`（step 定義、buildMessage、resultFilePath 等）を要求しており、dialog では不要な構造が多い。共通基盤は `RuntimeStrategy` が持つ「agent に prompt を投げる能力」であり、`AgentRunner` はその上に step 固有のラッパーを被せたもの。

## 目的

run / resume / 将来の request-create が共通基盤を使えるよう、ポリモーフィズムでコマンド実行基盤を統合する。振る舞いは変えない。

## 要件

### 1. RuntimeStrategy — local/managed の分岐を消す

runtime の差異をインターフェースで吸収し、if/else を消す。

```
RuntimeStrategy (interface)
├── LocalRuntime    — worktree 管理, Claude Code SDK query(), fs.readFile
└── ManagedRuntime  — worktree なし, SessionClient + Anthropic API, GitHub API
```

1. `src/core/runtime/strategy.ts` に `RuntimeStrategy` インターフェースを定義する
   - `query(prompt, opts): AsyncGenerator<Message>` — runtime 中立の agent 実行プリミティブ。local: Claude Code SDK `query()`。managed: session 作成 → SSE stream。pipeline step も dialog もこれを使う
   - `createAgentRunner(): AgentRunner` — `query()` を pipeline step 用にラップした `AgentRunner` を返す。`AgentRunContext` の組み立て、result file の取得、commit 検証等は `AgentRunner` adapter の責務。`createStandardPipeline` と `runProposePipeline` 内の runtime 分岐もこれで解消する
   - `setupWorkspace(slug, jobId, opts): Promise<WorkspaceContext>` — local: worktree 作成 + request.md コピー + git add。managed: cwd をそのまま返す。opts に `existingWorktreePath?: string` を含める（resume の reuse/recreate 判定用）
   - `buildDeps(config, repo, request, slug, workspace): PipelineDeps` — runtime 固有の deps を組み立てる
   - `registerCleanup(jobId, startStep): CleanupHandle` — local: signal handler + failure cleanup を登録。managed: no-op。`CleanupHandle` は opaque type とし、呼び出し側は内部構造を知らない
   - `teardown(handle, finalStatus): Promise<void>` — local: signal handler 解除 + worktree cleanup（status に応じて）。managed: no-op
2. `src/core/runtime/local.ts` に `LocalRuntime` を実装する（run.ts の worktree 関連コード + resume.ts の reuse/recreate 判定を移動。内部で既存の `WorktreeManager` を使用）
3. `src/core/runtime/managed.ts` に `ManagedRuntime` を実装する（setupWorkspace は cwd をそのまま返す薄い実装）
4. `src/core/runtime/factory.ts` に `createRuntime(config): RuntimeStrategy` ファクトリを置く。`config.runtime` による分岐はコードベース全体でこの 1 箇所のみ

### 2. CommandRunner — pipeline 実行コマンドの共通化

pipeline を実行するコマンド（run / resume）の共通骨格を Template Method で定義する。

```
CommandRunner (abstract class) — pipeline 実行コマンド用
├── PipelineRunCommand   — preflight → new job → full pipeline
└── ResumeCommand        — state resolve → safety check → partial pipeline
```

5. `src/core/command/runner.ts` に `CommandRunner` 抽象クラスを定義する
   - `execute(): Promise<number>` — テンプレートメソッド。骨格：
     1. `prepare()` — サブクラスが override（唯一の override ポイント）
     2. `runtime.setupWorkspace()` — RuntimeStrategy に委譲
     3. `runtime.buildDeps()` — RuntimeStrategy に委譲
     4. `runtime.registerCleanup()` — RuntimeStrategy に委譲
     5. `runPipeline()` — protected final。共通の pipeline 実行
     6. `handleResult()` — protected final。共通の post-pipeline 処理（既存の `handlePostPipelineState` + `outputPipelineThrowError` を統合）
     7. `runtime.teardown()` — RuntimeStrategy に委譲
   - `prepare(): Promise<PrepareResult>` — 唯一の抽象メソッド。`{ state: JobState, startStep: StepName, request: ParsedRequest, ... }` を返す
   - error handling: 各ステップの失敗を `execute()` 内で sequential に catch する。`prepare()` 以外は override 不可（protected non-abstract）にして分岐の増殖を防ぐ
6. `src/core/command/pipeline-run.ts` に `PipelineRunCommand` を実装する
   - `prepare()`: preflight → createJobState → return `{ state, startStep: "propose" }`
7. `src/core/command/resume.ts` に `ResumeCommand` を実装する
   - `prepare()`: state resolve → safety check → resolveResumeStep
   - `setupWorkspace` に `existingWorktreePath` を渡す

`CommandRunner` は pipeline 実行コマンド専用。将来の `request-create`（対話コマンド）は `CommandRunner` を継承せず、`RuntimeStrategy.query()` を直接使う。pipeline と dialog は骨格が異なるため、1 つの Template Method に押し込まない。共通部分は `RuntimeStrategy` に集約済み。

### 3. pipeline/run.ts の runtime 分岐解消

8. `createStandardPipeline` と `runProposePipeline` の AgentRunner 生成を `RuntimeStrategy.createAgentRunner()` に置き換える
9. `PipelineDeps` に `runner: AgentRunner` を追加するか、`createStandardPipeline` の引数に `runner` を渡す（どちらかは実装時に判断。PipelineDeps への追加が自然）
10. `runProposePipeline` が使用されていない場合は dead code として削除する

### 4. run.ts / resume.ts のスリム化

11. `run.ts` は `new PipelineRunCommand(createRuntime(config)).execute()` を呼ぶだけになる
12. `resume.ts` は `new ResumeCommand(createRuntime(config)).execute()` を呼ぶだけになる
13. `handlePostPipelineState`、`outputPipelineThrowError`、`parseSpecReviewFindingsSummary`、`outputSpecReviewVerdict` は `CommandRunner` の内部メソッドまたは共通ユーティリティに移動する
14. `EventBus` + `ProgressDisplay` の構築は `CommandRunner.execute()` 内で 1 回行う

## スコープ外

- DialogCommand / request-create の実装（`RuntimeStrategy.query()` を直接使う設計で対応可能であることを本 request で確認するが、実装は別 request）
- pipeline 内部のリファクタリング（step executor, transition table, Step 定義等）
- AgentRunner の port/adapter インターフェース変更（既存の `AgentRunner` interface はそのまま維持。`RuntimeStrategy.query()` は `AgentRunner` より下の層として新設）

## 受け入れ基準

- [ ] `config.runtime` による if/else がコードベース全体で `createRuntime` ファクトリの 1 箇所のみになっている
- [ ] `RuntimeStrategy` に `query()` プリミティブがあり、pipeline step（`AgentRunner` 経由）と将来の dialog（直接呼び出し）の両方から使える設計になっている
- [ ] `run.ts` と `resume.ts` がそれぞれ 50 行以下になっている（CommandRunner への委譲のみ）
- [ ] `LocalRuntime` が worktree の setup/cleanup/signal handler を一元管理している
- [ ] `ManagedRuntime` が worktree 関連の処理を一切含まない
- [ ] `createStandardPipeline` / `runProposePipeline` の runtime 分岐が解消されている
- [ ] `CleanupHandle` が opaque type であり、`CommandRunner` は内部構造にアクセスしない
- [ ] 振る舞いは変わらない（既存テストが全て pass）
- [ ] `bun run typecheck && bun run test` が green

## 補足

### module-architect 評価済みの設計判断

- `createStandardPipeline` 内の AgentRunner 生成分岐（`pipeline/run.ts:34-46`）と `runProposePipeline`（`pipeline/run.ts:117-129`）にも runtime if/else がある。`RuntimeStrategy.createAgentRunner()` で解消する
- Template Method の override ポイントは `prepare()` のみに限定。他のステップは protected non-abstract にして error handling の複雑化を防ぐ
- `CleanupHandle` は opaque type。`CommandRunner` は handle を `teardown()` に渡すだけで内部構造を知らない
- `runProposePipeline` は dead code の可能性あり。リファクタリング時に使用箇所を確認し、未使用なら削除する

### 層構造

```
CLI (run.ts / resume.ts)
  └── CommandRunner (pipeline 実行の Template Method)
        └── RuntimeStrategy (runtime 中立の共通基盤)
              ├── query()          ← agent 実行プリミティブ（pipeline / dialog 共通）
              ├── createAgentRunner() ← query() を pipeline step 用にラップ
              ├── setupWorkspace()
              ├── registerCleanup() / teardown()
              └── buildDeps()

将来の request-create:
  CLI (request-create.ts)
    └── RuntimeStrategy.query() を直接使用（CommandRunner を経由しない）
```
