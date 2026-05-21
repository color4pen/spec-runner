## Requirements

### Requirement: `specrunner` バイナリは noun-verb 体系のサブコマンド群を提供する

`specrunner` CLI は SHALL `request` / `job` / `runtime` の 3 名詞グループと `init` / `login` / `doctor` の環境系コマンドを提供する。引数なし、または不明なサブコマンドが渡された場合は usage を stderr に出力し、exit code 2 で MUST 終了する。

旧 top-level コマンド `ps` / `rm` / `resume` / `finish` は SHALL NOT 提供される（廃止）。不明なサブコマンドとして `Unknown command: ps` 等を返す。

#### Scenario: 引数なしで実行された場合

- **WHEN** ユーザーが `specrunner` をサブコマンドなしで実行する
- **THEN** stderr に request / job / 環境系の 3 グループにまとめた usage を出力し、exit code 2 で終了する

#### Scenario: 旧 top-level `ps` を実行した場合

- **WHEN** ユーザーが `specrunner ps` を実行する
- **THEN** `Unknown command: ps` を stderr に出し exit code 2 で終了する

#### Scenario: 旧 top-level `resume` を実行した場合

- **WHEN** ユーザーが `specrunner resume <slug>` を実行する
- **THEN** `Unknown command: resume` を stderr に出し exit code 2 で終了する

#### Scenario: 旧 top-level `finish` を実行した場合

- **WHEN** ユーザーが `specrunner finish <slug>` を実行する
- **THEN** `Unknown command: finish` を stderr に出し exit code 2 で終了する

### Requirement: `specrunner --help` は主語別グルーピングで表示される

`specrunner --help` は MUST 以下の 4 ブロック構造で usage を stdout に出力する。exit code 0 で終了する。

```
request commands:
  request new <slug>            template から request.md を作る
  request generate "<text>"     LLM 生成で request.md を作る
  request ls                    active 配下の request 一覧
  request show <slug>           request.md の本文を表示
  request rm <slug>             active 配下から削除
  request validate <file|slug>  構文 / 規律 check
  request template              雛形 markdown を stdout
  request review <slug|file>    architect agent によるレビュー

job commands:
  job start <request-slug|file>  pipeline 開始、jobId 発行
  job ls                         全 job 一覧
  job show <jobId|slug>          job state 詳細
  job rm <jobId>                 job state file 削除
  job resume <slug>              halted job を再開
  job finish <slug>              PR merge + archive

environment commands:
  init                           config scaffold
  login                          GitHub Device Flow OAuth
  doctor                         環境診断
  runtime setup|status|reset     Manage Anthropic runtime resources

Aliases:
  run <slug|file>                job start の互換 alias
```

#### Scenario: `--help` または `-h` が渡された場合

- **WHEN** ユーザーが `specrunner --help` を実行する
- **THEN** stdout に request / job / environment の 3 グループと Aliases セクションにまとめた usage を出力し、exit code 0 で終了する

#### Scenario: `--help` の Aliases セクションに `run` が記載されている

- **WHEN** ユーザーが `specrunner --help` を実行する
- **THEN** Aliases セクションに `run` が `job start` の互換 alias として記載されている

### Requirement: `specrunner request` サブコマンド群が動作する

`specrunner request` は SHALL 以下の 8 サブコマンドを提供する。

| サブコマンド | 機能 |
|---|---|
| `new <slug>` | template から request.md を作る |
| `generate "<text>"` | LLM 生成で request.md を作る（旧 `request create` の rename） |
| `ls` | active 配下の request 一覧（旧 `request list` の rename） |
| `show <slug>` | request.md の本文を stdout に表示 |
| `rm <slug>` | active 配下から削除 |
| `validate <file|slug>` | 構文 / 規律 check（静的、LLM 不使用）。slug で active 配下を解決する |
| `template` | 雛形 markdown を stdout |
| `review <slug|file> [--json]` | architect agent によるレビュー（one-shot LLM、state-less）。slug で active 配下を解決する。`--json` フラグで機械可読 JSON を stdout に出力する |

旧 `request create` は SHALL NOT 動作する（`Unknown request subcommand: create` を返す）。
旧 `request list` は SHALL NOT 動作する（`Unknown request subcommand: list` を返す）。

#### Scenario: `specrunner request show <slug>` が request.md を表示する

- **WHEN** `specrunner request show my-feature` を実行する
- **THEN** `specrunner/requests/active/my-feature/request.md` の本文を stdout に出力し exit code 0 で終了する

#### Scenario: `specrunner request validate <slug>` が slug で解決する

- **WHEN** `specrunner request validate my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/requests/active/my-feature/request.md` を対象として validation を実行する

#### Scenario: `specrunner request review <slug>` が slug で解決する

- **WHEN** `specrunner request review my-feature` を実行する（file path ではなく slug 指定）
- **THEN** `specrunner/requests/active/my-feature/request.md` を対象としてレビューを実行する

#### Scenario: 旧 `request create` を実行した場合

- **WHEN** ユーザーが `specrunner request create "..."` を実行する
- **THEN** `Unknown request subcommand: create` を stderr に出し exit code 2 で終了する

#### Scenario: 旧 `request list` を実行した場合

- **WHEN** ユーザーが `specrunner request list` を実行する
- **THEN** `Unknown request subcommand: list` を stderr に出し exit code 2 で終了する

### Requirement: `specrunner job` サブコマンド群が動作する

`specrunner job` は SHALL 以下の 6 サブコマンドを提供する。

| サブコマンド | 機能 |
|---|---|
| `start <request-slug\|file>` | pipeline 開始、jobId 発行（旧 `run` の主流名）。slug / file path 両方を受ける |
| `ls` | 全 job 一覧（旧 `ps`） |
| `show <jobId\|slug>` | job state の主要フィールド（jobId / status / branch / step / createdAt / updatedAt）を stdout に表示 |
| `rm <jobId>` | job state file 削除 |
| `resume <slug>` | halted job を再開 |
| `finish <slug>` | PR merge + archive |

不明な job サブコマンドは MUST `Unknown job subcommand: <name>` を stderr に出し exit code 2 で終了する。

#### Scenario: `specrunner job start <slug>` で pipeline を起動する

- **WHEN** `specrunner job start my-feature` を実行する（slug 指定）
- **THEN** `specrunner/requests/active/my-feature/request.md` を対象として pipeline を開始する

#### Scenario: `specrunner job start <file>` で pipeline を起動する

- **WHEN** `specrunner job start path/to/request.md` を実行する（file path 指定）
- **THEN** 指定された request.md ファイルを対象として pipeline を開始する

#### Scenario: `specrunner job ls` で job 一覧を表示する

- **WHEN** `specrunner job ls` を実行する
- **THEN** `~/.local/share/specrunner/jobs/` 以下の job state をテーブル表示する（旧 `ps` と同等）

#### Scenario: `specrunner job show <jobId>` で job state を表示する

- **WHEN** `specrunner job show <jobId>` を実行する
- **THEN** jobId / status / branch / step / createdAt / updatedAt の主要フィールドを stdout に表示し exit code 0 で終了する

#### Scenario: 不明な job サブコマンドを実行した場合

- **WHEN** ユーザーが `specrunner job unknown` を実行する
- **THEN** `Unknown job subcommand: unknown` を stderr に出し exit code 2 で終了する

### Requirement: `specrunner run <slug>` は `job start <slug>` の唯一の互換 alias として動作する

`specrunner run <slug>` は MUST `specrunner job start <slug>` と同等に動作する唯一の互換 alias である。slug / file path 両方を受ける。それ以外の旧 alias（`ps` / top-level `rm` / top-level `resume` / top-level `finish`）は SHALL NOT 提供される。

#### Scenario: `specrunner run <slug>` が `job start` に展開される

- **WHEN** `specrunner run my-feature` を実行する
- **THEN** `specrunner job start my-feature` と同一の挙動で pipeline を開始する

### Requirement: `job start` / `job resume` / `job finish` は worktree guard の対象である

`job start` / `job resume` / `job finish` は MUST linked worktree 内から実行された場合 worktree guard error になる。`job ls` / `job rm` / `job show` は linked worktree 内でも実行できる。

subcommand dispatch path は MUST top-level command と同じ worktree guard を通す（既存の `WORKTREE_GUARDED_COMMANDS` set による guard を subcommand dispatch でも適用する）。

#### Scenario: linked worktree 内で `job start` を実行した場合

- **WHEN** linked worktree ディレクトリ内で `specrunner job start <slug>` を実行する
- **THEN** worktree guard error を出力し exit code 1 で終了する（pipeline は起動されない）

#### Scenario: linked worktree 内で `job ls` を実行した場合

- **WHEN** linked worktree ディレクトリ内で `specrunner job ls` を実行する
- **THEN** worktree guard をスキップし、通常通り job 一覧を表示する

#### Scenario: linked worktree 内で `job rm` を実行した場合

- **WHEN** linked worktree ディレクトリ内で `specrunner job rm <jobId>` を実行する
- **THEN** worktree guard をスキップし、通常通り job state file を削除する

#### Scenario: linked worktree 内で `job show` を実行した場合

- **WHEN** linked worktree ディレクトリ内で `specrunner job show <jobId>` を実行する
- **THEN** worktree guard をスキップし、通常通り job state を表示する

### Requirement: `specrunner request new <slug>` は template から request.md を作成する

`specrunner request new <slug> [--type <type>]` は MUST 以下を実行する:

1. slug が `/^[a-z0-9][a-z0-9-]{0,63}$/` にマッチしない場合は slug validation error を stderr に出し exit code 2 で終了する
2. `checkSlugCollision(cwd, slug)` で active / merged 配下の slug 重複をチェックする。重複時は `SLUG_COLLISION` error で exit 1
3. `--type` で指定された type（デフォルト: `new-feature`）の template を生成する
4. `specrunner/requests/active/<slug>/request.md` にファイルを書き出す
5. stderr に `Created: specrunner/requests/active/<slug>/request.md` を出力する
6. exit code 0 で終了する

#### Scenario: 新規 slug で request new

- **WHEN** `specrunner request new my-feature` を実行し、`my-feature` slug が未使用
- **THEN** `specrunner/requests/active/my-feature/request.md` が作成され、stderr に `Created: specrunner/requests/active/my-feature/request.md` が出力され、exit code 0

#### Scenario: 既存 slug で request new（slug collision）

- **WHEN** `specrunner request new existing-slug` を実行し、`existing-slug` が active に存在
- **THEN** `SLUG_COLLISION` error メッセージが出力され、exit code 1

#### Scenario: 不正 slug で request new（path traversal 防止）

- **WHEN** `specrunner request new "../../evil"` を実行する
- **THEN** slug validation error を stderr に出し exit code 2 で終了する

### Requirement: `specrunner request show <slug>` は request.md の本文を表示する

`specrunner request show <slug>` は MUST `specrunner/requests/active/<slug>/request.md` の内容を stdout に出力する。slug が active 配下に存在しない場合は `Request not found: <slug>` を stderr に出力し exit code 1 で終了する。

slug は `/^[a-z0-9][a-z0-9-]{0,63}$/` に MUST マッチする。マッチしない場合は exit code 2 で拒否する。

#### Scenario: 存在する slug で request show

- **WHEN** `specrunner request show my-feature` を実行し、active 配下に `my-feature/request.md` が存在する
- **THEN** request.md の全文が stdout に出力され、exit code 0

#### Scenario: 存在しない slug で request show

- **WHEN** `specrunner request show nonexistent` を実行し、active 配下に `nonexistent` が存在しない
- **THEN** stderr に `Request not found: nonexistent` を出力し、exit code 1

### Requirement: `specrunner request rm <slug>` は active 配下から request を削除する

`specrunner request rm <slug>` は MUST `specrunner/requests/active/<slug>/` ディレクトリを再帰削除する。slug が active 配下に存在しない場合は `Request not found: <slug>` を stderr に出力し exit code 1 で終了する。

slug は `/^[a-z0-9][a-z0-9-]{0,63}$/` に MUST マッチする。マッチしない場合は exit code 2 で拒否する（path traversal 防止）。

#### Scenario: 存在する slug で request rm

- **WHEN** `specrunner request rm my-feature` を実行し、active 配下に `my-feature/` が存在する
- **THEN** ディレクトリが削除され、stderr に削除メッセージが出力され、exit code 0

#### Scenario: 存在しない slug で request rm

- **WHEN** `specrunner request rm nonexistent` を実行し、active 配下に `nonexistent` が存在しない
- **THEN** stderr に `Request not found: nonexistent` を出力し、exit code 1

#### Scenario: path traversal slug で request rm

- **WHEN** `specrunner request rm "../../etc"` を実行する
- **THEN** slug validation error を stderr に出し exit code 2 で終了する（ファイルシステム外への削除を防ぐ）

### Requirement: `specrunner job show <jobId|slug>` は job state の詳細を表示する

`specrunner job show <jobId|slug>` は MUST 以下の 6 フィールドを stdout に出力する:

- `Job ID`: 完全な UUID
- `Status`: job の現在ステータス
- `Branch`: 関連ブランチ名（未設定時は `(none)`）
- `Step`: 現在/最終ステップ名（未設定時は `(none)`）
- `Created`: createdAt タイムスタンプ
- `Updated`: updatedAt タイムスタンプ

入力が jobId（UUID 形式）の場合は直接 load する。slug の場合は全 job を走査し `getJobSlug()` で一致するものを解決する（複数該当時は最新 `updatedAt` 優先）。対象が存在しない場合は stderr にエラーを出力し exit code 1 で終了する。

#### Scenario: jobId で job show（6 フィールド表示）

- **WHEN** `specrunner job show abcd1234-...` を実行し、対応する job が存在する
- **THEN** Job ID / Status / Branch / Step / Created / Updated の 6 フィールドが stdout に出力され、exit code 0

#### Scenario: slug で job show

- **WHEN** `specrunner job show my-feature` を実行し、slug が `my-feature` の job が存在する
- **THEN** 6 フィールドが stdout に出力され、exit code 0

#### Scenario: 存在しない入力で job show

- **WHEN** `specrunner job show nonexistent` を実行し、該当 job が存在しない
- **THEN** stderr にエラーメッセージを出力し、exit code 1

### Requirement: job サブコマンドは jobId 引数を UUID 形式で検証する

`job rm` / `job show` / `job resume` / `job finish` の `<jobId>` 引数は `/^[a-f0-9-]{36}$/` にマッチしない場合、`Error: invalid jobId format` を stderr に出力し exit code 1 で終了する。これにより `~/.local/share/specrunner/jobs/` ディレクトリ外へのパス解決（`../` 等）を防ぐ。

#### Scenario: UUID でない jobId を渡した場合にエラーを返す

- **GIVEN** ユーザーが `specrunner job rm ../../../etc/passwd` を実行する
- **WHEN** jobId バリデーションが走る
- **THEN** `Error: invalid jobId format` を stderr に出力して exit code 1 で終了する
- **AND** ファイルシステムへのアクセスは行われない

#### Scenario: 正常 UUID は受理される

- **WHEN** ユーザーが `specrunner job rm abcd1234-ef56-7890-abcd-ef1234567890` を実行する
- **THEN** jobId validation を通過し、通常の削除処理に進む

### Requirement: `request new` / `request show` / `request rm` / `request validate` / `request review` は slug validation を実行する

`request new <slug>` / `request show <slug>` / `request rm <slug>` / `request validate <slug>` / `request review <slug>` は slug 入力に対し MUST `/^[a-z0-9][a-z0-9-]{0,63}$/` でバリデーションを実行する。マッチしない入力は exit code 2 で拒否し、path traversal（`../../` 等）を防ぐ。

#### Scenario: 不正 slug（path traversal）を拒否する

- **WHEN** `specrunner request rm "../../etc/passwd"` を実行する
- **THEN** stderr に validation error を出力し exit code 2 で終了する。ファイルシステム操作は実行されない

#### Scenario: 正常 slug は受理される

- **WHEN** `specrunner request new "my-feature-123"` を実行する（slug は `/^[a-z0-9][a-z0-9-]{0,63}$/` にマッチ）
- **THEN** slug validation を通過し、通常の処理に進む

## Renamed

- "`specrunner` バイナリは 6 つのサブコマンドを提供する" → "`specrunner` バイナリは noun-verb 体系のサブコマンド群を提供する"
- "`specrunner run` は起動前に fail-fast バリデーションを固定順序で実行する" → "`specrunner job start` は起動前に fail-fast バリデーションを固定順序で実行する"
- "`specrunner run <request.md>` は propose と spec-review セッションを直列で実行する" → "`specrunner job start <request.md|slug>` は propose と spec-review セッションを直列で実行する"
- "`specrunner request create` / `specrunner request review` は LLM 呼び出しの進捗を stderr に出力する" → "`specrunner request generate` / `specrunner request review` は LLM 呼び出しの進捗を stderr に出力する"
- "`specrunner run` の preflight は GitHub token 取得元を info ログに出力する" → "`specrunner job start` の preflight は GitHub token 取得元を info ログに出力する"

## Removed

- "`specrunner ps` は実行中のジョブを一覧表示する"
