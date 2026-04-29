## Purpose

`specrunner` CLI のサブコマンド群（`init` / `login` / `run` / `ps`）の振る舞い・引数・終了コード・stdout/stderr 出力を定義する。
## Requirements
### Requirement: `specrunner` バイナリは 4 つのサブコマンドを提供する

`specrunner` CLI は SHALL `init`、`login`、`run`、`ps` の 4 サブコマンドを提供する。引数なし、または不明なサブコマンドが渡された場合は usage を stderr に出力し、exit code 2 で MUST 終了する。

#### Scenario: 引数なしで実行された場合

- **WHEN** ユーザーが `specrunner` をサブコマンドなしで実行する
- **THEN** stderr に各サブコマンドの 1 行説明を含む usage を出力し、exit code 2 で終了する

#### Scenario: 不明なサブコマンドが渡された場合

- **WHEN** ユーザーが `specrunner foobar` を実行する
- **THEN** `Unknown command: foobar` を stderr に出し、usage を続けて表示し、exit code 2 で終了する

#### Scenario: `--help` または `-h` が渡された場合

- **WHEN** ユーザーが `specrunner --help` を実行する
- **THEN** stdout に usage を出力し、exit code 0 で終了する

### Requirement: `specrunner init` は Agent と Environment を作成または同期する

`specrunner init` は MUST Anthropic API key を環境変数 `ANTHROPIC_API_KEY` または既存 config から取得し、Agent と Environment を冪等に作成または更新し、ID を `~/.config/specrunner/config.json` に SHALL 保存する。

#### Scenario: API key が無い

- **WHEN** `ANTHROPIC_API_KEY` が未設定で config にも apiKey が無い状態で `specrunner init` を実行する
- **THEN** `ANTHROPIC_API_KEY を設定するか --api-key で渡してください` を stderr に出し、exit code 1 で終了する

#### Scenario: 初回実行（config 未作成）

- **WHEN** `~/.config/specrunner/config.json` が存在しない状態で `specrunner init` を実行する
- **THEN** Anthropic に Agent を 1 つ、Environment を 1 つ作成し、両 ID と apiKey を含む config をパーミッション 0600 で作成し、各ステップを stdout に表示し exit code 0 で終了する

#### Scenario: 既存 Agent / Environment があり差分がない

- **WHEN** config に agent.id と environment.id が記録された状態で `specrunner init` を実行し、CLI 側 Agent 定義と既存 Agent の definitionHash が一致する
- **THEN** 既存リソースを再利用する旨を stdout に出し、新規作成は行わず exit code 0 で終了する

#### Scenario: Agent 定義に差分がある

- **WHEN** CLI 側 Agent 定義のハッシュが既存 Agent と異なる
- **THEN** `agents.update` を実行して definitionHash を config に保存し、更新内容を stdout に表示する

### Requirement: `specrunner login` は GitHub Device Flow OAuth でトークンを取得する

`specrunner login` は MUST GitHub OAuth Device Flow を実行し、`repo` スコープのアクセストークンを config の `github.accessToken` に SHALL 保存する。

#### Scenario: 通常成功フロー

- **WHEN** ユーザーが `specrunner login` を実行し、表示された `verification_uri` で `user_code` を入力し承認する
- **THEN** access token を取得し config に `github.accessToken` / `tokenObtainedAt` / `scopes` を保存し、`Logged in as <login>` を stdout に表示し exit code 0 で終了する

#### Scenario: 認証コード期限切れ

- **WHEN** ユーザーが期限内に承認せず、GitHub からの応答が `expired_token` になる
- **THEN** `Authorization timed out. Run 'specrunner login' again.` を stderr に出力し exit code 1 で終了する

#### Scenario: ユーザーが拒否

- **WHEN** ユーザーが GitHub 上で承認を拒否し `access_denied` が返る
- **THEN** `Authorization denied by user.` を stderr に出力し exit code 1 で終了する

### Requirement: `specrunner run` は起動前に fail-fast バリデーションを固定順序で実行する

`specrunner run` は MUST 以下の 5 段階を **この順序で** 実行し、最初に失敗したステップで即時終了する。後続ステップの評価は行わない。

1. `~/.config/specrunner/config.json` が存在すること（なければ `Run 'specrunner init' first.` + exit 1）
2. `apiKey` / `agentId` / `environmentId` / `githubToken` がすべて config に揃っていること（欠けた項目に応じて `Run 'specrunner init' first.` または `Run 'specrunner login' first.` + exit 1）
3. cwd が git リポジトリであること（`.git` 未発見なら `Not a git repository.` + exit 1）
4. `git remote get-url origin` が `github.com` を指すこと（非 GitHub なら `'origin' must point to github.com.` + exit 1）
5. 引数の `<request.md>` ファイルが存在しパース可能であること（存在しない場合は `Request file not found: <path>` + exit 1）

#### Scenario: config が存在しない（ステップ 1 で失敗）

- **WHEN** `~/.config/specrunner/config.json` が存在しない状態で `specrunner run req.md` を実行する
- **THEN** ステップ 1 で即時 exit 1 し、git repo チェック等は実行しない

#### Scenario: github token が欠けている（ステップ 2 で失敗）

- **WHEN** config は存在するが `github.accessToken` が未設定
- **THEN** ステップ 2 で `Run 'specrunner login' first.` を stderr に出し exit 1。cwd チェック等は実行しない

#### Scenario: origin が GitHub 以外（ステップ 4 で失敗）

- **WHEN** config と token は揃い cwd は git repo だが origin が gitlab.com を指す
- **THEN** ステップ 4 で `'origin' must point to github.com.` を stderr に出し exit 1

### Requirement: `specrunner ps` は実行中のジョブを一覧表示する

`specrunner ps` は MUST `~/.local/share/specrunner/jobs/` 以下の状態ファイルをすべて読み込み、`JOB_ID`、`STEP`、`STATUS`、`BRANCH`、`AGE` の 5 列で SHALL テーブル表示する。出力フォーマットの詳細は以下に従う:

- **ソート順**: `createdAt` 降順（新しいジョブが上）
- **JOB_ID**: uuid の先頭 8 文字に短縮する
- **BRANCH**: 40 文字を超える場合は 37 文字 + `...` に truncate する
- **AGE**: `createdAt` からの経過時間を人間可読形式（例: `2m`, `1h`, `3d`）で表示する
- **非 TTY 時**: TAB 区切りの固定フォーマットで出力する（ヘッダ行を含む）。列幅のパディングは不要

#### Scenario: TTY 出力（複数ジョブ）

- **WHEN** stdout が TTY でディレクトリに 3 件の状態ファイルが存在する
- **THEN** 3 行 + ヘッダ行を固定列幅でテーブル表示し、JOB_ID は先頭 8 文字、BRANCH は 40 文字超で truncate、AGE は人間可読で表示し exit code 0 で終了する。createdAt 降順でソートされる

#### Scenario: 非 TTY 出力（パイプ等）

- **WHEN** stdout が非 TTY（パイプ先あり等）でジョブが 2 件存在する
- **THEN** ヘッダ行 + 2 行を TAB 区切りで出力する。列幅パディングは行わない

#### Scenario: ジョブが 1 件もない

- **WHEN** `~/.local/share/specrunner/jobs/` が存在しないか空
- **THEN** `No jobs found.` を stdout に出力し exit code 0 で終了する

#### Scenario: 複数ジョブが存在する

- **WHEN** ディレクトリに 3 件の状態ファイルが存在する
- **THEN** 3 行 + ヘッダ行をテーブル形式で stdout に表示し、JOB_ID は短縮 8 文字、AGE は人間可読（例: `2m`, `1h`）で表示し exit code 0 で終了する

#### Scenario: 破損した状態ファイルがある

- **WHEN** ある状態ファイルが JSON パース不可
- **THEN** `Skipping malformed file: <path>` を stderr に出し、残りのジョブは表示し exit code 0 で終了する

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

