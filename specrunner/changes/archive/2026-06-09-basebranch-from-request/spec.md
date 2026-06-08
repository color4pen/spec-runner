# Spec: adapter baseBranch sourced from request

## Requirements

### Requirement: Adapters SHALL source StepContext baseBranch from the request base branch

各 agent runner adapter（claude-code / codex / managed-agent）は `StepContext` を構築する際、`request.baseBranch` を `AgentRunInput.requestBaseBranch` の値で設定 SHALL する。`requestBaseBranch` が `undefined` の場合に限り、後方互換のため `"main"` に fallback MUST する。

`StepExecutor` は `AgentRunContext.input` を組み立てる際、`requestBaseBranch` に `deps.request.baseBranch`（`ParsedRequest.baseBranch`）を設定 SHALL する。

#### Scenario: non-default base branch propagates to StepContext

**Given** `requestBaseBranch` が `"develop"` に設定された `AgentRunContext`
**When** adapter の `run()` が StepContext を構築し step の `buildMessage` を呼ぶ
**Then** その StepContext の `request.baseBranch` は `"develop"` である

#### Scenario: missing requestBaseBranch falls back to main

**Given** `requestBaseBranch` を含まない（`undefined`）`AgentRunContext`
**When** adapter の `run()` が StepContext を構築し step の `buildMessage` を呼ぶ
**Then** その StepContext の `request.baseBranch` は `"main"` である

#### Scenario: executor fills requestBaseBranch from parsed request

**Given** `deps.request.baseBranch` が `"develop"` の `PipelineDeps` で実行される agent step
**When** `StepExecutor` が adapter へ渡す `AgentRunContext.input` を構築する
**Then** `input.requestBaseBranch` は `"develop"` である
