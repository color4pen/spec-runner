# agent-runner-port Specification

## Purpose
Define the AgentRunner port interface that abstracts agent step lifecycle, hiding runtime-specific concerns from StepExecutor.
## Requirements

### Requirement: AgentRunner port は agent step lifecycle を抽象化する

`src/core/port/agent-runner.ts` SHALL `AgentRunner` interface を定義する。`AgentRunner` は agent step の実行戦略（session 作成・通信・結果取得・結果ファイル読み出し・branch / path 検証）を 1 つの method `run` の背後にまとめ、`StepExecutor` から runtime 固有処理を完全に隠蔽する。

`AgentRunner` interface は MUST 以下の shape を持つ:

```ts
export interface AgentRunner {
  run(context: AgentRunContext): Promise<AgentRunResult>;
}
```

`AgentRunContext` は MUST 以下の field を持つ:

- `step: AgentStep` — 実行対象の `AgentStep`（`name`, `agent`, `buildMessage`, `resultFilePath`, `parseResult` を含む）
- `state: JobState` — 現在の `JobState`（slug、history、現状の branch 情報などを含む）
- `branch: string` — INPUT として CLI が決定した正規 branch 名（例: `feat/<slug>`）
- `slug: string` — 正規 slug（state.request.slug と同値）
- `cwd: string` — worktree の絶対パス
- `requestContent: string` — request.md / pipeline-context.md など prompt 構築の素材文字列
- `config: SpecRunnerConfig` — runtime 固有 config を含む全体 config
- `emit: (event: DomainEvent) => void` — adapter から発火する domain event の sink

`AgentRunResult` は MUST 以下の field を持つ:

- `completionReason: "success" | "error" | "timeout"`
- `resultContent: string | null` — adapter が `step.resultFilePath` から取得済みの内容（取得手段は adapter ごとに異なる）。`step.resultFilePath` が `null` を返す場合は `null`
- `sessionId?: string` — managed runtime 固有の session ID（local runtime では `undefined`）
- `error?: Error` — `completionReason !== "success"` の場合に診断情報を伝搬

#### Scenario: AgentRunner interface が単一メソッドである

- **WHEN** `src/core/port/agent-runner.ts` の `AgentRunner` interface を inspect する
- **THEN** method は `run(context: AgentRunContext): Promise<AgentRunResult>` の 1 つのみである
- **AND** `createSession` / `sendMessage` / `pollUntilComplete` / `getResult` のような lifecycle phase 別 method は存在しない

#### Scenario: AgentRunContext が runtime 非依存である

- **WHEN** `AgentRunContext` の field を inspect する
- **THEN** 全 field が runtime 非依存の値（step / state / branch / slug / cwd / requestContent / config / emit）のみで構成される
- **AND** `sessionClient` / `claudeCodeQuery` のような runtime 固有 SDK 型は含まない

#### Scenario: AgentRunResult が resultContent を含む

- **GIVEN** `step.resultFilePath(state)` が non-null path を返す
- **WHEN** `runner.run(ctx)` が resolve する
- **THEN** `result.resultContent` が adapter 固有の手段で取得済みの string である
- **AND** `StepExecutor` は `result.resultContent` をそのまま `step.parseResult` に渡せる

#### Scenario: resultFilePath が null の step では resultContent も null

- **GIVEN** `step.resultFilePath(state) === null`（spec-fixer / implementer / build-fixer / code-fixer）
- **WHEN** `runner.run(ctx)` が resolve する
- **THEN** `result.resultContent === null` である
- **AND** `StepExecutor` は `NULL_PARSE_RESULT` を生成する既存経路に従う

### Requirement: StepExecutor は AgentRunner port のみに依存する

`StepExecutor` は MUST agent step lifecycle を `AgentRunner.run()` に委譲する。`StepExecutor` は SHALL `SessionClient`, `@anthropic-ai/sdk`, `@anthropic-ai/claude-code` のいずれの runtime 固有 SDK も import しない。

`StepExecutor` の agent step 経路は MUST 以下のステップで構成される:

1. `step:start` を emit する
2. `AgentRunContext` を構築する（branch / slug / cwd / requestContent / config を CLI から伝搬）
3. `await runner.run(ctx)` を呼ぶ
4. `result.completionReason !== "success"` の場合は `step:error` を emit して `failJobState` 経路へ
5. `result.resultContent` を `step.parseResult` に渡して `StepOutcome` を得る
6. `verdict:parsed` を emit する
7. `JobStateStore.appendStepRun` で `StepRun` を永続化する
8. `step:complete` を emit する

`StepExecutor` MUST `runner` を constructor injection で受け取り、SHALL adapter の concrete class 名を import しない。

#### Scenario: StepExecutor が SessionClient を直接 import しない

- **WHEN** `grep -rE "from ['\"](\\.\\./)*adapter/" src/core/step/executor.ts` を実行する
- **THEN** マッチ行は 0 である
- **AND** `grep -rE "@anthropic-ai/(sdk|claude-code)" src/core/step/executor.ts` も 0 マッチである

#### Scenario: StepExecutor が AgentRunner.run を 1 回呼ぶ

- **GIVEN** AgentStep を実行する `StepExecutor`
- **WHEN** `executor.execute(step, state)` が runs する
- **THEN** `runner.run(ctx)` が 1 回 await される
- **AND** ctx には `step`, `state`, `branch`, `slug`, `cwd`, `requestContent`, `config`, `emit` が設定されている

#### Scenario: StepExecutor が completionReason !== "success" で step:error を emit する

- **GIVEN** `runner.run(ctx)` が `{ completionReason: "error", error: <err> }` を resolve する
- **WHEN** `StepExecutor.execute(step, state)` が処理する
- **THEN** `step:error` が emit される
- **AND** `failJobState` および `appendHistory` の既存 semantics が保たれる

### Requirement: AgentRunner adapter は branch / path verification を内部で行う

各 `AgentRunner` 実装は MUST agent 完了後に「期待 result file が取得可能か」を adapter 固有の手段で検証する。result file が取得できない場合は `AgentRunResult.completionReason` を `"error"` にし、`error` フィールドに診断情報を入れて返す。

**branch advancement の検証（`requiresCommit` guard）は `StepExecutor` に移管された。** `ClaudeCodeRunner` は MUST NOT `requiresCommit` に基づく branch HEAD 検証を行わない。`ManagedAgentRunner` は従来通り remote HEAD SHA 比較で `requiresCommit` guard を実施する（managed runtime では agent が commit + push を行うため）。

`StepExecutor` は result file の検証を直接行わない（adapter の `run()` が result 取得を含むため）。

#### Scenario: 期待 result file が存在しない場合 error を返す

- **GIVEN** agent 完了後、`step.resultFilePath(state)` が non-null path を返す
- **AND** adapter の手段（managed: GitHub API 404、local: fs.existsSync false）でそのファイルを取得できない
- **WHEN** adapter が結果を組み立てる
- **THEN** `result.completionReason === "error"` である
- **AND** `result.error.message` に「result file not found」相当の診断情報が含まれる

#### Scenario: ClaudeCodeRunner は requiresCommit guard を行わない

- **GIVEN** `step.requiresCommit === true` の agent step を local runtime で実行する
- **WHEN** `ClaudeCodeRunner.run(ctx)` が完了後の検証を行う
- **THEN** branch HEAD の SHA 比較は行わない
- **AND** `requiresCommit` フィールドを参照しない
- **AND** result file の読み出しのみ行う

#### Scenario: ManagedAgentRunner は従来通り requiresCommit guard を実施する

- **GIVEN** `step.requiresCommit === true` の agent step を managed runtime で実行する
- **WHEN** `ManagedAgentRunner` が完了後の検証を行う
- **THEN** remote HEAD SHA の pre/post 比較で branch advancement を検証する
- **AND** SHA が unchanged の場合 `NO_COMMIT_DETECTED` error を返す

### Requirement: ManagedAgentRunner は git commit/push 指示を additionalInstructions で注入する

`ManagedAgentRunner` SHALL inject git commit/push instructions via an `additionalInstructions` mechanism appended to the user message when constructing the initial message for writing steps (implementer, spec-fixer, code-fixer, build-fixer).

These injected instructions SHALL replace the instructions previously embedded by `buildGitPushInstruction()` in `step.buildMessage()` and by system prompt files. After T-06 removes `buildGitPushInstruction()` from all `buildMessage()` methods and T-07 removes git instructions from system prompts, `ManagedAgentRunner` MUST ensure managed runtime agents still receive complete git commit/push instructions.

The injected instructions SHALL include:
- (a) the target branch name
- (b) the commit + push command sequence (`git add -A && git commit -m "..." && git push origin <branch>`)
- (c) the instruction to not end the session until push completes

**Rationale**: Without this injection, managed runtime agents would lose all git commit/push instructions from two sources simultaneously (buildMessage and system prompts), causing `ManagedAgentRunner.requiresCommit` to trigger `NO_COMMIT_DETECTED` for every writing step. This violates the acceptance criterion "managed runtime の動作に影響がない."

#### Scenario: ManagedAgentRunner が writing step に git 指示を注入する

- **GIVEN** `ManagedAgentRunner` が implementer / spec-fixer / code-fixer / build-fixer のいずれかの step を実行する
- **WHEN** `ManagedAgentRunner` が `step.buildMessage(state, stepCtx)` で得た user message を組み立てる
- **THEN** 最終的に agent に渡るメッセージには git commit/push 指示が含まれる
- **AND** 指示には期待 branch 名が含まれる
- **AND** 指示には `git push origin <branch>` コマンドシーケンスが含まれる
- **AND** push 完了まで end_turn しないよう指示する文が含まれる

#### Scenario: buildGitPushInstruction 削除後も managed runtime が commit + push する

- **GIVEN** `buildGitPushInstruction()` が `buildMessage()` から除去されている
- **AND** system prompt ファイルから git 指示が除去されている
- **WHEN** managed runtime で writing step を実行する
- **THEN** agent は git commit + push を実行する
- **AND** `ManagedAgentRunner.requiresCommit` guard が `NO_COMMIT_DETECTED` を返さない

### Requirement: AgentRunContext は followUpPrompt を伝搬する

`AgentRunContext` SHALL `followUpPrompt?: string` field を持つ。この field は step が宣言した follow-up prompt を adapter に伝搬する。

`followUpPrompt` が指定されている場合、adapter は作業 turn 完了後に同一 session で follow プロンプトを 1 本投げて self-fix を促す。`followUpPrompt` が未指定 (undefined) の場合、adapter は作業 turn のみで返す (既存挙動)。

`AgentRunContext` に追加される field:

```ts
/** 作業 turn 後に同一 session へ投げる follow プロンプト。未指定時は作業 turn のみ。 */
followUpPrompt?: string;
```

この field は runtime-neutral な string であり、SDK 固有型を含まない (TC-002 準拠)。

#### Scenario: followUpPrompt が AgentRunContext に含まれる

- **WHEN** `AgentRunContext` の field を inspect する
- **THEN** `followUpPrompt?: string` field が存在する
- **AND** field は optional である (未指定時は undefined)

#### Scenario: followUpPrompt 未指定時は既存挙動のまま

- **GIVEN** `ctx.followUpPrompt` が undefined である
- **WHEN** `runner.run(ctx)` を実行する
- **THEN** adapter は作業 turn のみを実行する
- **AND** result は従来と同一構造である

### Requirement: ClaudeCodeRunner emits step:progress via ctx.emit

`ClaudeCodeRunner` SHALL detect tool_use content blocks in the SDK stream and emit `step:progress` events via `ctx.emit("step:progress", { step, tool, target? })`.

The emit logic SHALL be shared between the main query stream loop and the follow-up query stream loop via a common helper function. This ensures progress reporting is consistent across both execution paths.

The adapter SHALL NOT perform throttling, formatting, or timer management. These responsibilities belong to the CLI layer (`ProgressDisplay`).

#### Scenario: Tool use detected in main stream emits step:progress

- **GIVEN** a `ClaudeCodeRunner.run()` is executing the main query stream loop
- **WHEN** a tool_use content block (e.g. `Edit`, `Bash`) is detected in the stream
- **THEN** `ctx.emit("step:progress", { step: "<stepName>", tool: "<toolName>" })` is called

#### Scenario: Tool use detected in follow-up stream emits step:progress

- **GIVEN** a `ClaudeCodeRunner.run()` is executing the follow-up query stream loop
- **WHEN** a tool_use content block is detected in the stream
- **THEN** `ctx.emit("step:progress", { step: "<stepName>", tool: "<toolName>" })` is called

#### Scenario: Target extracted when available

- **GIVEN** a tool_use content block with identifiable target (e.g. Edit with `file_path`)
- **WHEN** the tool_use is detected
- **THEN** `step:progress` payload includes `target` with the extracted value

#### Scenario: Target omitted when not extractable

- **GIVEN** a tool_use content block without an identifiable target
- **WHEN** the tool_use is detected
- **THEN** `step:progress` payload does not include `target` (field is `undefined`)

#### Scenario: No step:progress emitted for non-tool messages

- **GIVEN** a stream message that is not a tool_use (e.g. `result`, `text_delta`)
- **WHEN** the message is processed
- **THEN** `ctx.emit("step:progress", ...)` is NOT called

#### Scenario: Common helper used by both loops

- **WHEN** inspecting `src/adapter/claude-code/agent-runner.ts`
- **THEN** both the main query loop and the follow-up query loop call the same helper function for tool_use detection and `ctx.emit`

### Requirement: ManagedAgentRunner does not emit step:progress

`ManagedAgentRunner` SHALL NOT emit `step:progress` events. The managed runtime SSE stream does not expose built-in tool names at sufficient granularity. The CLI heartbeat floor (step + elapsed only) provides adequate idle-timeout protection for managed runtime.

#### Scenario: ManagedAgentRunner does not call ctx.emit with step:progress

- **WHEN** `ManagedAgentRunner.run()` executes
- **THEN** `ctx.emit` is never called with `"step:progress"` as the event name

### Requirement: isToolUse type guard in message-types

`src/adapter/claude-code/message-types.ts` SHALL export an `isToolUse` type guard function that detects tool_use content blocks within SDK stream messages. The guard narrows to a shape containing the tool name.

#### Scenario: isToolUse returns true for tool_use content block

- **GIVEN** a stream message containing a `content_block_start` event with `content_block.type === "tool_use"`
- **WHEN** `isToolUse(msg)` is called
- **THEN** the return value is `true`
- **AND** the narrowed type includes `content_block.name` as a string

#### Scenario: isToolUse returns false for non-tool messages

- **GIVEN** a stream message that is a `result`, `text_delta`, or other non-tool type
- **WHEN** `isToolUse(msg)` is called
- **THEN** the return value is `false`

## Clarification: StepExecutor の git 操作と verifyBranch/verifyPath の区別

ベースライン仕様に「StepExecutor が verifyBranch / verifyPath helper を保持しない」シナリオが存在する:

> **WHEN** `src/core/step/executor.ts` を grep する  
> **THEN** `verifyBranch` / `verifyPath` / `getFileContent` の helper 呼び出しは 0 マッチである

このシナリオの保証は **引き続き有効** である。`commitAndPush` は commit ライフサイクル操作（検証ではなく実行）であり、`verifyBranch` や `verifyPath` ヘルパーとは別物である。

- `verifyBranch` / `verifyPath` / `getFileContent` の grep-zero 保証は、これら **具体的なヘルパー名** に対してのみ適用される
- `commitAndPush` が executor.ts に追加されることで git subprocess 呼び出し（`git add`, `git commit`, `git push`）が executor に存在することになるが、これは **verification** ではなく **commit lifecycle** の操作であるため、ベースライン保証に違反しない
- `verifyBranch` / `verifyPath` / `getFileContent` という識別子は executor.ts に引き続き 0 マッチでなければならない
