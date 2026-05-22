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

### Requirement: ClaudeCodeRunner は followUpPrompt 指定時に 2 段実行する

`ClaudeCodeRunner.run(ctx)` SHALL `ctx.followUpPrompt` が指定されている場合、作業 turn 完了後に同一 session で follow プロンプトを 1 本投げる 2 段実行を行う。

2 段実行の手順:

1. 作業 turn を実行 (既存の `queryFn` 呼び出し)
2. 作業 turn の result から `session_id` を取得する
3. `queryFn` を 2 回目で `resume: session_id` option 付きで呼び出し、`ctx.followUpPrompt` を prompt として渡す
4. follow turn 完了後の result を最終 result として返す

`ctx.followUpPrompt` が未指定の場合は `if (!ctx.followUpPrompt) return result;` 相当の早期 return で既存パスを汚さず分離する。

#### Scenario: followUpPrompt 指定時に 2 回 query が呼ばれる

- **GIVEN** `ctx.followUpPrompt` が設定されている
- **WHEN** `ClaudeCodeRunner.run(ctx)` を実行する
- **THEN** `queryFn` が 2 回呼ばれる
- **AND** 1 回目は `fullPrompt` (作業 turn)
- **AND** 2 回目は `ctx.followUpPrompt` で `resume: sessionId` option 付き

#### Scenario: follow turn が同一 session を resume する

- **GIVEN** 作業 turn の result が `session_id: "sess-abc"` を返す
- **WHEN** follow turn の `queryFn` 呼び出しを inspect する
- **THEN** options に `resume: "sess-abc"` が含まれる

#### Scenario: followUpPrompt 未指定時は 1 回のみ

- **GIVEN** `ctx.followUpPrompt` が undefined である
- **WHEN** `ClaudeCodeRunner.run(ctx)` を実行する
- **THEN** `queryFn` が 1 回のみ呼ばれる
- **AND** result は従来と同一構造である

### Requirement: ClaudeCodeRunner は作業 turn と follow turn の modelUsage を加算して session 総量とする

`ClaudeCodeRunner` SHALL 作業 turn と follow turn の `modelUsage` を per-model で加算し、session 総量として最終 result に採用する。

follow turn は `resume` による別 query invocation であり、follow query の `modelUsage` はその invocation 単体の usage (= 履歴 re-read を input に含む) であって session 累積ではない。真の総コストは作業 query と follow query の加算で得られるため、両者を per-model で合算する MUST。

作業 turn のみの場合は従来通りその turn の `modelUsage` を返す。

#### Scenario: 作業 turn と follow turn の modelUsage が加算される

- **GIVEN** 作業 turn の `modelUsage` が `{ inputTokens: 1000, outputTokens: 200 }` である
- **AND** follow turn の `modelUsage` が `{ inputTokens: 1200, outputTokens: 150 }` である
- **WHEN** `ClaudeCodeRunner.run(ctx)` の result を inspect する
- **THEN** `result.modelUsage` は両者の per-model 加算 (`{ inputTokens: 2200, outputTokens: 350 }`) である

### Requirement: ClaudeCodeRunner は follow turn を既存 AbortController で timeout する

ClaudeCodeRunner の 2 段実行 SHALL 既存の AbortController を作業 turn と follow turn で共有する。turn ごとに個別の timeout を設けない。

作業 turn + follow turn の合算が wall-clock timeout 1 本として有効になる。

#### Scenario: timeout が作業 turn + follow turn 合算で適用される

- **GIVEN** `resolvedConfig.timeoutMs` が 60000ms である
- **AND** 作業 turn が 50000ms かかる
- **WHEN** follow turn が 15000ms 目に到達する (合計 65000ms)
- **THEN** AbortController が abort する
- **AND** result は `completionReason: "timeout"` である
