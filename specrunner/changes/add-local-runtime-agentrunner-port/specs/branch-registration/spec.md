## MODIFIED Requirements

### Requirement: register_branch Database Persistence

The `register_branch` handler SHALL update the `requests` table with the reported `branch_name`.

#### Scenario: Update branch_name on request

- **WHEN** `register_branch` is called with a valid `request_id` and `branch_name`
- **THEN** the handler updates `requests.branch_name` to the CLI canonical value (`ctx.branch`) and `requests.updated_at` to the current timestamp
- **AND** the agent-reported `branch_name` input is used only to detect mismatch; the CLI canonical value is what is persisted

#### Scenario: Request not found

- **WHEN** `register_branch` is called with a `request_id` that does not exist in the database
- **THEN** the handler returns an error result: "Request not found"

#### Scenario: Idempotent re-registration (last-write-wins)

- **WHEN** `register_branch` is called with a `request_id` that already has a non-null `branch_name` in the database
- **THEN** the handler overwrites the existing `branch_name` with the CLI canonical value (last-write-wins semantics applies only to agent-to-agent re-registrations; the CLI canonical branch always takes precedence over any agent-reported value)

#### Scenario: Successful result returned to agent

- **WHEN** the database update succeeds
- **THEN** the handler returns a success result containing the confirmed `branch_name` and `slug`, so the agent can verify the registration

## ADDED Requirements

### Requirement: branch-registration の機構は runtime === "managed" のみで作動する

`register_branch` Custom Tool 経由の branch 登録 / DB persistence / RequestSummary への `branchName` 反映は MUST `runtime: "managed"` のときのみ作動する。`runtime: "local"` の場合、CLI は SHALL agent からの `register_branch` 呼び出しを期待せず、`requests.branch_name` の DB 更新も発生しない。local mode では state.branch は CLI が決定した `feat/<slug>` の正規値が in-memory で保持され、必要に応じて `JobStateStore` 経由で永続化される。

#### Scenario: local runtime で DB 更新が発生しない

- **GIVEN** `config.runtime === "local"` で ProposeStep を実行する
- **WHEN** pipeline が ProposeStep を完走する
- **THEN** `requests` table の `branch_name` カラム更新は発生しない
- **AND** `register_branch` Custom Tool への dispatch も発生しない

#### Scenario: managed runtime では既存挙動を維持する

- **GIVEN** `config.runtime === "managed"` で ProposeStep を実行する
- **WHEN** agent が `register_branch({ branch: "feat/foo", slug: "foo" })` を呼ぶ
- **THEN** 既存の DB 更新 / RequestSummary 反映 / agent 戻り値 `{ ok: true, ... }` の挙動が完全に保たれる
- **AND** ただし CLI 側は `ManagedAgentRunner` 経由で「CLI 入力 branch（`ctx.branch`）と agent 申告値の不一致」を検知し、不一致時は warning を出して CLI 値を canonical に保持する

### Requirement: CLI 主導 branch が canonical である

`runtime` 値に関わらず、CLI は MUST `feat/<slug>` から決定論的に算出した branch を canonical として保持する。`register_branch` から渡された値（managed runtime）または agent 報告（local runtime）は SHALL CLI の canonical 値を override しない。CLI は SHALL agent からの値が CLI の期待値と一致しない場合は stderr に warning を出力する。

#### Scenario: managed runtime で agent が異なる branch を申告

- **GIVEN** `ctx.branch === "feat/foo"` で agent が `register_branch({ branch: "feat/other" })` を呼ぶ
- **WHEN** ManagedAgentRunner が dispatch を処理する
- **THEN** `state.branch === "feat/foo"` のまま保持される
- **AND** stderr に「CLI canonical branch (feat/foo) differs from agent-reported branch (feat/other)」相当の warning が出力される
- **AND** DB の `requests.branch_name` には CLI canonical 値 `"feat/foo"` が書き込まれる（agent の値ではない）

#### Scenario: local runtime では agent 申告経路自体が存在しない

- **GIVEN** `config.runtime === "local"`
- **WHEN** ProposeStep が完了する
- **THEN** state.branch === ctx.branch === `"feat/<slug>"` であり、agent の申告経路は存在しない
- **AND** `git branch --list <ctx.branch>` で実体検証され、不存在は error として扱われる
