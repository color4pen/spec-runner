## MODIFIED Requirements

### Requirement: パイプライン失敗遷移は固定の history entry と status で記録する

propose パイプラインの各エラーパスは MUST 以下の表に従い `history` entry と最終 `state.status` を設定する。実装者はこの表を唯一の正として扱い、entry 名・status を勝手に変えてはならない。

| エラー条件 | history step 名 | history status | state.status | error.code |
|-----------|----------------|---------------|-------------|-----------|
| セッション作成失敗 | `session-create` | `error` | `failed` | `SESSION_CREATE_FAILED` |
| Anthropic 側 terminated 観測 | `session-terminated` | `error` | `failed` | `SESSION_TERMINATED` |
| register_branch 未受信で完了 | `idle-end-turn-detected` | `error` | `failed` | `BRANCH_NOT_REGISTERED` |
| GitHub token 期限切れ | `branch-verified` | `error` | `failed` | `GITHUB_TOKEN_EXPIRED` |
| change folder 不在 | `change-folder-verified` | `error` | `failed` | `CHANGE_FOLDER_NOT_FOUND` |

`SESSION_TIMEOUT` 行は本表から MUST 除外される。step session の wall-clock timeout は撤廃され（`session-completion-detection` spec の delta を参照）、新規 job では `error.code === "SESSION_TIMEOUT"` は発生しない。旧 state file は読み取り時に `SESSION_TERMINATED` に lazy 変換される（`job-state-store` spec の delta を参照）。

#### Scenario: SESSION_TERMINATED

- **WHEN** ポーリングまたは SSE で `status: "terminated"` を観測する
- **THEN** history に `{ step: "session-terminated", status: "error" }` を append し、state.status を `failed`、error.code を `SESSION_TERMINATED` に設定する

#### Scenario: BRANCH_NOT_REGISTERED

- **WHEN** idle+end_turn を検知した時点で state.branch が null
- **THEN** history に `{ step: "idle-end-turn-detected", status: "error" }` を append し、state.status を `failed`、error.code を `BRANCH_NOT_REGISTERED` に設定する

#### Scenario: CHANGE_FOLDER_NOT_FOUND

- **WHEN** `GET /repos/{owner}/{name}/contents/openspec/changes/{slug}?ref={branch}` が 404 を返す
- **THEN** history に `{ step: "change-folder-verified", status: "error" }` を append し、state.status を `failed`、error.code を `CHANGE_FOLDER_NOT_FOUND` に設定する

#### Scenario: 新規 job で SESSION_TIMEOUT は発生しない

- **WHEN** propose セッションが長時間（例: 1 時間以上）処理を継続する
- **THEN** wall-clock timeout 起因の `SESSION_TIMEOUT` error は発生せず、history にも `session-timeout` entry は append されない
- **AND** 終端は idle+end_turn 検知 / SSE disconnect / Anthropic 側 `terminated` 観測 / 手動 cancel のいずれかで起きる
