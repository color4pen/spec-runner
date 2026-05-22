# managed-agent-runtime Specification

## Purpose
Define the ManagedAgentRunner adapter that implements AgentRunner using the Anthropic Managed Agents SessionClient API.
## Requirements

### Requirement: ManagedAgentRunner は SessionClient を介して既存 lifecycle を実装する

`src/adapter/managed-agent/agent-runner.ts` に `ManagedAgentRunner` SHALL 実装される。`ManagedAgentRunner` は `AgentRunner` interface を実装し、内部で `SessionClient` / `GitHubClient` / `ConfigStore` を利用する。

`ManagedAgentRunner.run(ctx)` は MUST 以下のステップを実施する:

1. `ConfigStore.getAgentId(ctx.step.agent.role)` で Anthropic agent ID を解決する
2. `SessionClient.create({ agentId, ... })` で session を作成する
3. `ctx.step.buildMessage(ctx.state, deps)` で得た prompt に、本 adapter 固有の `additionalInstructions`（register_branch tool の使用指示等）を append する
4. `SessionClient.sendUserMessage` でメッセージを送信し、SSE stream を購読する
5. SSE stream の `agent.custom_tool_use` event を adapter 内 dispatch table（`register_branch` などを含む）で処理する
6. session 完了まで polling（既存の completion-detection ロジック）する
7. branch 検証: `GitHubClient.verifyBranch(ctx.branch)` で期待 branch の存在を確認する
8. resultContent 取得: `ctx.step.resultFilePath(ctx.state)` が non-null の場合、`GitHubClient.getFileContent(ctx.branch, resultPath)` で取得する
9. `AgentRunResult` を組み立てて返す

`ManagedAgentRunner` は MUST `@anthropic-ai/claude-code` を import しない。

#### Scenario: ManagedAgentRunner が AgentRunner interface を実装する

- **WHEN** `ManagedAgentRunner` クラスを inspect する
- **THEN** `run(context: AgentRunContext): Promise<AgentRunResult>` method を実装する
- **AND** `AgentRunner` interface に compliant である（型エラーなし）

#### Scenario: ManagedAgentRunner が SessionClient を内部利用する

- **GIVEN** `ManagedAgentRunner` の dependencies
- **WHEN** constructor 引数を inspect する
- **THEN** `sessionClient: SessionClient`, `githubClient: GitHubClient`, `configStore: ConfigStore` を受け取る
- **AND** `SessionClient` interface 自体は本 change で変更されない

#### Scenario: ManagedAgentRunner.run が既存 lifecycle と等価である

- **GIVEN** `runtime: "managed"` config と既存の AgentStep（propose / spec-review / implementer / build-fixer / code-review / code-fixer / spec-fixer）
- **WHEN** `ManagedAgentRunner.run(ctx)` が完走する
- **THEN** session 作成 / SSE 購読 / polling / register_branch dispatch / verifyBranch / getFileContent の挙動が、本 change 適用前の `executor.ts` と意味的に等価である
- **AND** 既存の dogfooding スクリプトが regression なしで完走する

### Requirement: register_branch Custom Tool は managed-agent adapter に閉じ込める

`register_branch` Custom Tool の definition / handler / SSE dispatch は MUST `src/adapter/managed-agent/tools/` 配下に配置される。`src/core/` 配下の任意のファイルは MUST `register_branch` を import / 参照しない。

`ManagedAgentRunner` は SHALL agent 作成時に `custom_tools` 配列を内部で組み立て、ProposeStep 等の AgentStep が `toolHandlers` を露出していなくても adapter が必要な tool を注入する。

#### Scenario: register_branch ファイルの所在

- **WHEN** `register_branch` の definition / handler ソースを find する
- **THEN** `src/adapter/managed-agent/tools/register-branch.ts`（または同等のファイル）に配置される
- **AND** `src/core/tools/` および `src/core/step/` 配下に register_branch を import する文字列は存在しない

#### Scenario: core が register_branch を知らない

- **WHEN** `grep -r "register_branch" src/core/` を実行する
- **THEN** マッチ行は 0 である

#### Scenario: ManagedAgentRunner が tool を adapter 内で注入する

- **GIVEN** ProposeStep（`step.agent.role === "propose"`）を ManagedAgentRunner で実行する
- **WHEN** session 作成時の custom_tools 配列を inspect する
- **THEN** `register_branch` が含まれている
- **AND** その注入は `ManagedAgentRunner` 内部のロジックで行われ、ProposeStep の `toolHandlers` を参照しない

### Requirement: ManagedAgentRunner は CLI 主導 branch を canonical として扱う

`ManagedAgentRunner` は MUST `ctx.branch` を「期待 branch」として agent prompt に instruction として注入する。agent が register_branch で異なる branch を報告した場合、adapter は SHALL stderr に warning を出し、`ctx.branch` を canonical として保持する（agent の値で上書きしない）。

#### Scenario: prompt に branch 指示が含まれる

- **GIVEN** `ctx.branch === "feat/foo-bar"`
- **WHEN** ManagedAgentRunner が agent に送る最終 prompt を inspect する
- **THEN** prompt 中に `feat/foo-bar` という branch 名が含まれている
- **AND** 「この branch を使え」という指示文が `additionalInstructions` として present である

#### Scenario: agent が異なる branch を register_branch で報告した

- **GIVEN** `ctx.branch === "feat/foo-bar"` で agent が `register_branch({ branch: "feat/other" })` を呼ぶ
- **WHEN** ManagedAgentRunner が register_branch の結果を処理する
- **THEN** stderr に warning（mismatch を明示）が出力される
- **AND** state.branch / ctx.branch は `"feat/foo-bar"` のまま保持される
- **AND** verifyBranch は `"feat/foo-bar"` の存在を GitHub で確認する

### Requirement: ManagedAgentRunner は credential-store の resolver を経由して API key を取得する

`ManagedAgentRunner` は MUST `core/credentials/anthropic.ts` の `resolveSpecRunnerApiKey` 経由で Anthropic API key を取得する。`process.env["SPECRUNNER_API_KEY"]` を直読することは MUST NOT。credential の格納・解決ルールは `specrunner/specs/credential-store/spec.md` を参照。

#### Scenario: API key 取得経路

- **GIVEN** managed runtime で session 作成時
- **WHEN** API key を取得する
- **THEN** `resolveSpecRunnerApiKey` を呼ぶ
- **AND** `process.env["SPECRUNNER_API_KEY"]` を直接参照しない

#### Scenario: callsite の制約

- **WHEN** `ManagedAgentRunner` が API key を必要とする
- **THEN** `resolveSpecRunnerApiKey` 関数経由で取得する
- **AND** `process.env["SPECRUNNER_API_KEY"]` の直読が src/ 配下に発生しない

### Requirement: ManagedAgentRunner は followUpPrompt 指定時に SSE 後 follow turn を実行する

`ManagedAgentRunner.runDesignStyle(ctx)` SHALL `ctx.followUpPrompt` が指定されている場合、SSE `end_turn` 完了後に同一 session で follow プロンプトを 1 本投げる 2 段実行を行う。

2 段実行の手順:

1. 作業 turn を SSE streaming で実行 (既存の `streamEvents` 呼び出し)
2. SSE が `end_turn` で完了した後、同一 `sessionId` に対して `sendUserMessage(sessionId, ctx.followUpPrompt)` を呼ぶ
3. `pollUntilComplete(sessionId)` で follow turn の完了を待つ
4. follow turn 完了後、既存の GitHub verification (branch / change folder 確認) を実行する

follow turn には SSE streaming を使わず polling で完了を待つ。follow turn は custom tool 不要の self-fix 作業であるため、SSE の event dispatch は不要。

`ctx.followUpPrompt` が未指定の場合は既存パスのまま返す (早期 return)。

SSE が `end_turn` 以外で終了した場合 (polling fallback / terminated) は follow turn を実行しない。follow turn は作業 turn が正常完了した場合のみ実行する。

#### Scenario: SSE end_turn 後に follow turn を実行する

- **GIVEN** `ctx.followUpPrompt` が設定されている
- **AND** SSE streaming が `end_turn` で完了する
- **WHEN** `ManagedAgentRunner.runDesignStyle(ctx)` を実行する
- **THEN** `sendUserMessage(sessionId, ctx.followUpPrompt)` が呼ばれる
- **AND** `pollUntilComplete(sessionId)` が呼ばれる
- **AND** follow turn 完了後に GitHub verification が実行される

#### Scenario: SSE が terminated の場合 follow turn を実行しない

- **GIVEN** `ctx.followUpPrompt` が設定されている
- **AND** SSE streaming が `terminated` で完了する
- **WHEN** `ManagedAgentRunner.runDesignStyle(ctx)` を実行する
- **THEN** `sendUserMessage` は follow turn 目的では呼ばれない
- **AND** 既存の terminated エラーハンドリングが実行される

#### Scenario: followUpPrompt 未指定時は既存挙動

- **GIVEN** `ctx.followUpPrompt` が undefined である
- **WHEN** `ManagedAgentRunner.runDesignStyle(ctx)` を実行する
- **THEN** SSE 完了後すぐに GitHub verification + return する
- **AND** `sendUserMessage` は呼ばれない

### Requirement: ManagedAgentRunner は followUpPrompt 指定時に polling style でも follow turn を実行する

`ManagedAgentRunner.runPollingStyle(ctx)` SHALL `ctx.followUpPrompt` が指定されている場合、polling 完了後に同一 session で follow プロンプトを 1 本投げる 2 段実行を行う。

polling が `idle` (成功) で完了した場合のみ follow turn を実行する。`terminated` やエラーの場合は follow turn を実行しない。

2 段実行の手順:

1. 作業 turn を polling で実行 (既存の `sendUserMessage` + `pollUntilComplete`)
2. polling が `idle` で完了した後、同一 `sessionId` に対して `sendUserMessage(sessionId, ctx.followUpPrompt)` を呼ぶ
3. `pollUntilComplete(sessionId)` で follow turn の完了を待つ
4. follow turn 完了後、既存の artifact 検証を実行する

#### Scenario: polling idle 後に follow turn を実行する

- **GIVEN** `ctx.followUpPrompt` が設定されている
- **AND** 作業 turn の polling が `idle` で完了する
- **WHEN** `ManagedAgentRunner.runPollingStyle(ctx)` を実行する
- **THEN** `sendUserMessage` が 2 回呼ばれる (作業 turn + follow turn)
- **AND** `pollUntilComplete` が 2 回呼ばれる (作業 turn + follow turn)

#### Scenario: follow turn の sendUserMessage が失敗した場合 graceful degradation

- **GIVEN** `ctx.followUpPrompt` が設定されている
- **AND** follow turn の `sendUserMessage` が例外を throw する
- **WHEN** `ManagedAgentRunner` が follow turn を試みる
- **THEN** 例外を catch して stderr に warning を出力する
- **AND** 作業 turn の result をそのまま返す (follow turn 失敗は非致命的)

### Requirement: ManagedAgentRunner は follow turn の timeout を既存の effectiveTimeoutMs で管理する

ManagedAgentRunner の 2 段実行 SHALL 既存の timeout 計算 (`resolvedConfig.timeoutMs` or `DEFAULT_POLL_TIMEOUT_MS`) を作業 turn と follow turn で共有する。

SSE 経路では既存の AbortController が run() 全体をカバーする。polling 経路では wall-clock timeout の残時間を follow turn に引き継ぐ。

#### Scenario: follow turn が timeout 残時間内で実行される

- **GIVEN** `effectiveTimeoutMs` が 900000ms である
- **AND** 作業 turn が 600000ms かかる
- **WHEN** follow turn の pollUntilComplete を inspect する
- **THEN** timeout は残時間 (300000ms 以下) が設定されている
