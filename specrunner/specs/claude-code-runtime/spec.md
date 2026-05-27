# claude-code-runtime Specification

## Purpose
Define the ClaudeCodeRunner adapter that implements AgentRunner using the Claude Code SDK query() API for local runtime execution.
## Requirements

### Requirement: ClaudeCodeRunner は Claude Code SDK の query() を介して実行する

`src/adapter/claude-code/agent-runner.ts` に `ClaudeCodeRunner` SHALL 実装される。`ClaudeCodeRunner` は `AgentRunner` interface を実装し、内部で `@anthropic-ai/claude-code` の `query()` を呼ぶ。

`ClaudeCodeRunner.run(ctx)` は MUST 以下のステップを実施する:

1. `ctx.step.buildMessage(ctx.state, deps)` で得た runtime-neutral prompt を取得する
2. runtime 固有 `additionalInstructions`（worktree パス、branch 名、slug の通知。**git commit / push の指示は含まない — commit + push は StepExecutor が行う**）を prompt に append する
3. `query({ cwd: ctx.cwd, prompt, additionalInstructions, ...sdkOptions })` を呼び、agent の完了まで await する
4. resultContent 取得: `ctx.step.resultFilePath(ctx.state)` が non-null の場合、`fs.readFile(path.join(ctx.cwd, resultPath))` で読む
5. `AgentRunResult` を組み立てて返す（`sessionId` は SDK から取得可能な場合はセット）

`ClaudeCodeRunner` は MUST `@anthropic-ai/sdk` の `SessionClient` 系を import しない。

**変更点**: step 2 から git push 指示を除去。step 4 (旧 branch 検証) を除去 — branch / commit の検証は StepExecutor の `commitAndPush` が担う。

#### Scenario: additionalInstructions に git push 指示が含まれない

- **GIVEN** `ctx.branch === "feat/foo-bar"`, `ctx.slug === "foo-bar"`
- **WHEN** `ClaudeCodeRunner` が `query()` に渡す additionalInstructions を inspect する
- **THEN** instructions 中に worktree パスと branch 名が含まれる
- **AND** `git push` や `commit all changes` の文字列が含まれない
- **AND** end_turn / session 終了を促す指示が含まれる

#### Scenario: ClaudeCodeRunner が AgentRunner interface を実装する

- **WHEN** `ClaudeCodeRunner` クラスを inspect する
- **THEN** `run(context: AgentRunContext): Promise<AgentRunResult>` method を実装する
- **AND** `AgentRunner` interface に compliant である

#### Scenario: ClaudeCodeRunner が SessionClient を import しない

- **WHEN** `grep -r "SessionClient" src/adapter/claude-code/` を実行する
- **THEN** マッチ行は 0 である

### Requirement: ClaudeCodeRunner は branch を CLI 入力として扱い register_branch を使わない

`ClaudeCodeRunner` は MUST `ctx.branch` を期待 branch として `additionalInstructions` に注入する。agent には「この branch で `git checkout -b` してから commit / push せよ」と指示し、`register_branch` 系の Custom Tool は SHALL 利用しない。

#### Scenario: additionalInstructions に branch 指示が含まれる

- **GIVEN** `ctx.branch === "feat/foo-bar"`、`ctx.slug === "foo-bar"`
- **WHEN** `ClaudeCodeRunner` が `query()` に渡す additionalInstructions を inspect する
- **THEN** instructions 中に `git checkout -b feat/foo-bar` 相当の指示が含まれる
- **AND** `register_branch` Custom Tool への参照は含まれない

#### Scenario: ClaudeCodeRunner は register_branch を import しない

- **WHEN** `grep -r "register_branch" src/adapter/claude-code/` を実行する
- **THEN** マッチ行は 0 である

### Requirement: ClaudeCodeRunner は requiresCommit guard を fs / git で検証する

`ClaudeCodeRunner` は MUST NOT `requiresCommit` の検証を行わない。pre-run / post-run の SHA 比較、`git rev-parse` による branch HEAD 検証、および `NO_COMMIT_DETECTED` エラーの生成は全て `StepExecutor.commitAndPush()` に移管された。

`ClaudeCodeRunner.run()` は agent 完了後、result file の読み出しのみ行い、branch advancement の検証は SHALL NOT 行う。

**変更点**: 旧 "ClaudeCodeRunner は requiresCommit guard を fs / git で検証する" requirement を置換。

#### Scenario: ClaudeCodeRunner が requiresCommit を参照しない

- **WHEN** `grep -n "requiresCommit" src/adapter/claude-code/agent-runner.ts` を実行する
- **THEN** マッチ行は 0 である

#### Scenario: ClaudeCodeRunner が pre/post SHA 比較を行わない

- **WHEN** `grep -n "preRunHeadSha\|postRunHeadSha" src/adapter/claude-code/agent-runner.ts` を実行する
- **THEN** マッチ行は 0 である

#### Scenario: agent 完了後は result file 読み出しのみ

- **GIVEN** `step.requiresCommit === true` の agent step を `ClaudeCodeRunner` で実行する
- **WHEN** agent が完了し `ClaudeCodeRunner` が結果を組み立てる
- **THEN** `result.completionReason === "success"` である（requiresCommit による検証は行わない）
- **AND** `result.resultContent` は `fs.readFile` で取得した内容である

### Requirement: prompts/ は runtime-neutral に保たれる

`src/prompts/` 配下の prompt 定義 SHALL runtime（managed / local）に依存する文字列を含まない。git commit / push の指示は MUST prompt ファイルに含まれない。runtime 固有の指示は adapter の `run()` 内で `additionalInstructions` として動的に注入される。

`src/prompts/git-push-instruction.ts` は SHALL 削除される。`buildGitPushInstruction()` の全呼び出し元は end_turn 指示に置換される。

#### Scenario: prompts/ に git commit/push 指示が含まれない

- **WHEN** `grep -rE "commit.*push|git add|git push" src/prompts/` を実行する
- **THEN** マッチ行は 0 である

#### Scenario: git-push-instruction.ts が存在しない

- **WHEN** `ls src/prompts/git-push-instruction.ts` を実行する
- **THEN** ファイルが存在しない

#### Scenario: buildGitPushInstruction の参照が存在しない

- **WHEN** `grep -r "buildGitPushInstruction" src/` を実行する
- **THEN** マッチ行は 0 である

### Requirement: ClaudeCodeRunner は config から解決した実行パラメータを使用する

`ClaudeCodeRunner.run()` は MUST `getStepExecutionConfig(ctx.config, step.name, { model: step.agent.model, maxTurns: step.maxTurns })` を呼び出し、解決済みの `ResolvedStepConfig` を SDK `query()` の options に適用する。

具体的には:
- `resolved.model` を `options.model` に渡す
- `resolved.maxTurns` が `number` の場合は `options.maxTurns` に渡す
- `resolved.maxTurns` が `null` の場合は `options.maxTurns` を省略する（SDK デフォルト = unlimited）
- `resolved.timeoutMs` は解決するが `options` には渡さない（SDK 未対応。将来の自前 guard 用）

従来の `step.maxTurns ?? 30` のフォールバックは MUST 廃止され、`getStepExecutionConfig` の解決チェーンに置き換わる。

#### Scenario: config step-level の model が SDK に渡される

- **GIVEN** config に `{ "steps": { "implementer": { "model": "claude-opus-4-6[1m]" } } }` が設定されている
- **AND** step 定義のハードコード model が `"claude-sonnet-4-6"` である
- **WHEN** `ClaudeCodeRunner.run(ctx)` が implementer step を実行する
- **THEN** SDK `query()` の `options.model` は `"claude-opus-4-6[1m]"` である

#### Scenario: maxTurns null で SDK に maxTurns を渡さない

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": null } } }` が設定されている
- **WHEN** `ClaudeCodeRunner.run(ctx)` が任意の step を実行する
- **THEN** SDK `query()` の `options` に `maxTurns` フィールドが含まれない（省略される）

#### Scenario: config 未設定時は step 定義のハードコード値が使用される

- **GIVEN** config に `steps` セクションが存在しない
- **AND** step 定義のハードコード model が `"claude-sonnet-4-6"` で maxTurns が `25` である
- **WHEN** `ClaudeCodeRunner.run(ctx)` がその step を実行する
- **THEN** SDK `query()` の `options.model` は `"claude-sonnet-4-6"` である
- **AND** SDK `query()` の `options.maxTurns` は `25` である

#### Scenario: config defaults が step 定義より優先される

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": 100 } } }` が設定されている
- **AND** step 定義のハードコード maxTurns が `30` である
- **AND** step 個別設定は存在しない
- **WHEN** `ClaudeCodeRunner.run(ctx)` がその step を実行する
- **THEN** SDK `query()` の `options.maxTurns` は `100` である

### Requirement: ClaudeCodeRunner は N 段 follow-up を実行する

`ClaudeCodeRunner.run(ctx)` SHALL `ctx.followUpPrompts` が non-empty かつ作業 turn が success の場合、各 prompt を順番に同一 session で実行する N 段 follow-up を行う。

N 段 follow-up の手順:
1. 作業 turn を `queryFn()` で実行 (既存)
2. `ctx.followUpPrompts` の各 prompt に対して、`resume: extractedSessionId` で `queryFn()` を再呼び出し
3. 各 follow turn の modelUsage を累積加算 (per-model sum)
4. 最終 turn の resultContent を `mergeFollowUpResult` で採用
5. いずれかの follow turn が error の場合、即座に error result を返す

AbortController は run() 全体に 1 本。N 段全 follow turn を同一 AbortController で覆う。

#### Scenario: N 段 follow-up が順番に実行される

- **GIVEN** `ctx.followUpPrompts` が `["rule-a prompt", "rule-b prompt"]` である
- **AND** 作業 turn が success で sessionId が取得されている
- **WHEN** `ClaudeCodeRunner.run(ctx)` を実行する
- **THEN** `queryFn` が 3 回呼ばれる (作業 turn + follow turn x2)
- **AND** 2 回目と 3 回目の呼び出しは `resume: sessionId` オプションを含む
- **AND** 2 回目の prompt は `"rule-a prompt"` である
- **AND** 3 回目の prompt は `"rule-b prompt"` である

#### Scenario: followUpPrompts が空の場合は作業 turn のみ

- **GIVEN** `ctx.followUpPrompts` が `undefined` または `[]` である
- **WHEN** `ClaudeCodeRunner.run(ctx)` を実行する
- **THEN** `queryFn` が 1 回のみ呼ばれる

#### Scenario: N 段 follow-up の modelUsage が累積される

- **GIVEN** 3 turn 実行 (作業 + follow x2) で各 turn が modelUsage を返す
- **WHEN** `ClaudeCodeRunner.run(ctx)` が完了する
- **THEN** 結果の modelUsage は 3 turn 分の per-model 加算である

#### Scenario: follow turn 中の AbortController が全 turn を覆う

- **GIVEN** `ctx.followUpPrompts` が `["a", "b", "c"]` で timeout が設定されている
- **WHEN** 2 turn 目の途中で AbortController が abort される
- **THEN** 残りの follow turn は実行されない
- **AND** timeout result が返される

### Requirement: Agent/Task tool の呼び出しを redirect する

SDK が LLM の init tools list に `Task` (= Agent の旧名) を強制告知するため、LLM が Agent tool を呼び出す可能性がある。Host 側は必ず応答 (tool_result) を返さなければならない (MUST)。応答なしによる hang を防止する。

#### Scenario: disallowedTools で Agent/Task を除外する
- **GIVEN** ClaudeCodeRunner が queryOptions を構築する
- **WHEN** query() を呼び出す
- **THEN** queryOptions に `disallowedTools: ["Agent", "Task"]` が含まれる
- **AND** SDK が `disallowedTools` をサポートしない場合は代替手段 (no-op agent handler 登録 or prompt-based) にフォールバックする

#### Scenario: Agent tool 呼び出しに redirect message を返す
- **GIVEN** LLM が Agent または Task tool を呼び出した
- **WHEN** SDK が tool dispatch を試みる
- **THEN** redirect message が tool_result として返される
- **AND** redirect message は教育的 text:「Subagent invocation is not available. Use Read, Grep, Edit, Bash, Write, and Glob tools directly.」相当

#### Scenario: redirect が上限回数を超えたら session を abort する
- **GIVEN** 同一 session 内で Agent/Task redirect が 3 回発火した
- **WHEN** 4 回目の Agent/Task tool 呼び出しが発生する
- **THEN** AbortController.abort() が呼ばれる
- **AND** step は error/timeout 経路で pipeline に戻る
- **AND** pipeline が escalation に倒す

### Requirement: additionalInstructions に Agent tool 使用禁止を明記する

buildAdditionalInstructions() は Agent/Task tool の使用禁止指示を出力に含めなければならない (SHALL)。インフラ制約の補助として prompt レベルでも LLM を誘導する。

#### Scenario: Agent/Task tool 禁止指示が additionalInstructions に含まれる
- **GIVEN** buildAdditionalInstructions() が呼ばれる
- **WHEN** 任意の step で additionalInstructions を構築する
- **THEN** 出力に「Do not use the Agent or Task tool」相当の指示が含まれる

### Requirement: Claude Code SDK query() に secret を除去した env を渡す

`ClaudeCodeRunner` および `LocalRuntime` が SDK `query()` を呼ぶ際、`env` オプションに
`process.env` から secret key を除去した env を渡さなければならない (MUST)。

除去対象: `GITHUB_TOKEN`, `SPECRUNNER_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`。

フィルタは `src/util/env-filter.ts` の `stripSecrets()` を使用する。
SDK の `env` オプション (`sdk.d.ts:1232`) は `process.env` を置換するため、
filtered env を渡すことで SDK が spawn する Claude Code プロセスから secret が除去される。

対象箇所:
1. `src/adapter/claude-code/agent-runner.ts` の `queryOptions` 構築
2. `src/core/runtime/local.ts` の `buildSdkOptions()` 戻り値

#### Scenario: agent-runner の queryOptions に env が含まれる

- **GIVEN** `process.env` に `GITHUB_TOKEN=ghp_xxx` が設定されている
- **WHEN** `ClaudeCodeRunner.run(ctx)` が `queryOptions` を構築する
- **THEN** `queryOptions.env` が存在する
- **AND** `queryOptions.env.GITHUB_TOKEN` が `undefined` である
- **AND** `queryOptions.env.PATH` が `process.env.PATH` と同値である

#### Scenario: local runtime の buildSdkOptions に env が含まれる

- **GIVEN** `process.env` に `ANTHROPIC_API_KEY=sk-xxx` が設定されている
- **WHEN** `LocalRuntime.buildSdkOptions()` を呼ぶ
- **THEN** 戻り値の `env` フィールドが存在する
- **AND** `env.ANTHROPIC_API_KEY` が `undefined` である
