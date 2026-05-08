## MODIFIED Requirements

### Requirement: `specrunner run <request.md>` は propose と spec-review セッションを直列で実行する

`specrunner run` は MUST 引数で渡された request.md ファイルから request 情報を抽出し、cwd の git remote から repo を特定し、propose セッションを作成して完了を検知し、続いて spec-review セッションを作成して完了を検知する。spec-review 完了後、verdict を取得して stdout に表示し、SHALL 状態ファイルを各ステップ完了時に更新する。

pipeline が `awaiting-merge` 状態に到達した場合、`state.pullRequest.url` が存在すれば MUST PR URL を stdout に出力する。`pullRequest` が未設定の場合は SHALL branch 名のみを表示し、エラーにしてはならない。

#### Scenario: spec-review-result.md が見つからない

- **WHEN** propose は正常完了したが spec-review セッション完了後に `deps.githubClient.getRawFile` が adapter 内部リトライ後も null を返す
- **THEN** state.status を `failed`、error.code を `SPEC_REVIEW_RESULT_NOT_FOUND` で記録し、stderr に `Spec-review result file not found on branch '<branch>'.` を出力し exit code 1 で終了する

#### Scenario: pipeline 完了時に PR URL が存在する

- **WHEN** pipeline が `awaiting-merge` に到達し、`state.pullRequest.url` が設定されている
- **THEN** PR URL を stdout に出力し、続けて branch 名を含む完了メッセージを出力し、exit code 0 で終了する

#### Scenario: pipeline 完了時に pullRequest が未設定

- **WHEN** pipeline が `awaiting-merge` に到達したが `state.pullRequest` が未設定（pr-create step 未実行、legacy state 等）
- **THEN** branch 名を含む完了メッセージのみを stdout に出力し、PR URL 行は出力せず、exit code 0 で終了する
