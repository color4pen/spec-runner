# Spec: one-shot SDK query の env を stripSecrets 経由に統一し、env-omission を歯で固定する

## Requirements

### Requirement: one-shot の SDK query は stripSecrets を通した env を必ず渡す

`queryOneShot` は Claude Agent SDK の `query()` を呼ぶとき、options に `env` キーを
含め、その値を `stripSecrets(process.env)` と等しくしなければならない（MUST）。env を
省略して SDK に親プロセスの `process.env` を継承させては**ならない**（MUST NOT）。この
strip 経路は `agent-runner.ts` の SDK query env と同一（`util/env-filter` の
`stripSecrets`）でなければならない（SHALL）。

one-shot の他の query options（`cwd` / `allowedTools` の既定 `["Read", "Bash",
"Grep", "Glob"]` / `permissionMode: "bypassPermissions"` / `maxTurns` / `model` /
`systemPrompt` / `abortController` / timeout 挙動）は変更しては**ならない**（MUST NOT）。
one-shot には `CLAUDE_CODE_OAUTH_TOKEN` その他の明示 env 値の注入を追加しては**ならない**
（MUST NOT）。

#### Scenario: one-shot query options に stripSecrets 由来の env が渡る

**Given** 注入した `queryFn` で `options` を捕捉できる状態で `queryOneShot` を実行する
**When** `queryOneShot` が SDK query を呼ぶ
**Then** 捕捉した `options.env` が定義されている（undefined でない）
**And** `options.env` が `stripSecrets(process.env)` と構造的に等しい

#### Scenario: env 以外の one-shot 挙動は不変

**Given** `queryOneShot` を既定オプションで実行する
**When** SDK query の `options` を捕捉する
**Then** `permissionMode` は `"bypassPermissions"`
**And** `allowedTools` は `["Read", "Bash", "Grep", "Glob"]`
**And** `sandbox` キーと `canUseTool` キーは存在しない

### Requirement: one-shot の SDK env は secret を除去し非 secret を保持する

`queryOneShot` が SDK query に渡す env は、事前に `process.env` へ設定した secret キー
（例 `GH_TOKEN`）を含んでは**ならず**（MUST NOT）、非 secret キー（例 `PATH`）を保持
していなければならない（MUST）。

#### Scenario: 事前設定した secret が one-shot env から除去される

**Given** `process.env.GH_TOKEN` に値を設定し、`process.env.PATH` が存在する状態
**When** `queryOneShot` を実行し SDK query の `options.env` を捕捉する
**Then** 捕捉した env は `GH_TOKEN` キーを含まない
**And** 捕捉した env は `PATH` キーを含む

### Requirement: env-omission を歯が red にすることを検出テストで固定する

env-omission（query site が env を渡さない状態）と secret 混入を機械的に検出する純粋
述語を歯の判定核とし、その述語が両者を違反として報告することをテストで固定しなければ
ならない（SHALL）。述語は、捕捉した env が undefined のとき（env-omission）と、env が
`SECRET_DENYLIST` のいずれかのキーを含むとき（secret 混入）に非空の違反リストを返し、
strip 済み env に対しては空リストを返さなければならない（MUST）。実挙動固定テストと
検出テストは同一述語を共有しなければならない（SHALL）。

#### Scenario: env-omission が違反として検出される

**Given** 捕捉した env として `undefined`（query site が env を省略した状態）を与える
**When** 判定述語を適用する
**Then** 述語は非空の違反リストを返す（env-omission が red）

#### Scenario: secret 混入が違反として検出される

**Given** 捕捉した env として secret キー（例 `GH_TOKEN`）を含むオブジェクトを与える
**When** 判定述語を適用する
**Then** 述語は当該 secret の混入を示す違反を含むリストを返す

#### Scenario: strip 済み env は違反なしと判定される

**Given** 実 `queryOneShot` から捕捉した SDK env（`stripSecrets(process.env)` 由来）を与える
**When** 判定述語を適用する
**Then** 述語は空の違反リストを返す（準拠）

### Requirement: 既存の B-6 grep 歯と arch-allowlist は無変更で green

`tests/unit/architecture/core-invariants.test.ts` の B-6 grep 歯（raw `process.env`
検出）と `tests/unit/architecture/arch-allowlist.ts` は、検査ロジック・allowlist entry
とも変更しては**ならない**（MUST NOT）。one-shot に追加する env 行は `stripSecrets` を
含むため、既存 grep 歯の seam 除外フィルタに安全判定され、新規 violation を生じさせては
**ならない**（MUST NOT）。

#### Scenario: 既存 B-6 grep 歯が無変更で緑を保つ

**Given** one-shot に `env: stripSecrets(process.env …)` を追加した完了状態
**When** `bun run test` を実行する
**Then** B-6 grep 歯は検査ロジック無変更で pass する
**And** `arch-allowlist.ts` に B-6 の新 entry が追加されていない

### Requirement: codex・agent-runner・one-shot 以外の既存凍結テストは無変更で green

codex adapter・`agent-runner.ts`・one-shot 以外の経路の挙動を変更しては**ならない**
（MUST NOT）。one-shot の既存凍結テスト（sandbox キー不在・canUseTool キー不在・
permissionMode・allowedTools を固定するもの）は、`env` キー追加後も無変更で green で
なければならない（MUST）。

#### Scenario: typecheck と test が green

**Given** 本 change の完了状態
**When** `bun run typecheck && bun run test` を実行する
**Then** すべての既存テストと新規テストが pass する
**And** one-shot / codex の既存凍結テストは無変更で pass する
