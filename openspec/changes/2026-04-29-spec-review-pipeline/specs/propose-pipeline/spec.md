## MODIFIED Requirements

### Requirement: propose パイプラインは状態マシンで進捗を管理する

`specrunner run` 内部の propose 処理は MUST 以下の遷移で動作する: `init` → `session-create` → `events-stream-connected` → `initial-message-sent` → `running` → (`register-branch-received` を 0 回以上)? → `idle-end-turn-detected` → `branch-verified` → `change-folder-verified` → `propose-step-completed`。各遷移は SHALL state file の `history` に append される。propose step 完了後、runPipeline は spec-review step を起動する。

#### Scenario: 正常完了

- **WHEN** Agent が初回応答で標準ツールのみを使い、その後 `register_branch` を 1 回呼んで idle+end_turn で完了する
- **THEN** state.history に `init`, `session-create`, `events-stream-connected`, `initial-message-sent`, `register-branch-received`, `idle-end-turn-detected`, `branch-verified`, `change-folder-verified`, `propose-step-completed` の entry が記録され、state.steps["propose"] に session 情報が記録される

#### Scenario: register_branch が呼ばれずに完了

- **WHEN** Agent が `register_branch` を呼ばずに idle+end_turn になる
- **THEN** state.status は `failed` になり、`error.code = "BRANCH_NOT_REGISTERED"` を含み、`Branch was not registered by the agent.` を stderr に出力する。spec-review step は SHALL 起動されない

### Requirement: propose は runPipeline 配下の最初の step として実装される

propose 処理は MUST `src/core/steps/propose.ts` の `runProposeStep(state, deps)` として実装される。`src/core/pipeline.ts` の `runProposePipeline` は SHALL 削除する（内部 API のため後方互換要件なし）。`src/cli/run.ts` の call site は SHALL `runPipeline` を直接呼び出す形に置換される。

#### Scenario: runProposeStep の呼び出し

- **WHEN** runPipeline が propose step を実行する
- **THEN** `runProposeStep(state, deps)` が呼ばれ、戻り値の state には `state.steps["propose"]` が含まれる
