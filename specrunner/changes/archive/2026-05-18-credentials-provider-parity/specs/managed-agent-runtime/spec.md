## ADDED Requirements

### Requirement: ManagedAgentRunner は credential-store の resolver を経由して API key を取得する

`ManagedAgentRunner` は MUST `core/credentials/anthropic.ts` の `resolveSpecRunnerApiKey` 経由で Anthropic API key を取得する。`process.env["SPECRUNNER_API_KEY"]` を直読することは MUST NOT。credential の格納・解決ルールは `specrunner/specs/credential-store/spec.md` を参照。

#### Scenario: API key 取得経路

- **GIVEN** managed runtime で session 作成時
- **WHEN** API key を取得する
- **THEN** `resolveSpecRunnerApiKey` を呼ぶ
- **AND** `process.env["SPECRUNNER_API_KEY"]` を直接参照しない

#### Scenario: callsite の制約

- **WHEN** `ManagedAgentRunner` が API key を必要とする
- **THEN** `resolveSpecRunnerApiKey` 関数経由で取得する
- **AND** `process.env["SPECRUNNER_API_KEY"]` の直読が src/ 配下に発生しない
