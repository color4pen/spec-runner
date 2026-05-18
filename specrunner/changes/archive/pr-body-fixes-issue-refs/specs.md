# Delta Spec: pr-body-fixes-issue-refs

## MODIFIED: request-md-parser

### Requirement: parser は request.md Meta セクションの issue field を抽出する (optional)

parser は SHOULD Meta セクションから `- **issue**: <value>` を抽出し、`ParsedRequest.issue` として返す。field が存在しない場合は `undefined` を返し、エラーは発生しない (optional field)。

#### Scenario: issue field が存在する

- **WHEN** request.md の Meta セクションに `- **issue**: #279` が存在する
- **THEN** `parsedRequest.issue` は `"#279"` (string, `#` prefix 付き)

#### Scenario: issue field が存在しない

- **WHEN** request.md の Meta セクションに `issue` field が存在しない
- **THEN** `parsedRequest.issue` は `undefined`
- **AND** エラーは発生しない

---

## MODIFIED: pr-create-runner

### Requirement: renderPrBody は parsedRequest.issue から Fixes 行を生成する

`renderPrBody` は SHALL `parsedRequest.issue` が非 undefined のとき、Summary section の直後に `Fixes ${issue}` 行を挿入する。`issue` が `undefined` のとき、Fixes 行を挿入しない (既存挙動維持)。

この行により、PR merge 時に GitHub が関連 issue を auto-close する。

#### Scenario: issue が存在する場合に Fixes 行が含まれる

- **GIVEN** `parsedRequest.issue` が `"#264"`
- **WHEN** `renderPrBody({ parsedRequest, jobState, slug })` を呼び出す
- **THEN** 返却される body に `Fixes #264` が含まれる
- **AND** `Fixes #264` は `## Summary` section と `## Workflow` section の間に位置する

#### Scenario: issue が undefined の場合に Fixes 行が含まれない

- **GIVEN** `parsedRequest.issue` が `undefined`
- **WHEN** `renderPrBody({ parsedRequest, jobState, slug })` を呼び出す
- **THEN** 返却される body に `Fixes` を含む行が存在しない
