## MODIFIED Requirements

### Requirement: `specrunner run <request.md>` は propose と spec-review セッションを直列で実行する

`specrunner run` は MUST 引数で渡された request.md ファイルから request 情報を抽出し、cwd の git remote から repo を特定し、propose セッションを作成して完了を検知し、続いて spec-review セッションを作成して完了を検知する。spec-review 完了後、verdict を取得して stdout に表示し、SHALL 状態ファイルを各ステップ完了時に更新する。

#### Scenario: 引数なしで実行された場合

- **WHEN** ユーザーが `specrunner run` を引数なしで実行する
- **THEN** `Usage: specrunner run <request.md>` を stderr に出力し exit code 2 で終了する

#### Scenario: 指定された request.md が存在しない

- **WHEN** ユーザーが `specrunner run /nonexistent.md` を実行する
- **THEN** `Request file not found: /nonexistent.md` を stderr に出力し exit code 1 で終了する

#### Scenario: propose 完了 + spec-review approved

- **WHEN** propose セッションが register_branch を呼んで正常完了し、spec-review セッションが verdict `approved` で完了する
- **THEN** stdout に `Spec review verdict: approved` を出力し、state.status を `success`、state.steps["spec-review"].verdict を `approved` で記録し、exit code 0 で終了する

#### Scenario: propose 完了 + spec-review needs-fix

- **WHEN** propose セッションが正常完了し、spec-review セッションが verdict `needs-fix` で完了する
- **THEN** stdout に `Spec review verdict: needs-fix` と findings サマリ（件数と上位 3 件のタイトル）を出力し、state.steps["spec-review"].verdict を `needs-fix` で記録し、exit code 0 で終了する（自動リトライは行わない）

#### Scenario: propose 完了 + spec-review escalation

- **WHEN** propose セッションが正常完了し、spec-review セッションが verdict `escalation` で完了する
- **THEN** stdout に `Spec review verdict: escalation` とエスカレーション理由（spec-review-result.md の Summary 部分）を出力し、state.steps["spec-review"].verdict を `escalation` で記録し、exit code 0 で終了する

#### Scenario: propose 失敗時に spec-review はスキップされる

- **WHEN** propose セッションが `BRANCH_NOT_REGISTERED` 等で失敗する
- **THEN** spec-review セッションは作成されず、state.status を `failed` で記録し、stderr にエラーメッセージを出力し exit code 1 で終了する

#### Scenario: spec-review-result.md が見つからない

- **WHEN** propose は正常完了したが spec-review セッション完了後に `fetchSpecReviewResult` がリトライ後も null を返す
- **THEN** state.status を `failed`、error.code を `SPEC_REVIEW_RESULT_NOT_FOUND` で記録し、stderr に `Spec-review result file not found on branch '<branch>'.` を出力し exit code 1 で終了する

#### Scenario: 必要な config 項目が揃っている (既存挙動維持)

- **WHEN** config と GitHub token が揃い、cwd が GitHub リモートを持つ git repo で、request.md がパース可能
- **THEN** ジョブ ID を発行し state file を作成し、propose セッション → spec-review セッションを直列で作成し、進捗を stdout にリアルタイム表示し、各 step 完了時に state file を更新する

#### Scenario: config に apiKey または agent.id が無い

- **WHEN** `~/.config/specrunner/config.json` が存在しないか、apiKey / agent.id / environment.id のいずれかが欠けている
- **THEN** `Run 'specrunner init' first.` を stderr に出力し exit code 1 で終了する

#### Scenario: GitHub token が欠けている

- **WHEN** config の `github.accessToken` が未設定
- **THEN** `Run 'specrunner login' first.` を stderr に出力し exit code 1 で終了する

#### Scenario: cwd が git repo ではない

- **WHEN** cwd で `.git` ディレクトリが見つからない
- **THEN** `Not a git repository.` を stderr に出力し exit code 1 で終了する

#### Scenario: origin が GitHub ではない

- **WHEN** `git remote get-url origin` の出力が github.com 以外を指す
- **THEN** `'origin' must point to github.com.` を stderr に出力し exit code 1 で終了する
