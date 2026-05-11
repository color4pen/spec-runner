## Purpose

`specrunner run` 内部で実行される propose パイプラインの状態遷移、セッション構築方針、初回メッセージ規約、SSE 接続順序、`register_branch` 経由のブランチ反映、完了後の GitHub API 検証、エラーパスの履歴記録ルールを定義する。
## Requirements
### Requirement: propose パイプラインは状態マシンで進捗を管理する

`specrunner run` 内部の propose 処理は MUST 以下の遷移で動作する: `init` → `session-create` → `events-stream-connected` → `initial-message-sent` → `running` → (`register-branch-received` を 0 回以上)? → `idle-end-turn-detected` → `branch-verified` → `change-folder-verified` → `propose-step-completed`。各遷移は SHALL state file の `history` に append される。propose step 完了後、runPipeline は spec-review step を起動する。

#### Scenario: 正常完了

- **WHEN** Agent が初回応答で標準ツールのみを使い、その後 `register_branch` を 1 回呼んで idle+end_turn で完了する
- **THEN** state.history に `init`, `session-create`, `events-stream-connected`, `initial-message-sent`, `register-branch-received`, `idle-end-turn-detected`, `branch-verified`, `change-folder-verified`, `propose-step-completed` の entry が記録され、state.steps["propose"] に session 情報が記録される

#### Scenario: register_branch が呼ばれずに完了

- **WHEN** Agent が `register_branch` を呼ばずに idle+end_turn になる
- **THEN** state.status は `failed` になり、`error.code = "BRANCH_NOT_REGISTERED"` を含み、`Branch was not registered by the agent.` を stderr に出力する。spec-review step は SHALL 起動されない

### Requirement: propose セッションは標準ツール + custom_tools = [register_branch] で作成される

`sessions.create` 呼び出し時、Agent には MUST 標準 toolset (`agent_toolset_20260401`) と custom_tools として `register_branch` のみが結合された Agent が指定される。リソースとしては SHALL 対象 GitHub リポジトリが `authorization_token` 付きでマウントされる。

#### Scenario: セッション作成パラメータ

- **WHEN** propose セッションを作成する
- **THEN** リクエストボディは `agent: { id, type: "agent" }`、`environment_id`、`resources: [{ type: "github_repository", repository: { owner, name }, authorization_token }]` を含む

### Requirement: propose セッションには初回メッセージとして system prompt 派生のテンプレートを送る

セッション作成直後、CLI は MUST `events.send` で `user.message` 1 件を送信する。本文には request.md の `title`、`type`、`content`、ターゲット `change-folder` パス（`openspec/changes/<slug>/`）、有効化された opt-in フラグを含める。ユーザー入力は SHALL `<user-request>...</user-request>` XML タグで囲み、プロンプトインジェクションを構造的に防御する。

#### Scenario: 初回メッセージ送信

- **WHEN** propose セッションが作成された直後
- **THEN** `events.send` が 1 度呼ばれ、events 配列に 1 件の `user.message` イベントが含まれ、本文に `<user-request>` と `</user-request>` の対が存在する

### Requirement: SSE stream はセッション作成後に接続される

完了検知の取りこぼし防止のため、`events.stream` の接続は MUST `events.send` で初回メッセージを送信する **前** に確立される。CLI は SHALL この順序を逆転させない。

#### Scenario: ストリーム接続順序

- **WHEN** propose セッションを起動する
- **THEN** `events.stream(session.id)` の呼び出しが `events.send(session.id, ...)` の呼び出しより先に発生する

### Requirement: パイプラインは register_branch を介して branch 名を state に反映する

Custom Tool `register_branch` のハンドラが呼ばれたとき、CLI は MUST 入力 `branch` の文字列を state file の `branch` フィールドに書き込み、history に SHALL `{ step: "register-branch-received", status: "ok", message: <branch> }` を append する。

#### Scenario: 単発呼び出し

- **WHEN** Agent が `register_branch({ branch: "feat/2026-04-27-foo" })` を呼ぶ
- **THEN** state.branch が `feat/2026-04-27-foo` になり、history に register-branch-received が 1 件追加される

#### Scenario: 連続呼び出し（last-write-wins）

- **WHEN** Agent が `register_branch` を続けて 2 回呼び、最後の入力が `branch: "feat/v2"` である
- **THEN** state.branch が `feat/v2` になり、history に register-branch-received が 2 件追加される

### Requirement: 完了後にブランチおよび change folder の存在を GitHub API で検証する

idle+end_turn を検知後、state.branch が非 null であれば、CLI は MUST 以下の 2 段階で GitHub API を用いて検証する:

1. **ブランチ存在確認**: `GET /repos/{owner}/{name}/branches/{branch}` で 200 を確認する
2. **change folder 存在確認**: `GET /repos/{owner}/{name}/contents/openspec/changes/{slug}?ref={branch}` で 200 を確認する

ブランチ存在確認の失敗（404）は warning（`branch-verified` を `warning` で append）にとどめ、state.status は SHALL `success` のままとする。change folder が存在しない（404）場合は SHALL `failed` としてマークし、`error.code = "CHANGE_FOLDER_NOT_FOUND"` を設定する。

#### Scenario: ブランチが存在する

- **WHEN** GitHub API が 200 でブランチ情報を返す
- **THEN** history に `branch-verified` を `ok` で append する

#### Scenario: ブランチが GitHub に存在しない

- **WHEN** `GET /repos/{owner}/{name}/branches/{branch}` が 404 を返す
- **THEN** history に `branch-verified` を `warning` で append し、`Branch '<name>' was registered but not found on GitHub.` を stderr に出力する。state.status は `success` のまま

#### Scenario: change folder が存在する

- **WHEN** `GET /repos/{owner}/{name}/contents/openspec/changes/{slug}?ref={branch}` が 200 を返す
- **THEN** history に `change-folder-verified` を `ok` で append する

#### Scenario: change folder が存在しない

- **WHEN** `GET /repos/{owner}/{name}/contents/openspec/changes/{slug}?ref={branch}` が 404 を返す
- **THEN** state.status を `failed`、error.code を `CHANGE_FOLDER_NOT_FOUND` に設定し、`Change folder 'openspec/changes/<slug>' not found on branch '<branch>'.` を stderr に出力する

#### Scenario: GitHub API が 401 を返す（ブランチ or change folder 確認時）

- **WHEN** いずれかの GitHub API 呼び出しで 401 が返る
- **THEN** state.status を `failed`、error.code を `GITHUB_TOKEN_EXPIRED` に設定し、`GitHub token expired. Run 'specrunner login' again.` を stderr に出力する

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

### Requirement: propose は runPipeline 配下の最初の step として実装される

propose 処理は MUST `src/core/steps/propose.ts` の `runProposeStep(state, deps)` として実装される。`src/core/pipeline.ts` の `runProposePipeline` は SHALL 削除する（内部 API のため後方互換要件なし）。`src/cli/run.ts` の call site は SHALL `runPipeline` を直接呼び出す形に置換される。

#### Scenario: runProposeStep の呼び出し

- **WHEN** runPipeline が propose step を実行する
- **THEN** `runProposeStep(state, deps)` が呼ばれ、戻り値の state には `state.steps["propose"]` が含まれる

