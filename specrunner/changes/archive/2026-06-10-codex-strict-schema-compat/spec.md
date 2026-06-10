# Spec: codex adapter OpenAI strict-mode outputSchema 互換

## Requirements

### Requirement: codex adapter SHALL convert the report_result outputSchema to OpenAI strict-mode form

codex adapter が `thread.run()` に渡す `outputSchema` は、OpenAI structured output（strict mode）互換でなければならない（MUST）。
具体的には、JSON Schema の各 object node について、`properties` の全 key を `required` に列挙し、
元々 optional だった property の型を nullable（`type` 配列に `"null"` を追加、または `anyOf` に `{ type: "null" }` を追加）にする。
この変換は `additionalProperties: false` を保持し、nested object（findings 配列の要素）にも再帰的に適用される（MUST）。

#### Scenario: top-level optional fields become required and nullable

**Given** JUDGE_REPORT_TOOL の zodSchema（`ok`, optional `reason`, optional `approved`, optional `findings`）から生成した JSON Schema
**When** codex adapter が outputSchema を構築する
**Then** top-level の `required` が `ok` / `reason` / `approved` / `findings` を全て含む
**And** `reason` の型が string と null の union（`type: ["string", "null"]`）になっている
**And** `approved` の型が boolean と null の union になっている
**And** `findings` の型が array と null の union になっている
**And** `ok` は元から required なので nullable 化されていない

#### Scenario: nested findings item optional field becomes required and nullable

**Given** JUDGE_REPORT_TOOL の findings 配列要素（required: severity/resolution/file/title/rationale, optional: line）
**When** codex adapter が outputSchema を構築する
**Then** findings item の `required` が severity / resolution / file / title / rationale / line を全て含む
**And** optional だった `line` の型が number と null の union（`type: ["number", "null"]`）になっている
**And** required だった severity / resolution / file / title / rationale は nullable 化されていない

#### Scenario: union-typed optional field gets a null branch

**Given** PRODUCER_REPORT_TOOL の optional `status`（`anyOf` 形式の union "success" | "error"）から生成した JSON Schema
**When** codex adapter が outputSchema を構築する
**Then** `status` が required に含まれる
**And** `status` の `anyOf` に `{ type: "null" }` branch が追加されている

### Requirement: codex adapter SHALL normalize null optional fields before parsing tool results

codex 経由の tool 結果（`thread.run()` の finalResponse を JSON parse したもの）は、`reportTool.parseInput` に渡す前に
null 値の key を再帰的に除去しなければならない（MUST）。これにより、strict schema により付与された nullable の
`null` 値が、フィールド欠落（undefined）と同じ typed outcome に parse される。除去は findings 配列要素内の
フィールド（例: `line`）にも再帰的に適用される（MUST）。

#### Scenario: scalar optional null parses identically to undefined

**Given** codex が `{ ok: true, reason: null }` を tool 結果として返す
**When** codex adapter が結果を parse する
**Then** `{ ok: true }`（reason 欠落）と同一の typed outcome になる

#### Scenario: findings line null does not invalidate the findings array

**Given** codex が `ok: true` と findings 配列を返し、ある finding の `line` が `null`
**When** codex adapter が結果を parse する
**Then** その findings 配列は有効として parse され、当該 finding は `line` を持たない（undefined と同等）
**And** parse 結果が `{ ok: false, missingFields: ["findings"] }` にならない

### Requirement: the conversion SHALL be confined to the codex adapter

strict-mode 変換および null 正規化は codex adapter 内に閉じなければならない（MUST）。
port の `ReportToolSpec.zodSchema` と Claude 側の `toCustomToolSpec` の出力は変更されてはならない（MUST NOT change）。

#### Scenario: Claude-side CustomToolSpec output is unchanged

**Given** JUDGE_REPORT_TOOL
**When** `toCustomToolSpec(JUDGE_REPORT_TOOL)` を評価する
**Then** `input_schema.required` は従来どおり `["ok"]` のみで、codex 変換の影響を受けていない
**And** optional フィールド（reason / approved / findings）は nullable 化されていない
