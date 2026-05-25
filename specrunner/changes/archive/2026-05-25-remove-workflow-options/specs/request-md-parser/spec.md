## Purpose

Parse `request.md` into a structured object (type, title, content).

## Requirements

### Requirement: ParsedRequest exposes 背景 and 目的 sections for downstream consumers

`request.md` パーサーは MUST 既存の `ParsedRequest` shape (`{ type, title, content }`) を拡張し、`sections` field を追加する。`sections` は SHALL `{ 背景?: string; 目的?: string }` の形状を持つ。各 field は対応する `##` 見出し配下の本文を保持する（見出し行自体は含まない）。該当見出しが存在しない場合は `undefined` となる。パーサーは引き続き外部 npm 依存を追加せず、Node 標準 API + 正規表現で実装する。この field は `pr-create` step が PR body を生成する際に使用される。

#### Scenario: 背景 と 目的 の両方が存在する request.md

- **WHEN** request.md が `## 背景` と `## 目的` の見出しを両方含む
- **THEN** `sections.背景` と `sections.目的` は両方とも非空文字列で、各見出し配下の本文をそのまま保持する

#### Scenario: 目的 が存在しない場合

- **WHEN** request.md に `## 背景` は存在するが `## 目的` が存在しない
- **THEN** `sections.背景` は非空文字列、`sections.目的` は `undefined`
- **AND** エラーは発生しない（既存の type/title 検証ルールを維持）

#### Scenario: 既存依存を追加しない

- **WHEN** sections 抽出ロジックを実装する
- **THEN** package.json に新規 dependency を追加しない（既存の Requirement「パーサーは外部依存なしの実装でなければならない」を維持）

### Requirement: parser は未知のセクションを silent ignore する

parser は MUST `## Workflow Options` を含む未知のセクション見出しに遭遇した場合、エラーを発生させずそのセクションを無視する。これにより既存 archive 内の `## Workflow Options` セクションを含む request.md を re-parse しても正常に動作する。

#### Scenario: Workflow Options セクションが存在する既存 request.md

- **WHEN** request.md に `## Workflow Options\n\n- enabled: []` セクションが含まれる
- **THEN** parser はエラーを発生させず正常に parse を完了する
- **AND** 返却される `ParsedRequest` に `enabled` field は存在しない

#### Scenario: 未知セクションが複数存在する request.md

- **WHEN** request.md に `## Workflow Options` と `## Unknown Section` が含まれる
- **THEN** parser は両方を silent ignore し、既知フィールドのみを抽出する
