# Spec: lockfile の上位ディレクトリ探索と lockfile root の PATH 反映

## Requirements

### Requirement: detectPackageManager は cwd から git root まで lockfile を上位探索する

`src/util/detect-pm.ts` の `detectPackageManager(cwd, fsLike?)` は、`cwd` を起点に親ディレクトリへ
順に上位探索し、最初に見つかった lockfile の PM を MUST 返す。探索は各ディレクトリで lockfile を
（既存の固定優先順序 `pnpm-lock.yaml` → `bun.lockb` → `bun.lock` → `yarn.lock` → `package-lock.json` で）
確認し、見つかればそのディレクトリで打ち切る。lockfile が無いディレクトリでは `.git`（ディレクトリ
またはファイル）の存在を確認し、存在すればそのディレクトリを git root とみなして探索を MUST 停止する
（git root より上は探索しない）。filesystem root に達した場合も MUST 停止する（無限ループ防止）。

git root / filesystem root まで lockfile が見つからなかった場合は、`cwd` の `package.json` の
`packageManager` フィールド → `npm` fallback の順で決定する（既存挙動と同一）。

#### Scenario: cwd に lockfile がある（後方互換）

**Given** `cwd` に `pnpm-lock.yaml` が存在する
**When** `detectPackageManager(cwd)` を呼ぶ
**Then** 上位探索する前に `cwd` の lockfile で確定し、PM として `"pnpm"` を返す

#### Scenario: cwd に lockfile が無く親ディレクトリにある

**Given** `cwd` に lockfile が無く、その親ディレクトリに `pnpm-lock.yaml` が存在する
**When** `detectPackageManager(cwd)` を呼ぶ
**Then** 親ディレクトリの lockfile から PM `"pnpm"` を検出して返す

#### Scenario: git root を超えて探索しない

**Given** `cwd` から git root（`.git` を持つディレクトリ）までの経路に lockfile が無く、git root の
**上位**のディレクトリにのみ lockfile が存在する
**When** `detectPackageManager(cwd)` を呼ぶ
**Then** git root を超えた上位ディレクトリの lockfile は採用せず、`packageManager` フィールド → `npm`
fallback の経路で決定する

#### Scenario: git root 自身に lockfile がある

**Given** `cwd` から上位に lockfile が無く、git root（`.git` を持つディレクトリ）に `pnpm-lock.yaml` が
存在する
**When** `detectPackageManager(cwd)` を呼ぶ
**Then** git root の lockfile を採用して `"pnpm"` を返す（git root 自身は探索対象に含む）

#### Scenario: git worktree の .git ファイルでも停止する

**Given** あるディレクトリに `.git` がファイル（gitdir pointer）として存在し、そのディレクトリまでに
lockfile が無い
**When** `detectPackageManager(cwd)` を呼ぶ
**Then** `.git` がファイルであっても git root とみなして探索を停止する

#### Scenario: lockfile が一切無い（npm fallback）

**Given** `cwd` から git root / filesystem root まで lockfile が無く、`cwd` の `package.json` にも
`packageManager` フィールドが無い（または `package.json` が無い / 不正）
**When** `detectPackageManager(cwd)` を呼ぶ
**Then** fallback として PM `"npm"` を返す

### Requirement: detectPackageManager は { pm, root } を返す

`detectPackageManager(cwd, fsLike?)` は、PM 名だけでなく lockfile を見つけたディレクトリのパスを含む
オブジェクト `{ pm, root }` を MUST 返す。`pm` は検出した `PackageManager`、`root` は lockfile が
存在したディレクトリの絶対パスとする。lockfile が見つからなかった場合（`packageManager` フィールド
または `npm` fallback で決定した場合）は `root` に `cwd` を MUST 設定する。

#### Scenario: 親ディレクトリの lockfile を見つけた場合の root

**Given** `cwd` に lockfile が無く、親ディレクトリ `P` に lockfile が存在する
**When** `detectPackageManager(cwd)` を呼ぶ
**Then** 戻り値の `root` は `P`（lockfile が存在したディレクトリ）になる

#### Scenario: lockfile 不在時の root は cwd

**Given** lockfile が一切見つからず `packageManager` フィールドまたは `npm` fallback で PM が決まる
**When** `detectPackageManager(cwd)` を呼ぶ
**Then** 戻り値の `root` は `cwd` になる

### Requirement: spawnCommand は lockfile root の node_modules/.bin を PATH に含める

`src/core/verification/commands.ts` の `spawnCommand(command, cwd, env, root?)` は、子プロセスの `PATH`
先頭に `cwd/node_modules/.bin` と `root/node_modules/.bin` を MUST 付与する。順序は
`cwd/node_modules/.bin` → `root/node_modules/.bin` → 元の `PATH` とし、`cwd` のものが優先される
（workspace package のローカル依存が workspace root に hoist された依存に勝つ）。`root` が省略された場合
（または `root` が `cwd` と等しい場合）は従来どおり `cwd/node_modules/.bin` のみを付与する（後方互換）。

#### Scenario: root が cwd と異なる場合は両方を PATH に含める

**Given** `root` が `cwd` と異なるディレクトリで `spawnCommand("printenv PATH", cwd, env, root)` を呼ぶ
**When** コマンドを実行する
**Then** 子プロセスの `PATH` は `cwd/node_modules/.bin` を `root/node_modules/.bin` より前に含み、
両方を含む

#### Scenario: root 省略時は cwd のみ（後方互換）

**Given** `spawnCommand("printenv PATH", cwd, env)` を `root` 引数なしで呼ぶ
**When** コマンドを実行する
**Then** 子プロセスの `PATH` は `cwd/node_modules/.bin` を含み、従来の挙動と一致する

### Requirement: verification commands 経路は検出した lockfile root を PATH に渡す

`src/core/verification/runner.ts` の commands 経路（`runVerificationCommands`）は、各コマンドを
実行する前に `detectPackageManager(cwd)` で lockfile root を求め、その `root` を `spawnCommand` に
MUST 渡す。コマンドの実行 cwd（`cwd`）と実行方式（`sh -c`）と実行順序（fail-fast）は変更しない。

#### Scenario: monorepo の verification command が root の .bin を解決できる

**Given** `verification.commands` が設定され、lockfile が `cwd` の上位（workspace root）にあり、
binary が workspace root の `node_modules/.bin` に hoist されている
**When** commands 経路で各コマンドを実行する
**Then** `spawnCommand` に workspace root が `root` として渡り、子プロセスの `PATH` に
`<workspace-root>/node_modules/.bin` が含まれる

### Requirement: 既存呼び出し元は { pm } で PM を取得する（後方互換）

`detectPackageManager` の戻り値変更に伴い、worktree manager / verification runner phase 経路 / doctor の
各呼び出し元は `result.pm` で PM を取得するよう MUST 更新される。単一パッケージプロジェクト
（`cwd` に lockfile がある）での検出結果・install / run コマンド・doctor チェック対象 PM は本変更前後で
SHALL 不変でなければならない。

#### Scenario: 単一パッケージプロジェクトの worktree install（後方互換）

**Given** `repoRoot` に lockfile が存在する単一パッケージプロジェクト
**When** worktree `create()` が install を実行する
**Then** 検出 PM の install コマンド（例: `bun install --frozen-lockfile`）が本変更前と同一に実行される

#### Scenario: 単一パッケージプロジェクトの doctor（後方互換）

**Given** `cwd` に lockfile が存在する単一パッケージプロジェクト
**When** package-manager チェックを実行する
**Then** 本変更前と同一の検出 PM に対して `<pm> --version` を検証する
