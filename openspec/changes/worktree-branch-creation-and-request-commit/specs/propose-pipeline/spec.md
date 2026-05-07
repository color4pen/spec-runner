## MODIFIED Requirements

### Requirement: propose パイプラインは状態マシンで進捗を管理する

`specrunner run` 内部の propose 処理は MUST 以下の遷移で動作する: `init` → `session-create` → `events-stream-connected` → `initial-message-sent` → `running` → `idle-end-turn-detected` → `change-folder-verified` → `propose-step-completed`。`register-branch-received` 遷移は MUST 削除する（branch は CLI が `setupWorkspace()` で事前に作成し `jobState.branch` に記録済みであるため）。`branch-verified` 遷移も MUST 削除する（branch は CLI が作成したため existence verification は不要）。各遷移は SHALL state file の `history` に append される。

#### Scenario: 正常完了

- **WHEN** Agent が初回応答で標準ツールのみを使い、change folder を作成して idle+end_turn で完了する
- **THEN** state.history に `init`, `session-create`, `events-stream-connected`, `initial-message-sent`, `idle-end-turn-detected`, `change-folder-verified`, `propose-step-completed` の entry が記録される
- **AND** `register-branch-received` の entry は存在しない
- **AND** `state.branch` は propose 開始前に既に設定されている

### Requirement: propose セッションは標準ツール + custom_tools = [register_branch] で作成される

`sessions.create` 呼び出し時、Agent には MUST 標準 toolset (`agent_toolset_20260401`) が指定される。custom_tools として `register_branch` は SHALL 含めない（branch は CLI が事前に作成済みであるため tool 自体が不要）。リソースとしては SHALL 対象 GitHub リポジトリが `authorization_token` 付きでマウントされる。

#### Scenario: セッション作成パラメータ

- **WHEN** propose セッションを作成する
- **THEN** リクエストボディは `agent: { id, type: "agent" }`、`environment_id`、`resources: [{ type: "github_repository", repository: { owner, name }, authorization_token }]` を含む
- **AND** `custom_tools` 配列に `register_branch` が含まれない

### Requirement: 完了後にブランチおよび change folder の存在を GitHub API で検証する

idle+end_turn を検知後、CLI は MUST change folder の存在を検証する。branch の存在確認は不要（CLI が `setupWorkspace()` で作成済みであるため）。

1. **change folder 存在確認**: `GET /repos/{owner}/{name}/contents/openspec/changes/{slug}?ref={branch}` で 200 を確認する

change folder が存在しない（404）場合は SHALL `failed` としてマークし、`error.code = "CHANGE_FOLDER_NOT_FOUND"` を設定する。

#### Scenario: change folder が存在する

- **WHEN** `GET /repos/{owner}/{name}/contents/openspec/changes/{slug}?ref={branch}` が 200 を返す
- **THEN** history に `change-folder-verified` を `ok` で append する

#### Scenario: change folder が存在しない

- **WHEN** `GET /repos/{owner}/{name}/contents/openspec/changes/{slug}?ref={branch}` が 404 を返す
- **THEN** state.status を `failed`、error.code を `CHANGE_FOLDER_NOT_FOUND` に設定し、`Change folder 'openspec/changes/<slug>' not found on branch '<branch>'.` を stderr に出力する

#### Scenario: GitHub API が 401 を返す（change folder 確認時）

- **WHEN** GitHub API 呼び出しで 401 が返る
- **THEN** state.status を `failed`、error.code を `GITHUB_TOKEN_EXPIRED` に設定し、`GitHub token expired. Run 'specrunner login' again.` を stderr に出力する

### Requirement: パイプライン失敗遷移は固定の history entry と status で記録する

propose パイプラインの各エラーパスは MUST 以下の表に従い `history` entry と最終 `state.status` を設定する。`BRANCH_NOT_REGISTERED` エラーパスは削除する（branch は CLI が事前に作成済みであるため）。

| エラー条件 | history step 名 | history status | state.status | error.code |
|-----------|----------------|---------------|-------------|-----------|
| セッション作成失敗 | `session-create` | `error` | `failed` | `SESSION_CREATE_FAILED` |
| タイムアウト（30 分超過） | `session-timeout` | `error` | `failed` | `SESSION_TIMEOUT` |
| Anthropic 側 terminated 観測 | `session-terminated` | `error` | `failed` | `SESSION_TERMINATED` |
| GitHub token 期限切れ | `change-folder-verified` | `error` | `failed` | `GITHUB_TOKEN_EXPIRED` |
| change folder 不在 | `change-folder-verified` | `error` | `failed` | `CHANGE_FOLDER_NOT_FOUND` |

#### Scenario: SESSION_TIMEOUT

- **WHEN** ポーリング開始から 30 分を超えてもセッションが完了しない
- **THEN** history に `{ step: "session-timeout", status: "error" }` を append し、state.status を `failed`、error.code を `SESSION_TIMEOUT` に設定する

#### Scenario: SESSION_TERMINATED

- **WHEN** ポーリングまたは SSE で `status: "terminated"` を観測する
- **THEN** history に `{ step: "session-terminated", status: "error" }` を append し、state.status を `failed`、error.code を `SESSION_TERMINATED` に設定する

#### Scenario: CHANGE_FOLDER_NOT_FOUND

- **WHEN** `GET /repos/{owner}/{name}/contents/openspec/changes/{slug}?ref={branch}` が 404 を返す
- **THEN** history に `{ step: "change-folder-verified", status: "error" }` を append し、state.status を `failed`、error.code を `CHANGE_FOLDER_NOT_FOUND` に設定する

### Requirement: propose は runPipeline 配下の最初の step として実装される

propose 処理は MUST `src/core/steps/propose.ts` の `ProposeStep` として実装される。`ProposeStep.buildMessage()` は CLI が事前に設定した `state.branch` を使用する。pipeline が実行される時点で `state.branch` は既に非 null である。

#### Scenario: propose step 開始時に branch が設定済み

- **WHEN** runPipeline が propose step を実行する
- **THEN** `state.branch` は非 null（`setupWorkspace()` で設定済み）
- **AND** `ProposeStep.buildMessage()` は `state.branch` の値を prompt に含める

## REMOVED Requirements

### Requirement: パイプラインは register_branch を介して branch 名を state に反映する
**Reason**: branch 名は CLI が `setupWorkspace()` で決定し `jobState.branch` に propose 実行前に記録する。agent が branch 名を CLI に通知する仕組みが不要になったため。
**Migration**: `setupWorkspace()` で `jobState.branch` に branch 名を設定する。propose agent は既存 branch 上で作業する。

#### Scenario: register_branch 経路の削除確認
- **WHEN** propose パイプラインの状態遷移を確認する
- **THEN** `register-branch-received` の遷移が存在しない
- **AND** `BRANCH_NOT_REGISTERED` エラーパスが存在しない
