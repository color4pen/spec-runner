# claude-code-runtime Delta Spec

## MODIFIED Requirements

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
