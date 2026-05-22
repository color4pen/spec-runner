## Renamed

- "request-review は queryOneShot 経由で query() を呼び出す" → "reviewer / manager / generator は OneShotQueryClient port に依存する"

## Requirements

### Requirement: reviewer / manager / generator は OneShotQueryClient port に依存する

`src/core/request/reviewer.ts` の `runReview()` と `src/core/request/manager.ts` / `src/core/request/generator.ts` は MUST `OneShotQueryClient` port interface に依存し、adapter / SDK の直接 import を持たない。

`OneShotQueryClient` は `src/core/port/one-shot-query-client.ts` に定義され、`run(opts: OneShotQueryOptions): Promise<OneShotQueryResult>` メソッドを持つ。具象実装 `ClaudeCodeOneShotQueryClient` は `src/adapter/claude-code/` に配置され、既存の `queryOneShot()` 関数に委譲する。

composition point（`executeReview` / `executeCreate` の呼び出し元）が具象を生成し、core 層の関数に注入する。core 層の関数は default fallback を持たない（SDK に暗黙フォールバックしない）。

review 固有の責務（prompt 構築 / `parseReviewOutput` による structured JSON 抽出）は `runReview()` 側に残る。

#### Scenario: reviewer / manager / generator が OneShotQueryClient port に依存する

- **WHEN** `src/core/request/reviewer.ts` の import を inspect する
- **THEN** `OneShotQueryClient` が `../port/` から import されている
- **AND** `adapter/` からの import は存在しない
- **AND** `@anthropic-ai/` からの import は存在しない

#### Scenario: runReview が OneShotQueryClient を引数に受け取る

- **WHEN** `runReview()` の signature を inspect する
- **THEN** `client: OneShotQueryClient` が必須引数として存在する
- **AND** `queryFn` optional 引数は存在しない
- **AND** `config: SpecRunnerConfig` 引数は存在しない（client が内部に保持する）

#### Scenario: generator が SDK 型を直接 import しない

- **WHEN** `src/core/request/generator.ts` の import を inspect する
- **THEN** `@anthropic-ai/claude-agent-sdk` からの import は存在しない
- **AND** `OneShotQueryClient` が `../port/` から import されている
- **AND** `generate()` は `client.run()` 経由で query を実行する

#### Scenario: 既存 review の振る舞いが保たれる

- **GIVEN** `runReview()` が `OneShotQueryClient` 経由に置き換えられている
- **WHEN** 正常な query result が返される
- **THEN** `parseReviewOutput()` で structured result に変換される
- **AND** 既存の `RequestReviewResult` 型と同一の shape が返される
