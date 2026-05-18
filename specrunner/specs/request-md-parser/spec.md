## Purpose

Parse `request.md` into a structured object (type, title, content, enabled options).
## Requirements
### Requirement: request.md は YAML/Markdown ハイブリッド構造でパースされる

request.md パーサーは MUST Markdown ファイルから以下の情報を抽出する: `type` (string、`Meta` 見出し配下の `- **type**: <value>` リスト項目から)、`title` (level-1 heading のテキスト)、`content` (Markdown 本文全体)、`enabled` (`ワークフローオプション` 見出し配下の `- **enabled**:` 配下のリスト項目を文字列配列として収集)。CLI は SHALL この抽出結果を構造化オブジェクトとして返す。

#### Scenario: 通常の request.md

- **WHEN** request.md が level-1 heading + Meta セクション + ワークフローオプションセクションを含む
- **THEN** parser は `{ type, title, content, enabled }` を返し、`type` と `title` は非空文字列、`enabled` は string[]、`content` はファイル全体の文字列

#### Scenario: enabled が空

- **WHEN** ワークフローオプションセクションが存在するが `enabled:` 配下にリスト項目が無い
- **THEN** `enabled` は空配列 `[]` になる

#### Scenario: ワークフローオプションセクションが無い

- **WHEN** request.md にワークフローオプションセクションが存在しない
- **THEN** `enabled` は空配列 `[]` で返り、エラーは発生しない

### Requirement: 必須フィールドの欠落はエラーとなる

`type` または `title` が抽出できない場合、CLI は MUST `REQUEST_MD_INVALID` エラーを発生させ、SHALL 欠落しているフィールド名を含むメッセージで stderr に出力する。

#### Scenario: title が無い

- **WHEN** request.md に level-1 heading が存在しない
- **THEN** `Request file invalid: missing title (top-level # heading required).` を含むエラーを返す

#### Scenario: type が無い

- **WHEN** Meta セクションに `- **type**:` が存在しない
- **THEN** `Request file invalid: missing 'type' in Meta section.` を含むエラーを返す

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

`request.md` パーサーは MUST 既存の `ParsedRequest` shape (`{ type, title, content, enabled }`) を拡張し、`sections` field を追加する。`sections` は SHALL 以下の形状を持つ:

```ts
sections: {
  背景?: string;   // ## 背景 配下の本文（次の ## 見出しまで、見出し行は含まず）
  目的?: string;   // ## 目的 配下の本文（次の ## 見出しまで、見出し行は含まず）
};
```

抽出ルール:

- 該当見出しが request.md に存在しない場合、対応する field は SHALL `undefined` となる（エラーは発生しない）
- 抽出範囲は対象 `## 見出し` の次行から、次の `## 見出し` の直前行まで（または EOF まで）
- 改行・空白・末尾の余剰改行は SHALL trim せず、原文のまま保持する（ただし対象見出し行自体は含まない）
- パーサーは引き続き外部 npm 依存を追加せず、Node 標準 API + 正規表現で実装する（既存制約を維持）

この field は `pr-create` step が PR body を生成する際に、人間が書いた一次情報を流用するために使用される。

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

