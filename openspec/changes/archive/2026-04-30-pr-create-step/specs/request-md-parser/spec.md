## ADDED Requirements

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
