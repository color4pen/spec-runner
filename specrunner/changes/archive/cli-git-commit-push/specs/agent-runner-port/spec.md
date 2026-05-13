# agent-runner-port Delta Spec

## MODIFIED Requirements

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

## ADDED Requirements

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

## Clarification: StepExecutor の git 操作と verifyBranch/verifyPath の区別

ベースライン仕様に「StepExecutor が verifyBranch / verifyPath helper を保持しない」シナリオが存在する:

> **WHEN** `src/core/step/executor.ts` を grep する  
> **THEN** `verifyBranch` / `verifyPath` / `getFileContent` の helper 呼び出しは 0 マッチである

このシナリオの保証は **引き続き有効** である。`commitAndPush` は commit ライフサイクル操作（検証ではなく実行）であり、`verifyBranch` や `verifyPath` ヘルパーとは別物である。

- `verifyBranch` / `verifyPath` / `getFileContent` の grep-zero 保証は、これら **具体的なヘルパー名** に対してのみ適用される
- `commitAndPush` が executor.ts に追加されることで git subprocess 呼び出し（`git add`, `git commit`, `git push`）が executor に存在することになるが、これは **verification** ではなく **commit lifecycle** の操作であるため、ベースライン保証に違反しない
- `verifyBranch` / `verifyPath` / `getFileContent` という識別子は executor.ts に引き続き 0 マッチでなければならない
