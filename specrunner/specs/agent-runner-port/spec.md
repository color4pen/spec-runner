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

各 `AgentRunner` 実装は MUST agent 完了後に「期待 branch が存在するか」「期待 result file が取得可能か」を adapter 固有の手段で検証する。検証失敗時は `AgentRunResult.completionReason` を `"error"` にし、`error` フィールドに診断情報を入れて返す。`StepExecutor` は SHALL この検証ロジックを持たない。

#### Scenario: 期待 branch が存在しない場合 error を返す

- **GIVEN** `runner.run(ctx)` で agent 完了後、期待 branch（`ctx.branch`）が adapter の検証手段で見つからない
- **WHEN** adapter が結果を組み立てる
- **THEN** `result.completionReason === "error"` である
- **AND** `result.error.message` に「branch not found / not advanced」相当の診断情報が含まれる

#### Scenario: 期待 result file が存在しない場合 error を返す

- **GIVEN** agent 完了後、`step.resultFilePath(state)` が non-null path を返す
- **AND** adapter の手段（managed: GitHub API 404、local: fs.existsSync false）でそのファイルを取得できない
- **WHEN** adapter が結果を組み立てる
- **THEN** `result.completionReason === "error"` である
- **AND** `result.error.message` に「result file not found」相当の診断情報が含まれる
- **AND** managed runtime では GitHub API の 404 応答と local runtime での fs.existsSync false が同等の error として扱われる

#### Scenario: StepExecutor が verifyBranch / verifyPath helper を保持しない

- **WHEN** `src/core/step/executor.ts` を grep する
- **THEN** `verifyBranch` / `verifyPath` / `getFileContent` の helper 呼び出しは 0 マッチである
