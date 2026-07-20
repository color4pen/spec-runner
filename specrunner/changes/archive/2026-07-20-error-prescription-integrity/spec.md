# Spec: エラー処方の整合

## Requirements

### Requirement: origin 不在の停止処方は `git remote add` を示す

`origin` remote が未設定のまま（かつ cwd が git repository 内で）`run` が停止した際、CLI が出す hint は
`git remote add` を含む処方で MUST あり、`"cd into a git repository"` を含んで MUST NOT。処方は doctor の
`github-origin` check の hint と同趣旨（`origin` を GitHub repo に向ける）で SHALL ある。error code と exit code
は現行（`NOT_GIT_REPO` / exit 2）を維持 SHALL する。

#### Scenario: git repo 内で origin が未設定

**Given** cwd が git repository 内で `origin` remote が未設定
**When** origin 解決（`getOriginInfo`）が停止エラーを投げる
**Then** その `SpecRunnerError.hint` は `"git remote add"` を含み、`"cd into a git repository"` を含まない

#### Scenario: 真の非 git repo 経路は変わらない

**Given** cwd が git repository ではない
**When** origin 解決が `notGitRepoError()` を投げる
**Then** その経路の挙動（code / exit code / 非 git repo 向けメッセージ）は現行のまま保たれる

### Requirement: CLI が処方する全 hint は実在コマンドのみを案内する

CLI が処方する全 hint（`DoctorResult.hint` および `SpecRunnerError` の hint 引数）中の `specrunner <sub>` 参照は、
コマンドレジストリ `COMMANDS`（`src/cli/command-registry.ts`）に実在するコマンド／サブコマンドで MUST ある。
この不変条件を機械検査するテストを SHALL 置く。廃止コマンド `specrunner ps`、改名済み `specrunner managed setup`、
誤った `specrunner job list` を案内する hint は現行コマンドへ置換 MUST する。

#### Scenario: 全 hint の specrunner 参照がレジストリと一致する

**Given** `src/**` の hint（`hint:` プロパティ + `SpecRunnerError` 第2引数）に含まれる全 `specrunner <sub>` 参照
**When** 各参照の最上位トークンを `Object.keys(COMMANDS)` と、（親コマンドなら）第2トークンをその `subcommands` と突き合わせる
**Then** すべての参照が実在コマンド／サブコマンドに一致する

#### Scenario: 架空コマンドの混入を検出する（破壊確認）

**Given** いずれかの hint に `COMMANDS` に無い `specrunner <架空>` を追加した状態
**When** 実在コマンド検査テストを実行する
**Then** テストは fail する

#### Scenario: local-state-writable は廃止コマンドを処方しない

**Given** local 状態ディレクトリが未作成の doctor 実行
**When** `local-state-writable` check の hint を検査する
**Then** hint は `specrunner ps` を含まず、「初回 run 時に自動作成される」旨の説明（または実在コマンド）である

### Requirement: workflow-structure の欠損は `specrunner init` を第一処方にする

`specrunner/` 配下の必要ディレクトリが欠損した際の `workflow-structure` check の hint は、`specrunner init` の実行を
第一処方として MUST 示し、「手作業で作成せよ」を第一処方にして MUST NOT。

#### Scenario: 必要ディレクトリ欠損

**Given** `specrunner/drafts/` または `specrunner/changes/` が存在しない
**When** `workflow-structure` check を実行する
**Then** hint は `specrunner init` を含み、`"Create the missing directories manually."` を第一処方にしない

### Requirement: token 系 hint は `specrunner login` に一本化する

GitHub token 不在／無効時の hint（`github-token-present` / `github-token-valid`）は `specrunner login` を第一処方に
MUST し、`GH_TOKEN` 環境変数と `gh` は従属的な代替として SHALL 表記する。

#### Scenario: token 不在

**Given** GitHub token が解決できない doctor 実行
**When** `github-token-present` check の hint を検査する
**Then** 第一処方が `specrunner login` であり、`GH_TOKEN` / `gh` は代替として続く

### Requirement: doctor human 出力は fail 集合から導出した next steps を末尾に示す

`doctor` の human 出力は、fail した check から依存順（git repo 不在 → `git init` / origin 不在 → `git remote add` /
config 不在 → `specrunner init` / token 不在 → `specrunner login`）に導出した順序付き next steps を末尾に MUST 出す。
fail がゼロのときは next steps を出して MUST NOT。`--json` の出力構造は変更して MUST NOT。

#### Scenario: 作成者相当の fail 集合

**Given** fail 集合が `git-repository` / `github-origin` / `github-token-present`
**When** human 出力を整形する
**Then** next steps が `git init` → `git remote add` → `specrunner login` の順で並ぶ

#### Scenario: 参加者相当の fail 集合

**Given** repo 系 check が全 pass で fail 集合が `config-file-exists` / `github-token-present`
**When** human 出力を整形する
**Then** next steps が `specrunner init` → `specrunner login` の順で並ぶ

#### Scenario: fail ゼロと JSON 不変

**Given** fail が無い doctor 結果
**When** human 出力を整形する
**Then** next steps 節は出力されず、かつ同じ結果の `--json` 出力構造は従来と同一である

### Requirement: config-file-exists は getConfigPath と同一の解決規則で config パスを求める

`config-file-exists` check は、config パスを `getConfigPath()`（`src/util/xdg.ts`、`XDG_CONFIG_HOME` 尊重）と
**同一の解決規則**で MUST 求める。check 独自のパス手組み（`homeDir` 直結合）を MUST NOT。

#### Scenario: XDG 隔離下で init 後に pass する

**Given** `XDG_CONFIG_HOME` を隔離ディレクトリに設定し、そこに config を作成した状態
**When** `config-file-exists` check を実行する
**Then** check は pass する

#### Scenario: パス固定へ戻すと落ちる（破壊確認）

**Given** check を `homeDir/.config/...` 固定に戻した状態
**When** XDG 隔離下の T6 テストを実行する
**Then** テストは fail する

### Requirement: doctor --help は usage を表示する

`doctor --help` は usage を MUST 表示し、その usage は `--json` フラグを MUST 記載する。`"No detailed help available."`
を表示して MUST NOT。

#### Scenario: doctor --help

**Given** `specrunner doctor --help` の実行
**When** help を出力する
**Then** usage が表示され、その中に `--json` の記載がある

### Requirement: git fetch の認証失敗は login を処方し元 stderr を保持する

workspace 準備の `git fetch` が失敗し、その stderr が認証系パターンに合致する場合、表示の第一文は
`specrunner login` を MUST 処方し、git の元メッセージを詳細として MUST 保持（破棄して MUST NOT）する。
非認証系の fetch 失敗の表示は現行のまま SHALL 保つ。

#### Scenario: 認証系 stderr

**Given** `git fetch` の stderr が `could not read Username` 等の認証系パターンに合致
**When** fetch 失敗メッセージを生成する
**Then** 第一文が `specrunner login` を処方し、元の git stderr が詳細として含まれる

#### Scenario: 非認証系 stderr（回帰防止）

**Given** `git fetch` の stderr が認証系パターンに合致しない
**When** fetch 失敗メッセージを生成する
**Then** メッセージは現行の `git fetch origin failed (exit N): <stderr>` と同一である

### Requirement: README に既存プロジェクト参加者手順を記載する

README の Quick Start 近傍に、spec-runner 導入済み repo を clone した参加者向けの手順
（install → `specrunner init` → `specrunner login`）を MUST 記載する。

#### Scenario: README 参加者手順

**Given** README の Quick Start 近傍
**When** 内容を検査する
**Then** 既存プロジェクト参加者向けに install → `specrunner init` → `specrunner login` の手順が存在する
