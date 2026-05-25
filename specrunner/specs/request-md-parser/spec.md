## Purpose

Parse `request.md` into a structured object (type, title, content, enabled options).
## Requirements

### Requirement: request.md は YAML/Markdown ハイブリッド構造でパースされる

以下を既存 Requirement に追加する:

---

`ParsedRequest` interface に `adr: boolean` field を追加する。`parseRequestMd` の戻り値に `adr` が含まれる。

#### Scenario: parsedRequest に adr フィールドが含まれる

- **WHEN** Meta セクションに `- **adr**: true` が存在する
- **THEN** `parsedRequest` は `adr` プロパティを持つ
- **AND** `parsedRequest.adr` は `boolean` 型である

> Note: `adr` の値の正確な型変換と validation Scenario は「必須フィールドの欠落はエラーとなる」Requirement に記載済み。重複を避けるため本 Requirement では型宣言のみ示す。

### Requirement: 必須フィールドの欠落はエラーとなる

以下を既存 Requirement に追加する:

---

`adr` フィールドが Meta セクションから抽出できない場合、CLI は MUST `REQUEST_MD_INVALID` エラーを発生させ、SHALL `missing 'adr' in Meta section` を含むメッセージで stderr に出力する。

`adr` フィールドの値が `true` または `false` 以外の場合も MUST `REQUEST_MD_INVALID` エラーを発生させる。

`adr` フィールドの抽出パターンは `/^\s*-\s+\*\*adr\*\*:\s+(true|false)\s*$/` とする。抽出した文字列 `"true"` → `boolean true`、`"false"` → `boolean false` に変換する。

#### Scenario: adr: true を含む request.md

- **WHEN** Meta セクションに `- **adr**: true` が存在する
- **THEN** `parsedRequest.adr === true` (boolean)

#### Scenario: adr: false を含む request.md

- **WHEN** Meta セクションに `- **adr**: false` が存在する
- **THEN** `parsedRequest.adr === false` (boolean)

#### Scenario: adr フィールド欠落

- **WHEN** Meta セクションに `adr` 行が存在しない
- **THEN** `REQUEST_MD_INVALID` エラーが throw される
- **AND** メッセージに `missing 'adr' in Meta section` を含む

#### Scenario: adr フィールドの値が不正

- **WHEN** Meta セクションに `- **adr**: maybe` が存在する
- **THEN** `REQUEST_MD_INVALID` エラーが throw される

### Requirement: type は許容値リストで検証される

`type` の値は MUST `new-feature`、`bugfix`、`refactor`、`docs`、`spec-change`、`test`、`chore` のいずれかである。それ以外の値は SHALL 警告（stderr）を出すが処理は継続する。

#### Scenario: 許容 type

- **WHEN** `type: new-feature`
- **THEN** バリデーションを通過する

#### Scenario: 未知の type

- **WHEN** `type: unknown-type`
- **THEN** `Warning: unknown request type 'unknown-type'.` を stderr に出力し、処理は継続する

### Requirement: パーサーは外部依存なしの実装でなければならない

request.md パーサーは MUST `@anthropic-ai/sdk`、`zod`、Markdown ライブラリ等の外部 npm パッケージを追加で導入してはならない。実装は SHALL Node 標準 API（`fs/promises`）と TypeScript の正規表現で行う。

#### Scenario: 依存追加なし

- **WHEN** request-md-parser モジュールを実装する
- **THEN** package.json に新規 dependency を追加しない（devDependencies のテストツールを除く）

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

### Requirement: parser は request.md Meta セクションの issue field を抽出する (optional)

`request.md` パーサーは SHALL Meta セクションの `- **issue**: <value>` 行を抽出し、`parsedRequest.issue` として返す。

- 値が存在する場合: `parsedRequest.issue` は `"#279"` 形式 (string、`#` prefix 含む) で返す
- issue field 不在: `parsedRequest.issue` は `undefined`、エラーは発生しない

#### Scenario: issue field が存在する request.md

- **WHEN** Meta セクションに `- **issue**: #264` が存在する
- **THEN** `parsedRequest.issue === "#264"` (string with `#` prefix)

#### Scenario: issue field が存在しない request.md

- **WHEN** Meta セクションに `issue` 行が存在しない
- **THEN** `parsedRequest.issue === undefined`、エラーは発生しない

### Requirement: parseRequestMdContent SHALL route validation through RuleRegistry

The `parseRequestMdContent` function SHALL delegate all field validation to a `RuleRegistry<ParsedRequestRaw, RequestMdViolation>` instance obtained from `createRequestMdRegistry()`, rather than performing inline checks.

#### Scenario: Validation via registry

- **GIVEN** `parseRequestMdContent` is called with content missing the `type` field
- **WHEN** the function executes the validation phase
- **THEN** the `type-required` rule in the registry produces the violation and `requestMdInvalidError` is thrown with the rule's message

#### Scenario: Warning emitted via registry

- **GIVEN** content with an unknown request type value
- **WHEN** `parseRequestMdContent` is called
- **THEN** the `type-known` rule produces a warning-severity violation, which is emitted to stderr via `stderrWrite`, and the function does not throw

### Requirement: parser は未知のセクションを silent ignore する

parser は MUST `## Workflow Options` を含む未知のセクション見出しに遭遇した場合、エラーを発生させずそのセクションを無視する。これにより既存 archive 内の `## Workflow Options` セクションを含む request.md を re-parse しても正常に動作する。

#### Scenario: Workflow Options セクションが存在する既存 request.md

- **WHEN** request.md に `## Workflow Options\n\n- enabled: []` セクションが含まれる
- **THEN** parser はエラーを発生させず正常に parse を完了する
- **AND** 返却される `ParsedRequest` に `enabled` field は存在しない

#### Scenario: 未知セクションが複数存在する request.md

- **WHEN** request.md に `## Workflow Options` と `## Unknown Section` が含まれる
- **THEN** parser は両方を silent ignore し、既知フィールドのみを抽出する
