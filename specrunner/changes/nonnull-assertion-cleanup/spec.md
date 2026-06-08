# Spec: managed-agent adapter の safe access による fail-fast 挙動

## Requirements

### Requirement: managed environment 未設定時はクラッシュではなく明確なエラーで throw する

`ManagedAgentRunner` が managed session を作成する全経路（design-style / polling-style /
resume fallback）において、`config.environment` が `undefined` の場合、SHALL に従い
`config.environment!.id` のような非 null アサーションでクラッシュさせず、何が足りないか
（managed environment が未登録）と対処法（`specrunner managed setup` の実行）を含む明確な
エラーメッセージで throw すること。エラーは `ENVIRONMENT_NOT_SET` を識別子として持つ。

#### Scenario: polling-style step で environment 未設定

**Given** `config.environment` が `undefined` の managed runtime
**When** polling-style の step（例: spec-review）で `run()` を実行する
**Then** `ENVIRONMENT_NOT_SET` を識別子とする明確なメッセージで throw し、`TypeError` の
未捕捉クラッシュにはならない

#### Scenario: design-style step で environment 未設定

**Given** `config.environment` が `undefined` の managed runtime
**When** design-style の step で `run()` を実行する
**Then** session 作成前に `ENVIRONMENT_NOT_SET` を識別子とする明確なメッセージで throw する

### Requirement: session が確立されなかった場合は明確なエラーで throw する

`createOrResumePollingSession` は、session id が確立されないまま戻る経路を MUST に従い
非 null アサーション `return sessionId!` ではなく明示的な undefined ガードで処理し、
session が確立されなかった旨と対処法を含む明確なメッセージで throw すること。

#### Scenario: createSession が session id を返さない

**Given** `SessionClient.createSession` が `{ sessionId: undefined }` を resolve する
（不正な provider 応答）
**When** polling-style の `run()` が新規 session 作成経路を通る
**Then** undefined の session id を下流へ伝播させず、session 未確立を示す明確なメッセージで throw する

### Requirement: branch が null の場合は明確なエラーで throw する

`fetchResultFile` は、`state.branch` が `null` の場合、MUST に従い `state.branch!` ではなく
明示的な null ガードで処理し、`BRANCH_NOT_SET` を識別子とする明確なメッセージで throw すること。

#### Scenario: polling-style run で branch が null

**Given** `state.branch` が `null` の managed runtime
**When** polling-style の step で `run()` を実行する
**Then** `BRANCH_NOT_SET` を識別子とする明確なメッセージで throw し、null branch を
GitHub API 呼び出しへ伝播させない
