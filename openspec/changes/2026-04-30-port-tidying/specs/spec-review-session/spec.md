## MODIFIED Requirements

### Requirement: verdict ファイルは GitHub API で取得し行頭マッチでパースする

セッション完了後、CLI は MUST `deps.githubClient.getRawFile(owner, repo, branch, path): Promise<string | null>` を呼び（404 は 1 秒間隔で最大 3 回までリトライしてから null を返す `GitHubClient` port の adapter 実装に委譲する。401 は `GITHUB_TOKEN_EXPIRED` を throw する）、戻り値の文字列に対して `/^- \*\*verdict\*\*:\s*(approved|needs-fix|escalation)\s*$/m` でパースする。最初にマッチした verdict 行を採用する（first-write-wins）。`iteration` は SHALL 1-origin で findings ファイル名のサフィックス（`spec-review-result-{NNN}.md`、3 桁ゼロ埋め）に対応する。

#### Scenario: iteration ごとに別ファイル

- **WHEN** iter=1 の spec-review が完了し、続いて iter=2 の spec-review が完了する
- **THEN** `state.steps["spec-review"][0].findingsPath` が `openspec/changes/<slug>/spec-review-result-001.md`、`state.steps["spec-review"][1].findingsPath` が `openspec/changes/<slug>/spec-review-result-002.md` であり、それぞれ独立した verdict ファイルとして記録される

#### Scenario: approved

- **WHEN** verdict ファイルに `- **verdict**: approved` の行が含まれる
- **THEN** state.steps["spec-review"] 末尾要素の verdict が `approved` になり、state.status は `success`

#### Scenario: needs-fix

- **WHEN** verdict ファイルに `- **verdict**: needs-fix` の行が含まれる
- **THEN** state.steps["spec-review"] 末尾要素の verdict が `needs-fix` になり、stdout に findings サマリが出力される（loop プリミティブが次 iter の判定に使う）

#### Scenario: escalation

- **WHEN** verdict ファイルに `- **verdict**: escalation` の行が含まれる
- **THEN** state.steps["spec-review"] 末尾要素の verdict が `escalation` になり、loop プリミティブは fixer を起動せずに loop を抜ける

### Requirement: verdict ファイル不在時のフェイルセーフ

`deps.githubClient.getRawFile` が null を返した（adapter 内部のリトライ後も 404）場合、CLI は MUST state.status を `failed`、error.code を `SPEC_REVIEW_RESULT_NOT_FOUND` に設定する。verdict 行がパースできない場合は SHALL state.steps["spec-review"] 末尾要素の verdict を `escalation`、stderr に `Spec-review verdict could not be parsed; treating as escalation.` を出力する。リトライ回数（最大 3 回）と間隔（1 秒）は `GitHubClient` port の getRawFile 実装の内部仕様であり、本 Requirement では呼び出し側の挙動のみを定義する。loop プリミティブから見ると `escalation` verdict の挙動と同じく fixer を起動せずに loop を抜ける。

#### Scenario: ファイル 404 (リトライ後も null)

- **WHEN** `deps.githubClient.getRawFile` が null を返す（adapter 内部リトライをすべて消費した後）
- **THEN** state.status が `failed`、error.code が `SPEC_REVIEW_RESULT_NOT_FOUND` になる

#### Scenario: verdict 行が無い

- **WHEN** verdict ファイルは存在するが verdict 行がパースできない
- **THEN** state.steps["spec-review"] 末尾要素の verdict が `escalation` になり、stderr に warning メッセージが出力される（state.status は `success` のまま）。loop プリミティブは fixer を起動せずに loop を抜ける
