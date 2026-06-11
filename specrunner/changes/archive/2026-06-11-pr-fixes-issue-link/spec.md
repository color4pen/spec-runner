# Spec: PR の Fixes 行を job state の issueNumber から導出する

## Requirements

### Requirement: PR body の Fixes 行は jobState.issueNumber を優先源とする

PR body の生成は、Fixes 行の導出に `JobState` の issue 番号フィールド（issueNumber）を優先源として
使う SHALL。issueNumber が設定済み（null / undefined でない）のとき、システムは Fixes 行を
`Fixes #<issueNumber>` の形式で出力する MUST。この形式は GitHub が PR merge 時に該当 issue を自動
close できる参照形式である MUST。

#### Scenario: issueNumber を持つ job の PR body に `Fixes #<issueNumber>` が含まれる

**Given** `JobState.issueNumber` が `42` の job
**When** `renderPrBody` が PR body を生成する
**Then** body は `Fixes #42` を含む

#### Scenario: issueNumber が request.md の issue より優先される

**Given** `JobState.issueNumber` が `42` で、かつ `parsedRequest.issue` が `#264` の job
**When** `renderPrBody` が PR body を生成する
**Then** body は `Fixes #42` を含み、`Fixes #264` は含まない

### Requirement: issueNumber が無い場合は request.md の issue にフォールバックする

`JobState.issueNumber` が未設定（null / undefined）のとき、システムは従来どおり `parsedRequest.issue`
を用いて Fixes 行を出力する SHALL。その出力形式は現行挙動を維持し、変化させない MUST。

#### Scenario: issueNumber が無く request.md に issue がある場合は従来の出力を維持する

**Given** `JobState.issueNumber` が未設定で、`parsedRequest.issue` が `#264` の job
**When** `renderPrBody` が PR body を生成する
**Then** body は `Fixes #264` を含む（従来出力と同一）

### Requirement: issueNumber も issue も無い場合は Fixes 行を出力しない

`JobState.issueNumber` が未設定かつ `parsedRequest.issue` も未設定のとき、システムは Fixes 行を一切
出力しない MUST。

#### Scenario: 両方無い場合は Fixes 行が出力されない

**Given** `JobState.issueNumber` が未設定で、`parsedRequest.issue` も未設定の job
**When** `renderPrBody` が PR body を生成する
**Then** body は `Fixes` で始まる issue 参照行を含まない
