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
