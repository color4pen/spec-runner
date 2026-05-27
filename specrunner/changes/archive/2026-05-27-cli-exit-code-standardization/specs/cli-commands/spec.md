## Requirements

### Requirement: 全 CLI コマンドの exit code は 0/1/2 の 3 値に統一される

全コマンドの exit code は MUST 以下の 3 値のいずれかでなければならない。SIGINT/SIGTERM 起因の exit 130 はシグナル規約として対象外とする。

| exit code | 意味 | 例 |
|---|---|---|
| 0 | 成功 | pipeline 完走、finish 成功、review approve |
| 1 | 一般エラー | pipeline halt、escalation、API エラー、merge 失敗 |
| 2 | 引数エラー | 不正な slug、存在しないファイル、フラグの矛盾、前提条件不足 |

#### Scenario: init で非推奨の --runtime flag を使用

- **WHEN** `specrunner init --runtime managed` を実行する
- **THEN** stderr にエラーを出力し exit code 2 で終了する（引数エラー）

#### Scenario: init で非推奨の --runtime local flag を使用

- **WHEN** `specrunner init --runtime local` を実行する
- **THEN** stderr にエラーを出力し exit code 2 で終了する（引数エラー）

#### Scenario: job cancel で不正な jobId フォーマット

- **WHEN** `specrunner job cancel ../etc/passwd` を実行する
- **THEN** `invalid jobId format` を stderr に出力し exit code 2 で終了する

### Requirement: `SpecRunnerError` の exit code は宣言的マッピングで導出される

`SpecRunnerError` は MUST `exitCode: ExitCode` プロパティを持ち、エラーコードから exit code を宣言的に導出する。各コマンドハンドラが個別に exit code を決めるのではなく、`EXIT_CODE_MAP` テーブルに基づいて一貫した値を返す。

マッピング対象（exit 2 = 引数/前提条件エラー）:
- `CONFIG_MISSING` — config ファイルが存在しない
- `CONFIG_INCOMPLETE` — 必須フィールドが不足
- `CONFIG_INVALID` — 設定ファイルの形式不正
- `REQUEST_MD_INVALID` — 入力ファイルの形式不正
- `NOT_GIT_REPO` — git リポジトリ外で実行
- `REMOTE_NOT_GITHUB` — origin が GitHub 以外
- `WORKTREE_GUARD` — worktree 内から実行不可なコマンド

上記以外のエラーコードはデフォルトで exit 1（一般エラー）。

#### Scenario: SpecRunnerError が throw されたとき exit code が自動導出される

- **WHEN** `CONFIG_MISSING` コードの `SpecRunnerError` が throw される
- **THEN** `err.exitCode` は 2 である

#### Scenario: 未登録のエラーコードはデフォルト exit 1

- **WHEN** `EXIT_CODE_MAP` に未登録のエラーコードの `SpecRunnerError` が throw される
- **THEN** `err.exitCode` は 1 である

### Requirement: `specrunner job start` は起動前に fail-fast バリデーションを固定順序で実行する

`specrunner run` は MUST 以下の 5 段階を **この順序で** 実行し、最初に失敗したステップで即時終了する。後続ステップの評価は行わない。

1. `~/.config/specrunner/config.json` が存在すること（なければ `Run 'specrunner init' first.` + exit 2）
2. `apiKey` / `agentId` / `environmentId` / `githubToken` がすべて config に揃っていること（欠けた項目に応じて `Run 'specrunner init' first.` または `Run 'specrunner login' first.` + exit 2）
3. cwd が git リポジトリであること（`.git` 未発見なら `Not a git repository.` + exit 2）
4. `git remote get-url origin` が `github.com` を指すこと（非 GitHub なら `'origin' must point to github.com.` + exit 2）
5. 引数の `<request.md>` ファイルが存在しパース可能であること（存在しない場合は `Request file not found: <path>` + exit 1）

#### Scenario: config が存在しない（ステップ 1 で失敗）

- **WHEN** `~/.config/specrunner/config.json` が存在しない状態で `specrunner run req.md` を実行する
- **THEN** ステップ 1 で即時 exit 2 し、git repo チェック等は実行しない

#### Scenario: github token が欠けている（ステップ 2 で失敗）

- **WHEN** config は存在するが `github.accessToken` が未設定
- **THEN** ステップ 2 で `Run 'specrunner login' first.` を stderr に出し exit 2（前提条件不足）。cwd チェック等は実行しない

#### Scenario: origin が GitHub 以外（ステップ 4 で失敗）

- **WHEN** config と token は揃い cwd は git repo だが origin が gitlab.com を指す
- **THEN** ステップ 4 で `'origin' must point to github.com.` を stderr に出し exit 2（前提条件不足）

### Requirement: CLI handler は `process.exit()` を直接呼ばず exit code を返す

handler 関数は SHOULD `Promise<number>` を返し、`command-registry.ts` または `bin/specrunner.ts` が `process.exit()` を統一的に呼ぶ。handler 内部からの `process.exit()` 直接呼び出しは SHALL NOT 行う。

対象: `init` / `login` / `job show` / `job ls` / `managed setup` / `managed status` / `managed reset`

例外: `process.exit(130)` (SIGINT handler) はシグナル規約として許容される。

#### Scenario: handler が exit code を返す場合、CLI が process.exit を呼ぶ

- **WHEN** `init` コマンドハンドラが `Promise<2>` を返す
- **THEN** `bin/specrunner.ts` が `process.exit(2)` を呼ぶ（handler 内部では呼ばない）
