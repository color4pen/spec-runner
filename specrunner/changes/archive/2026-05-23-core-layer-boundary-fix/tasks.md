# Tasks: core-layer-boundary-fix

## Task 1: OneShotQueryClient port の新設 (D2)

`src/core/port/one-shot-query-client.ts` を新規作成する。

- [x] `OneShotQueryOptions` interface を定義（systemPrompt, prompt, allowedTools?, maxTurns?, timeoutMs?, cwd?, stepName?, model?）
- [x] `OneShotQueryResult` interface を定義（text, sessionId?, turnCount?, stopReason?）
- [x] `OneShotQueryClient` interface を定義（`run(opts: OneShotQueryOptions): Promise<OneShotQueryResult>`）
- [x] `src/core/port/index.ts` に re-export を追加

**型は既存 `QueryOneShotOptions` / `QueryOneShotResult` と同一形状にする。ただし `config` 引数は interface に含めない（adapter 実装の内部詳細）。**

## Task 2: ClaudeCodeOneShotQueryClient 実装 (D3)

`src/adapter/claude-code/one-shot-query-client.ts` を新規作成する。

- [x] `ClaudeCodeOneShotQueryClient` class を実装（`implements OneShotQueryClient`）
- [x] constructor で `SpecRunnerConfig` を受け取り保持
- [x] `run()` で既存 `queryOneShot()` に委譲（opts を `QueryOneShotOptions` に変換して渡す）
- [x] `queryOneShot()` 関数自体は変更しない（adapter 内に存続）

## Task 3: reviewer.ts の port 依存化 (D4)

`src/core/request/reviewer.ts` を修正する。

- [x] `import { queryOneShot, type QueryFn } from "../../adapter/claude-code/query-one-shot.js"` を削除
- [x] `import type { OneShotQueryClient } from "../port/one-shot-query-client.js"` を追加
- [x] `runReview` signature を変更: `(content, config, cwd, queryFn?)` -> `(content, cwd, client: OneShotQueryClient)`
  - `config` 引数を削除（client が内部に保持するため不要）
  - `queryFn` optional 引数を削除、`client` を必須に
- [x] 本体: `queryOneShot(opts, config, queryFn)` -> `client.run(opts)`

## Task 4: manager.ts の port 依存化 (D4)

`src/core/request/manager.ts` を修正する。

- [x] `import { query } from "@anthropic-ai/claude-agent-sdk"` を削除
- [x] `import { type QueryFn } from "../../adapter/claude-code/query-one-shot.js"` を削除
- [x] `import type { OneShotQueryClient } from "../port/one-shot-query-client.js"` を追加
- [x] `create()` signature: `(text, cwd, config, queryFn?)` -> `(text, cwd, client: OneShotQueryClient)`
  - `queryFn ?? query` default を削除
  - `generator.generate(text, cwd, config, queryFn ?? query)` -> `generator.generate(text, cwd, client)`
- [x] `review()` signature: `(slugOrPath, cwd, config, queryFn?)` -> `(slugOrPath, cwd, client: OneShotQueryClient)`
  - `queryFn ?? (query as unknown as QueryFn)` default を削除
  - `reviewer.runReview(content, config, cwd, queryFn ?? ...)` -> `reviewer.runReview(content, cwd, client)`

## Task 5: generator.ts の port 依存化 (D4)

`src/core/request/generator.ts` を修正する。

- [x] `import { query, type SDKMessage, type SDKResultMessage, type SDKResultSuccess } from "@anthropic-ai/claude-agent-sdk"` を削除
- [x] `import type { OneShotQueryClient } from "../port/one-shot-query-client.js"` を追加
- [x] `generate()` signature: `(text, cwd, config, queryFn: typeof query = query)` -> `(text, cwd, client: OneShotQueryClient)`
  - `config` 引数を削除（client 経由で解決されるため）
  - default `= query` を削除
- [x] 本体: inline の `getStepExecutionConfig` / `AbortController` / `for await` loop / success 判定を `client.run(opts)` 呼び出しに置換
  - `run()` に渡す opts: `{ systemPrompt: REQUEST_GENERATE_SYSTEM_PROMPT, prompt: buildGeneratePrompt(text), allowedTools: [], maxTurns, timeoutMs, cwd, stepName: "request-generate", model: "claude-opus-4-5" }`
  - `client.run()` が throw した場合は既存エラーコードに変換（`GENERATE_SESSION_FAILED`）
- [x] `getStepExecutionConfig` import を削除（config 解決は adapter 側の責務になった）

**注意**: generator.ts は現在 `queryFn` の stream を直接消費しており、SDK 固有型 (`SDKMessage`, `SDKResultMessage`, `SDKResultSuccess`) に依存している。port 化により `client.run()` が `OneShotQueryResult` を返す形に変わるため、stream 処理を丸ごと削除する。ただし `slug` の placeholder 置換 (`<generated-slug>` -> slug) と `parseRequestMdContent` validation は `generate()` 側に残す。

## Task 6: composition point の確立 (D4)

### 6a (revised): executeReview に client 引数を追加

- [x] `executeReview(filePath, opts)` -> `executeReview(filePath, opts, client: OneShotQueryClient)`
- [x] adapter import を追加しない（client は caller から受け取る）
- [x] cli 側の呼び出し元で `new ClaudeCodeOneShotQueryClient(config)` を生成して渡す

### 6b (revised): executeCreate に client 引数を追加

- [x] `executeCreate(text, opts)` -> `executeCreate(text, opts, client: OneShotQueryClient)`
- [x] adapter import を追加しない（client は caller から受け取る）
- [x] cli 側の呼び出し元で `new ClaudeCodeOneShotQueryClient(config)` を生成して渡す

### 6c: cli 側の呼び出し元を更新

cli から `executeReview` / `executeCreate` を呼んでいる箇所を探し、`ClaudeCodeOneShotQueryClient` を生成して渡す。

- [x] `executeReview` の呼び出し元で `loadConfig()` を呼び、`new ClaudeCodeOneShotQueryClient(config)` を生成して注入
- [x] `executeCreate` の呼び出し元で `loadConfig()` を呼び、`new ClaudeCodeOneShotQueryClient(config)` を生成して注入
- [x] `executeReview` / `executeCreate` の内部から `loadConfig()` 呼び出しを削除（config 読み込みは cli 側に移動し、core 関数内での重複を防ぐ）

## Task 7: CommandRunner から ProgressDisplay 依存を除去 (D1)

### 7a: CommandRunner に EventBus をコンストラクタ注入する

`src/core/command/runner.ts` を修正する。

- [x] `import { ProgressDisplay } from "../../cli/progress.js"` を削除
- [x] constructor: `(runtime: RuntimeStrategy)` -> `(runtime: RuntimeStrategy, events: EventBus)`
- [x] `this.events = events` として field に保持
- [x] `execute()` 内の `const events = new EventBus(); new ProgressDisplay(events, { verbose, slug });` を削除
- [x] `events` を `this.events` に置換（`createStandardPipeline(deps, this.events)` 等）

### 7b: PipelineRunCommand のコンストラクタを更新

`src/core/command/pipeline-run.ts` を修正する。

- [x] constructor に `events: EventBus` を追加: `(runtime, events, absolutePath, preflightResult, options)`
- [x] `super(runtime)` -> `super(runtime, events)`

### 7c: ResumeCommand のコンストラクタを更新

`src/core/command/resume.ts` を修正する。

- [x] constructor に `events: EventBus` を追加: `(runtime, events, slug, options)`
- [x] `super(runtime)` -> `super(runtime, events)`

### 7d: cli 層で EventBus + ProgressDisplay を配線する

`src/cli/progress.ts` に factory 関数を追加する。

- [x] `wireProgressDisplay(events: EventBus, opts: { verbose: boolean; slug: string }): ProgressDisplay` を export

`src/cli/run.ts` を修正する。

- [x] `EventBus` を import
- [x] `wireProgressDisplay` を import
- [x] `PipelineRunCommand` 生成前に `const events = new EventBus()` + `wireProgressDisplay(events, { verbose, slug })` を実行
- [x] `new PipelineRunCommand(runtime, events, absolutePath, preflightResult, options)` に変更

`src/cli/resume.ts` を修正する。

- [x] `EventBus` を import
- [x] `wireProgressDisplay` を import
- [x] `ResumeCommand` 生成前に `const events = new EventBus()` + `wireProgressDisplay(events, { verbose, slug })` を実行
- [x] `new ResumeCommand(runtime, events, slug, options)` に変更

**注意**: run.ts では `verbose` / `slug` が `PipelineRunCommand.prepare()` 内で確定するため、cli 層では `options.verbose ?? false` で仮決定し、slug は `requestMdPath` から解決する（preflightResult.request.slug が利用可能）。resume.ts では slug は引数で既知、verbose は options から取得可能。

## Task 8: テスト seam の移行 (D5)

### 8a: reviewer.test.ts のモック更新

- [x] `mockQueryFn` (AsyncGenerator) を `OneShotQueryClient` mock に変更
- [x] `runReview(content, config, cwd, mockQueryFn)` -> `runReview(content, cwd, mockClient)`
- [x] mockClient: `{ run: vi.fn().mockResolvedValue({ text: "...", stopReason: "success" }) }`

### 8b: generator.test.ts のモック更新

- [x] `mockQueryFn` (AsyncGenerator) を `OneShotQueryClient` mock に変更
- [x] `generate(text, cwd, config, mockQueryFn)` -> `generate(text, cwd, mockClient)`

### 8c: runner.test.ts の更新

- [x] `CommandRunner` / `PipelineRunCommand` / `ResumeCommand` の constructor 呼び出しに `events` 引数を追加
- [x] `ProgressDisplay` mock が不要になった箇所を整理

### 8d: その他の呼び出し元テストの更新

- [x] `manager.create()` / `manager.review()` を呼んでいるテストの引数を更新
- [x] `executeReview` / `executeCreate` を呼んでいるテストに client mock を追加

## Task 9: 境界違反 regression test の追加

`tests/unit/architecture/` (or appropriate location) に module boundary test を新規作成する。

- [x] `grep -rn "cli/" src/core/request` が 0 件であることを検証
- [x] `grep -rn "@anthropic-ai/claude-agent-sdk" src/core/request` が 0 件であることを検証
- [x] `grep -rE "from ['\"](\.\./)*adapter/" src/core/request` が 0 件であることを検証（baseline scenario と同一、スコープは core/request に限定）

これらは shell grep ベースの test（vitest の `exec` / `execSync` で実行し exit code を検証）とする。

## Task 10: delta spec 作成

`specrunner/changes/core-layer-boundary-fix/specs/one-shot-query/spec.md` を作成する。

- [x] Requirement「request-review は queryOneShot 経由で query() を呼び出す」を MODIFIED し、「reviewer / manager / generator は OneShotQueryClient port に依存する」に更新
- [x] 旧 Scenario「runReview が queryOneShot を import している」を「runReview が OneShotQueryClient を引数に受け取る」に更新
- [x] Requirement「queryOneShot 関数が one-shot query の共通実行基盤を提供する」は変更なし（adapter に存続）
- [x] Requirement「queryOneShot と agent-runner-port は別 entry point として共存する」は変更なし

## Task 11: typecheck & test green 確認

- [x] `bun run typecheck` が pass
- [x] `bun run test` が pass
