## MODIFIED Requirements

### Requirement: `specrunner run <request.md>` は propose と spec-review セッションを直列で実行する

`specrunner run` は MUST 引数で渡された request.md ファイルから request 情報を抽出し、cwd の git remote から repo を特定し、propose セッションを作成して完了を検知し、続いて spec-review セッションを作成して完了を検知する。spec-review 完了後、verdict を取得して stdout に表示し、SHALL 状態ファイルを各ステップ完了時に更新する。

#### Scenario: spec-review-result.md が見つからない

- **WHEN** propose は正常完了したが spec-review セッション完了後に `deps.githubClient.getRawFile` が adapter 内部リトライ後も null を返す
- **THEN** state.status を `failed`、error.code を `SPEC_REVIEW_RESULT_NOT_FOUND` で記録し、stderr に `Spec-review result file not found on branch '<branch>'.` を出力し exit code 1 で終了する
