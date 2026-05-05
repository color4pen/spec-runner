## ADDED Requirements

### Requirement: AgentSyncer は runtime === "local" では起動されない

CLI composition root は MUST `config.runtime === "local"` のとき `AgentSyncer.syncAll()` を呼ばない。`AgentSyncer` 自身のソースは SHALL この gating を持たない（呼び出し側 = `specrunner init` および `specrunner run` の起動経路で gating する）。

`runtime === "managed"` のときは既存挙動通り `AgentSyncer.syncAll()` が起動され、Agent の create / retrieve / update / 404 fallback が行われる。

#### Scenario: local runtime で init 中に syncAll が呼ばれない

- **GIVEN** `specrunner init --runtime local` を実行する
- **WHEN** init が処理される
- **THEN** `AgentSyncer.syncAll()` の呼び出しは 0 回である
- **AND** Anthropic API への HTTP リクエストは 0 件である

#### Scenario: local runtime で run 中に syncAll が呼ばれない

- **GIVEN** `config.runtime === "local"` で `specrunner run` を実行する
- **WHEN** pipeline が起動する
- **THEN** `AgentSyncer.syncAll()` の呼び出しは 0 回である
- **AND** AgentSyncer のコンストラクタ自体が呼ばれてもよい（startup での dependency 注入順による）が、`syncAll()` 経路には入らない

#### Scenario: managed runtime では既存挙動を維持

- **GIVEN** `specrunner init --runtime managed`（または `--runtime` 未指定で managed default）を実行する
- **WHEN** init が処理される
- **THEN** `AgentSyncer.syncAll()` が 1 回呼ばれる
- **AND** 既存の create / retrieve / update / 404 fallback / rollback の挙動が完全に保たれる
- **AND** AgentSyncer のソース（`src/core/syncer/` 配下）の変更行は 0 である
