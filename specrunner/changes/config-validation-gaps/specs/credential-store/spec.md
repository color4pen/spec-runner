## ADDED Requirements

### Requirement: credentials file は load 時に shape を検証する

`loadCredentials`（`src/core/credentials/credentials-io.ts`）は MUST credentials file（`~/.config/specrunner/credentials.json`）を `JSON.parse` した後、最低限のキーフィールドの shape を検証する。検証は「対象ファイルが壊れていた場合に早期に明確なエラーを出す」ことが目的であり、過度な schema 検証はしない。

- parse 結果が object でない場合は SHALL throw する。
- `github` キーが存在する場合、`github.token` が string であることを SHALL 検証し、違反時は throw する。`github` 不在（例: anthropic-only の credentials file）は valid。
- `anthropic` セクションの検証はスコープ外（本 requirement では追加しない）。

malformed JSON（構文エラー）は SHALL 従来どおり `{}` を返す（throw しない、後方互換）。ファイル不在（ENOENT）も SHALL `{}` を返す。throw は「JSON としては valid だが期待する shape を満たさない」ケースに限定される。

#### Scenario: github.token が文字列

- **GIVEN** credentials file に `{ "github": { "token": "ghp_x" } }` が保存されている
- **WHEN** `loadCredentials()` を呼ぶ
- **THEN** その内容がそのまま返る（throw しない）

#### Scenario: anthropic-only の credentials file

- **GIVEN** credentials file に `{ "anthropic": { "apiKey": "sk-x" } }` が保存されている（`github` 不在）
- **WHEN** `loadCredentials()` を呼ぶ
- **THEN** throw されない（github 不在は valid）

#### Scenario: github.token が非 string

- **GIVEN** credentials file に `{ "github": { "token": 123 } }` が保存されている
- **WHEN** `loadCredentials()` を呼ぶ
- **THEN** エラーが throw される

#### Scenario: malformed JSON は空オブジェクトにフォールバック

- **GIVEN** credentials file の内容が JSON として不正（構文エラー）
- **WHEN** `loadCredentials()` を呼ぶ
- **THEN** `{}` が返る（throw しない、後方互換）

#### Scenario: ファイル不在

- **GIVEN** credentials file が存在しない（ENOENT）
- **WHEN** `loadCredentials()` を呼ぶ
- **THEN** `{}` が返る
