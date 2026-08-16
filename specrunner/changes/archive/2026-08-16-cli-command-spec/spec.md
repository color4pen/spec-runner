# Spec: CommandSpec 由来の CLI 契約

## Requirements

### Requirement: 全 public command path が単一 registry から列挙でき、canonical と alias を区別する

registry は全 public command path を列挙する API を公開し、そのソース・オブ・トゥルースは
CommandSpec 木でなければならない (MUST)。列挙は canonical path と alias を区別できなければ
ならず (MUST)、alias 入力の解決は canonical path と invokedAs を分離して返さなければならない
(MUST)。手書き一覧との突合ではなく spec を正本とする。

#### Scenario: canonical のみの列挙に alias が含まれない

**Given** `run` が `job start` の alias として登録された CommandSpec 木
**When** 列挙 API を alias 非包含（canonical のみ）で呼ぶ
**Then** 返る path 集合に `["job","start"]` が含まれ、`["run"]` は含まれない

#### Scenario: alias を含む列挙に alias が現れる

**Given** 同じ registry
**When** 列挙 API を alias 包含で呼ぶ
**Then** 返る path 集合に canonical `["job","start"]` と alias `["run"]` の両方が現れる

#### Scenario: alias 入力を canonical + invokedAs に解決する

**Given** 同じ registry
**When** `run` を先頭トークンとして解決 API を呼ぶ
**Then** canonicalPath は `["job","start"]`、invokedAs は `["run"]` として返り、両者は区別される

#### Scenario: 全 public command path が spec から取得できる

**Given** CommandSpec 木
**When** canonical path を列挙する
**Then** 各 leaf コマンド（例 `["job","resume"]` / `["credentials","set"]` / `["doctor","repair"]`）が
その path で列挙結果に含まれる

### Requirement: `run` は `job start` の alias として解決され契約を target から継承する

`run` の spec は target への参照（aliasOf）のみを持ち、flags / worktree guard / requiresRepo を
再宣言してはならない (MUST)。これらは解決時に target(`job start`)の spec から解決されなければ
ならない (MUST)。

#### Scenario: run の flags が job start と同一に解決される

**Given** `run` が `aliasOf: ["job","start"]` を持つ spec
**When** `run` の実効 flags を解決する
**Then** `job start` の flags（`--detach` / `--json` / `--issue` / `--no-worktree` / `--verbose` / `--quiet`）と同一である

#### Scenario: run の worktree guard が job start と同一に働く

**Given** worktree 内から `run <slug>` を実行する
**When** dispatch が worktree guard を評価する
**Then** `job start` と同じく guard が発火し exit 2 と worktree guard 文言を出力する

### Requirement: `doctor` は default action、`doctor repair <slug>` は child command として表現される

`doctor` は default action(diagnose) と child(`repair`) を同時に持つ command node として表現され
なければならない (MUST)。`doctor` は repo 外で実行可能、`doctor repair` は repo 必須でなければ
ならない (MUST)。`doctor repair` は inline 分岐ではなく command path として存在しなければならない (MUST)。

#### Scenario: doctor が repo 外で実行できる

**Given** git repository 外の作業ディレクトリ
**When** `specrunner doctor` を実行する
**Then** repo-required エラーを出さず diagnose を実行する

#### Scenario: doctor repair が repo を要求する

**Given** git repository 外の作業ディレクトリ
**When** `specrunner doctor repair <slug>` を実行する
**Then** repo-required エラー（NOT_GIT_REPO, exit 2）を出して halt する

#### Scenario: doctor repair が command path として列挙される

**Given** CommandSpec 木
**When** canonical path を列挙する
**Then** `["doctor","repair"]` が含まれる

### Requirement: requiresRepo は parent から継承し child で override できる

CommandSpec は requiresRepo を parent から child へ継承し、child が override できなければならない
(MUST)。全 public command の実効 repo requirement は移行前と意味的に同一でなければならない (MUST)。

#### Scenario: child が parent の requiresRepo を継承する

**Given** requiresRepo:true の parent spec と、requiresRepo を明示しない child spec
**When** child の実効 requiresRepo を解決する
**Then** true になる

#### Scenario: child が parent の requiresRepo を override する

**Given** requiresRepo:true の parent spec と、requiresRepo:false を明示する child spec
**When** child の実効 requiresRepo を解決する
**Then** false になる

#### Scenario: job 配下の repo-optional leaf が保存される

**Given** 移行後の registry
**When** `job start` / `job ls` / `job show` / `job wait` の実効 requiresRepo を解決する
**Then** いずれも false であり、repo 外実行が repo-required エラーで halt しない

### Requirement: worktree guard は spec 宣言から導出される

worktree guard は各 spec の宣言から導出されなければならず (MUST)、`bin/specrunner.ts` の手書き Set と
registry の parent 単位 `guardedSubcommands` Set は存在してはならない (MUST)。

#### Scenario: guarded leaf が worktree 内で拒否される

**Given** worktree 内から `job archive <slug>` を実行する
**When** dispatch が spec の worktree guard を評価する
**Then** guard が発火し exit 2 と worktree guard 文言を出力する

#### Scenario: 非 guarded leaf が worktree 内で拒否されない

**Given** worktree 内から `job ls` を実行する
**When** dispatch が spec の worktree guard を評価する
**Then** guard は発火せず通常フローに進む

### Requirement: deprecated flag は通常 help に出ず移行エラー挙動を保つ

deprecated と宣言された flag は生成される通常 help に列挙されてはならない (MUST)。その flag を指定
した場合の移行エラーメッセージと非ゼロ終了は保存されなければならない (MUST)。

#### Scenario: login help に --provider が出ない

**Given** `login` の spec が `--provider` を deprecated として宣言する
**When** `specrunner login --help` の help を生成する
**Then** 出力に `--provider` が含まれない

#### Scenario: login --provider が移行エラーで拒否される

**Given** `login` コマンド
**When** `specrunner login --provider claude` を実行する
**Then** parser が FlagParseError を投げ、`credentials set claude-code` を含む移行案内を出して非ゼロ終了する

### Requirement: help(top-level / parent / leaf) は CommandSpec から生成され pin 文言を保持する

top-level / parent / leaf の help は CommandSpec から生成されなければならず (MUST)、既存テストが
pin する help 文言（`--detach` 説明 / `job wait` 誘導 / `--provider` 非表示 / `--from`・`--apply-canon`・
`Mutually exclusive`・`Valid steps:`・`composite step` / `job prune` 行の worktree+sidecar 言及 /
`Request commands`・`Job commands` グループ見出し / Aliases に `run` のみ 等）は生成後 help に対して
保持されなければならない (MUST)。手書きの top-level 一覧はコマンド追加/削除が自動反映される生成へ
置き換えられなければならない (MUST)。

#### Scenario: top-level help がグループ見出しと実コマンドを含む

**Given** CommandSpec 木
**When** top-level `--help` を生成する
**Then** 出力に `Request commands` / `Job commands` グループ見出しと `request new` / `job start` / `job wait` /
`job archive` が含まれ、Aliases セクションには `run` のみが現れる

#### Scenario: leaf help が pin された flag 群を含む

**Given** `job resume` の spec
**When** `specrunner job resume --help` を生成し exit 0 で出力する
**Then** 出力に `--from` / `--prompt` / `--apply-canon` / `--adopt-commits` / `--detach` / `Mutually exclusive` /
`Valid steps:` / `composite step` が含まれ、`No detailed help available.` は含まれない

#### Scenario: top-level help に detach 説明と job wait 誘導が残る

**Given** CommandSpec 木
**When** top-level help を生成する
**Then** 出力に `--detach` と `job wait` が含まれ、`即座に` / `returns immediately` は含まれない

### Requirement: parser は spec 宣言由来で型検証し、複合 positional の domain を狭めない

integer / enum など既存契約と等価に表現可能な値の型検証は spec 宣言由来で parser 層が行わなければ
ならない (MUST)。handler 内の重複した数値検証は除去されなければならない (MUST)。複合参照 positional
（slug|file 等）は string または専用 domain validator として保持され、入力 domain を狭めては
ならない (MUST)。

#### Scenario: --issue の非整数が parser で拒否される

**Given** `--issue` が integer(min 1) として spec 宣言される
**When** `specrunner run <slug> --issue abc` を実行する
**Then** parser 層で拒否され exit 2（ARG_ERROR）になる

#### Scenario: --issue の正整数が数値として受理される

**Given** 同じ spec
**When** `--issue 42` を解析する
**Then** handler は再検証なしに数値 42 を受け取る

#### Scenario: request validate が file 入力を slug 検証で狭めない

**Given** `request validate` の positional が file|slug の複合 domain
**When** 既存ファイルパスを渡す
**Then** slug 形式検証で拒否されず、ファイルとして検証に進む

### Requirement: dispatch は単一 flow に統一され SpecRunnerError を両経路で正規化する

subcommand 経路と normal 経路の dispatch は単一 flow に統一されなければならない (MUST)。
`SpecRunnerError` は subcommand / normal どちらの入口から到達しても `Error` / `Hint` / exitCode 表示に
正規化されなければならない (MUST)。それ以外の既存の exit code・出力仕様は保存されなければならない (MUST)。

#### Scenario: subcommand 経路の SpecRunnerError が Error/Hint/exitCode で表示される

**Given** subcommand（例 `job archive`）の handler が `SpecRunnerError` を投げる
**When** dispatch がその例外を捕捉する
**Then** `Error: {message}` と `Hint: {hint}` を stderr に出力し、その exitCode で終了する（Fatal 縮退しない）

#### Scenario: 未知コマンド / 未知サブコマンドの文言が保存される

**Given** 統一後の dispatch
**When** `specrunner ps` および `specrunner job rm x` を実行する
**Then** それぞれ `Unknown command: ps` / `Unknown job subcommand: rm` を出力し exit 2 で終了する

### Requirement: hint / guide の実在検査は spec 由来の列挙 API を使う

hint / ガイド系の「案内するコマンドが実在するか」の検査は、registry の列挙 API を正本として
使わなければならない (MUST)。alias(`run`)を参照する案内は実在扱いされなければならず (MUST)、
かつ alias は canonical command 集合を二重計上してはならない (MUST)。

#### Scenario: alias を参照する hint が実在扱いされる

**Given** `specrunner run <slug>` を案内する hint 文字列
**When** 列挙 API（alias 包含）で実在検査する
**Then** `run` は実在コマンドとして検査を通過する

#### Scenario: 存在しないコマンドを参照する hint が検出される

**Given** `specrunner frobnicate` を案内する hint 文字列
**When** 列挙 API で実在検査する
**Then** 未登録コマンドとして検出される
