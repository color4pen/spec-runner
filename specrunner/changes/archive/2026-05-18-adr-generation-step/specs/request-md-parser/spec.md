# Delta Spec: request-md-parser

## MODIFIED Requirements

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

### Requirement: request.md は YAML/Markdown ハイブリッド構造でパースされる

以下を既存 Requirement に追加する:

---

`ParsedRequest` interface に `adr: boolean` field を追加する。`parseRequestMd` の戻り値に `adr` が含まれる。

#### Scenario: parsedRequest に adr フィールドが含まれる

- **WHEN** Meta セクションに `- **adr**: true` が存在する
- **THEN** `parsedRequest` は `adr` プロパティを持つ
- **AND** `parsedRequest.adr` は `boolean` 型である

> Note: `adr` の値の正確な型変換と validation Scenario は「必須フィールドの欠落はエラーとなる」Requirement に記載済み。重複を避けるため本 Requirement では型宣言のみ示す。
