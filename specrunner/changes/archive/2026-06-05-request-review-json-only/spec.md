# Spec: request review structured-JSON-only output と parse 失敗の判別

## Requirements

### Requirement: reviewer の出力契約は構造化 JSON 一本である

request-review の system prompt は、reviewer の出力 artifact として末尾の ```json ブロックのみを
必須として要求 SHALL する。人間可読 Markdown の `## Findings Summary` 表および `## Verdict:` 見出しの
出力を要求して MUST NOT。JSON ブロックは応答の最後のブロックでなければならない MUST。

#### Scenario: prompt が二重出力を要求しない

**Given** request-review の system prompt
**When** その `## Output Format` 節を検査する
**Then** `## Findings Summary` Markdown 表の出力指示が存在せず、`## Verdict:` 見出しの出力指示も存在せず、
末尾 ```json ブロックが唯一の必須出力 artifact として記載されている

#### Scenario: JSON と Markdown の一致強制が存在しない

**Given** request-review の system prompt の `## Constraints` 節
**When** 制約条項を検査する
**Then** 「JSON の verdict が `## Verdict:` 見出しと一致しなければならない」「findings 配列が Findings Summary
表と対応しなければならない」「summary が Verdict 節と同一でなければならない」といった二重出力の一致強制が存在しない

### Requirement: parse 失敗は確定レビューに偽装してはならない

`parseReviewOutput` が最後の ```json ブロックから有効な構造化 verdict を抽出できない場合、返り値の
`summary` は raw reviewer text を echo しない固定の診断文字列で MUST あり、`findings` には
`category: "parse-error"` の finding を必ず含めなければならない MUST。fallback の verdict は確定結果として
扱われて MUST NOT（判別性は固定診断 summary と parse-error finding で担保する）。

#### Scenario: JSON ブロックが存在しない

**Given** ```json ブロックを含まない reviewer 出力テキスト
**When** `parseReviewOutput` に渡す
**Then** `summary` は入力に依存しない固定診断文字列であり raw 入力を含まず、`findings` に
`category: "parse-error"` かつ `severity: "HIGH"` の finding が含まれる

#### Scenario: JSON が truncation で途中まで

**Given** ```json fence が開いたまま本体が途中で切れ閉じ波括弧・閉じ fence が無い reviewer 出力テキスト
**When** `parseReviewOutput` に渡す
**Then** fallback path に落ち、`summary` は固定診断文字列で raw 入力を含まず、`findings` に
`category: "parse-error"` の finding が含まれ、verdict は確定結果として扱われない

#### Scenario: JSON が malformed

**Given** ```json ブロック内が valid JSON でない reviewer 出力テキスト
**When** `parseReviewOutput` に渡す
**Then** `summary` は固定診断文字列で raw 入力を含まず、`findings` に `category: "parse-error"` の finding が含まれる

### Requirement: 正常な末尾 JSON は決定的にパースされ、表示と exit code は不変である

末尾に有効な ```json ブロックを持つ reviewer 出力に対し、`parseReviewOutput` は当該 JSON から
verdict・findings・summary を抽出 SHALL する。`formatHumanReadable` の表示形式と `verdictToExitCode` の
マッピングは本変更で不変で MUST ある。

#### Scenario: 正常な末尾 JSON を抽出する

**Given** 末尾に有効な ```json ブロック（`verdict`・`findings`・`summary` を含む）を持つ reviewer 出力
**When** `parseReviewOutput` に渡す
**Then** 当該 JSON の verdict・findings・summary が返り、findings の `number` は 1-indexed で補完される

#### Scenario: 表示形式と exit code が不変

**Given** 任意の `RequestReviewResult`
**When** `formatHumanReadable` で整形し `verdictToExitCode` で exit code を求める
**Then** `formatHumanReadable` は `## Verdict:` 見出し ＋ summary ＋ findings 形式を出力し、
`verdictToExitCode` は approve/needs-discussion を 0、reject を 1 に写像する
