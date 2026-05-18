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
