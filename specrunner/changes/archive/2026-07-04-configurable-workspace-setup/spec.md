# Spec: workspace セットアップの config 駆動化

## Requirements

### Requirement: workspace setup コマンドは config で指定でき worktree 作成後に実行される

local runtime は `config.workspace.setup` が定義されているとき、worktree 作成後に
そのコマンド列を（ハードコード install の代わりに）配列順・fail-fast で実行 SHALL する。
各コマンドは `sh -c <command>` 経由で worktree のルートを cwd として実行される。

#### Scenario: setup コマンドが worktree 作成後に実行される

**Given** `config.workspace.setup` に `["uv sync"]` が指定されている
**When** local runtime が job の worktree を作成する
**Then** `git worktree add` の成功後に `sh -c "uv sync"` が worktree のルートで実行され、
`detectPm` ベースの install は実行されない

#### Scenario: setup コマンドは配列順に fail-fast で実行される

**Given** `config.workspace.setup` に複数のコマンドが指定されている
**When** worktree セットアップの setup コマンドを実行する
**Then** コマンドは配列順に逐次実行され、最初に exit 非 0 を返したコマンドで残りは skip される

### Requirement: setup 未指定かつ JS 依存管理の痕跡が無いとき install をスキップして成功する

`config.workspace.setup` が未指定（`undefined`）で、対象プロジェクトの repoRoot 直下に
lockfile も `package.json` も存在しないとき、システムは install を実行せず worktree セットアップを
成功 SHALL させる。

#### Scenario: 非 JS / greenfield プロジェクトが無設定で通る

**Given** `config.workspace.setup` が未指定で、repoRoot に lockfile と `package.json` のいずれも無い
**When** local runtime が job の worktree を作成する
**Then** install コマンドは一切実行されず、worktree セットアップは成功して worktree パスを返す

### Requirement: setup 未指定かつ痕跡があるとき従来の install を実行する

`config.workspace.setup` が未指定で、repoRoot 直下に lockfile または `package.json` が
存在するとき、システムは従来どおり `detectPackageManager` で package manager を決定し
`installCommand(pm)` を worktree 内で実行 SHALL する。

#### Scenario: JS + lockfile プロジェクトが従来どおり install する

**Given** `config.workspace.setup` が未指定で、repoRoot に lockfile（例: `bun.lock`）が存在する
**When** local runtime が job の worktree を作成する
**Then** 検出された package manager の install コマンド（例: `bun install --frozen-lockfile`）が
worktree 内で実行される

### Requirement: setup を空配列で明示すると install をスキップする

`config.workspace.setup` が空配列 `[]` として明示されているとき、システムは痕跡の有無に関わらず
コマンドを 1 件も実行せず worktree セットアップを成功 SHALL させる。

#### Scenario: 空配列は明示的なスキップとして機能する

**Given** `config.workspace.setup` が `[]` で、repoRoot に lockfile が存在する
**When** local runtime が job の worktree を作成する
**Then** install も setup コマンドも実行されず、worktree セットアップは成功する

### Requirement: setup / install の失敗時は worktree を後片づけして throw する

setup コマンドまたは install コマンドが exit 非 0 を返したとき、システムは作成した worktree を
`git worktree remove --force` + `rm -rf` で除去してからエラーを throw SHALL する（現行パス踏襲）。

#### Scenario: setup コマンド失敗時に worktree が除去される

**Given** worktree 作成後に実行される setup コマンドが exit 非 0 を返す
**When** そのコマンドが失敗する
**Then** 作成された worktree が除去され、失敗したコマンドのラベルと exit code を含むエラーが throw される
