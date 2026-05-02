## MODIFIED Requirements

### Requirement: `register_branch` Custom Tool は固定スキーマで定義される

`register_branch` ツールは MUST type `custom` で、SHALL 以下の固定スキーマで定義される:

- name: `register_branch`
- description: 3 文以上の詳細記述（何をするか / いつ使うか / 入力 branch / slug の意味と命名規約 / 冪等性が last-write-wins である旨）
- input_schema:
  - type: `object`
  - properties.branch: `{ type: "string", description: "openspec slug を含むブランチ名（例: feat/readme-status-section）" }`
  - properties.slug: `{ type: "string", description: "openspec change folder 名と一致する slug（例: readme-status-section）。省略時は branch から prefix を strip して導出する" }`
  - required: `["branch"]`

slug は省略可能な optional field である。SpecRunner の deterministic な後段処理（特に `specrunner finish`）が canonical な slug を `state.request.slug` から得るため、propose agent が slug を明示的に渡すことを **推奨** する。後方互換性のため slug 未指定でも MUST 受理される（次 Requirement 参照）。

#### Scenario: definition が安定している

- **WHEN** Agent 作成時に `custom_tools` に渡される `register_branch` definition を JSON-stringify する
- **THEN** name, description, input_schema が決定論的に生成される（環境変数や時刻に依存しない）

#### Scenario: slug プロパティが input_schema に含まれる

- **WHEN** definition の `input_schema.properties` を確認する
- **THEN** `branch` と `slug` の両方が定義されている、`required` は `["branch"]` のみ（slug は optional）

### Requirement: ハンドラは last-write-wins で冪等に動作する

`register_branch` のハンドラは MUST 同一 session 内で複数回呼ばれた場合、毎回 state.branch を入力値で上書きする。slug が input に含まれている場合は同時に MUST `state.request.slug` も入力値で上書きする。slug が省略された場合は handler 側で `branch` から prefix（`feat/` `fix/` `change/` `refactor/` `chore/`）を strip した残部を slug として SHALL 導出し、`state.request.slug` に設定する。strip 結果が空文字列の場合は `state.request.slug` を `null` のまま残す。

Agent には SHALL 常に `{ ok: true, branch: <input>, slug: <resolved-slug> }` を返す。

slug input が空文字列または string 型以外で渡された場合は MUST `state.request.slug` へ書き込まず、branch から導出した値を使用する（導出不可の場合は `null` のまま残す）。この validation は slug が明示的に渡された場合にも適用される（空文字列 slug を canonical に書き込むことを防ぐ）。

#### Scenario: 1 回呼び出し（slug 明示）

- **WHEN** ハンドラが `{ branch: "feat/readme-status-section", slug: "readme-status-section" }` で呼ばれる
- **THEN** state.branch が `feat/readme-status-section`、state.request.slug が `readme-status-section` になり、戻り値が `{ ok: true, branch: "feat/readme-status-section", slug: "readme-status-section" }` になる

#### Scenario: 1 回呼び出し（slug 省略・branch から導出）

- **WHEN** ハンドラが `{ branch: "feat/readme-status-section" }` のみで呼ばれる（後方互換）
- **THEN** state.branch が `feat/readme-status-section`、handler が prefix `feat/` を strip して `readme-status-section` を導出し state.request.slug に設定、戻り値が `{ ok: true, branch: "feat/readme-status-section", slug: "readme-status-section" }` になる

#### Scenario: 連続 2 回呼び出し

- **WHEN** ハンドラが `{ branch: "a", slug: "x" }` → `{ branch: "b", slug: "y" }` で連続呼び出しされる
- **THEN** 最終 state.branch が `b`、state.request.slug が `y` になり、両回ともエラーは発生しない

#### Scenario: prefix が無い branch で slug 省略

- **WHEN** ハンドラが `{ branch: "main-something" }` で呼ばれる（既知 prefix が無い）
- **THEN** strip 不可なため state.branch が `main-something`、state.request.slug は `main-something` 全体になる（fallback として branch そのまま採用）

#### Scenario: 空文字列 slug が渡された場合は branch から導出

- **WHEN** ハンドラが `{ branch: "feat/readme-status-section", slug: "" }` で呼ばれる（slug が空文字列）
- **THEN** 空文字列 slug は state.request.slug に書き込まれず、handler が `feat/` prefix を strip して `readme-status-section` を導出し state.request.slug に設定する。戻り値は `{ ok: true, branch: "feat/readme-status-section", slug: "readme-status-section" }` になる
