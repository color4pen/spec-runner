# Spec: lockfile ベースのパッケージマネージャ自動検出

## Requirements

### Requirement: lockfile からパッケージマネージャを決定的に検出する

`src/util/detect-pm.ts` は cwd を受け取り、単一の `PackageManager`（`"bun" | "pnpm" | "yarn" | "npm"`）を
返す検出関数 `detectPackageManager` を MUST 提供する。検出は次の優先順で行う:

1. lockfile の存在（第一シグナル）
2. `package.json` の `packageManager` フィールド（補助シグナル）
3. fallback `npm`

検出関数は async とし、fs アクセスは `{ existsSync; readFile }` インターフェース経由で行い、省略時は
`node:fs` / `node:fs/promises` を既定とする。外部ライブラリを MUST 追加しない（inline 実装）。

#### Scenario: pnpm-lock.yaml が存在する

**Given** cwd に `pnpm-lock.yaml` が存在する
**When** `detectPackageManager(cwd)` を呼ぶ
**Then** `"pnpm"` を返す

#### Scenario: bun.lockb または bun.lock が存在する

**Given** cwd に `bun.lockb` または `bun.lock` が存在する
**When** `detectPackageManager(cwd)` を呼ぶ
**Then** `"bun"` を返す

#### Scenario: yarn.lock が存在する

**Given** cwd に `yarn.lock` が存在する
**When** `detectPackageManager(cwd)` を呼ぶ
**Then** `"yarn"` を返す

#### Scenario: package-lock.json が存在する

**Given** cwd に `package-lock.json` が存在する
**When** `detectPackageManager(cwd)` を呼ぶ
**Then** `"npm"` を返す

#### Scenario: lockfile が存在せず packageManager フィールドのみ存在する

**Given** cwd に lockfile が無く `package.json` の `packageManager` が `"pnpm@9.12.0"`
**When** `detectPackageManager(cwd)` を呼ぶ
**Then** `"pnpm"` を返す

#### Scenario: lockfile も packageManager フィールドも無い

**Given** cwd に lockfile が無く `package.json` に `packageManager` フィールドも無い（または `package.json` が無い / 不正）
**When** `detectPackageManager(cwd)` を呼ぶ
**Then** fallback として `"npm"` を返す

#### Scenario: 複数 lockfile が同時に存在する

**Given** cwd に `pnpm-lock.yaml` と `package-lock.json` が同時に存在する
**When** `detectPackageManager(cwd)` を呼ぶ
**Then** 固定優先順序（`pnpm-lock.yaml` → `bun.lockb` → `bun.lock` → `yarn.lock` → `package-lock.json`）の先勝ちで `"pnpm"` を返す（毎回同じ決定的結果）

### Requirement: 検出した PM から install / run コマンドを導出する

`src/util/detect-pm.ts` は PM enum から install コマンドと run コマンドを導出する pure 関数
`installCommand(pm): [command, ...args]` と `runCommand(pm): (script) => [command, ...args]` を MUST 提供する。
npm の install は `npm ci`、他 PM の install は `<pm> install --frozen-lockfile` とする。run は全 PM で
`<pm> run <script>` とする。

#### Scenario: install コマンド導出

**Given** 検出された PM
**When** `installCommand(pm)` を呼ぶ
**Then** bun→`["bun","install","--frozen-lockfile"]`、pnpm→`["pnpm","install","--frozen-lockfile"]`、yarn→`["yarn","install","--frozen-lockfile"]`、npm→`["npm","ci"]` を返す

#### Scenario: run コマンド導出

**Given** 検出された PM とスクリプト名 `s`
**When** `runCommand(pm)(s)` を呼ぶ
**Then** bun→`["bun","run",s]`、pnpm→`["pnpm","run",s]`、yarn→`["yarn","run",s]`、npm→`["npm","run",s]` を返す

### Requirement: worktree 作成時の install は検出した PM コマンドで行う

`src/core/worktree/manager.ts` の `create()` は、worktree 作成後に実行する install を、**元リポジトリ
（`repoRoot`）** で検出した PM の install コマンドで MUST 行う。install の実行 cwd は従来どおり worktree
（`worktreePath`）とする。

#### Scenario: pnpm プロジェクトの worktree install

**Given** `repoRoot` に `pnpm-lock.yaml` が存在する
**When** `create()` が worktree を作成し install を実行する
**Then** `pnpm install --frozen-lockfile` が `cwd = worktreePath` で実行される

#### Scenario: bun プロジェクトの worktree install（後方互換）

**Given** `repoRoot` に `bun.lockb` または `bun.lock` が存在する
**When** `create()` が install を実行する
**Then** 従来と同じ `bun install --frozen-lockfile` が実行される

#### Scenario: lockfile 不在時の worktree install

**Given** `repoRoot` に lockfile も `packageManager` フィールドも無い
**When** `create()` が install を実行する
**Then** `npm ci` が実行される

### Requirement: verification phase 実行は検出した PM の run コマンドで行う

`src/core/verification/runner.ts` の phase fallback 経路（`runVerificationPhases`）は、各 package.json
script を **verification の cwd** で検出した PM の run コマンドで MUST 実行する。`verification.commands`
が設定されている commands 経路は `sh -c` 実行で PM 非依存であり、PM 検出の影響を MUST 受けない。

#### Scenario: pnpm プロジェクトの verification

**Given** verification cwd に `pnpm-lock.yaml` が存在し package.json に該当 script がある
**When** phase fallback 経路が script を実行する
**Then** `pnpm run <script>` で実行される

#### Scenario: bun プロジェクトの verification（後方互換）

**Given** verification cwd に `bun.lockb` または `bun.lock` が存在する
**When** phase fallback 経路が script を実行する
**Then** 従来と同じ `bun run <script>` で実行される

#### Scenario: verification.commands は PM 検出に影響されない

**Given** `verification.commands` が config に設定されている
**When** verification を実行する
**Then** commands 経路（`sh -c <command>`）で実行され、PM 検出ロジックは経由しない

### Requirement: doctor は検出した PM のバイナリ存在を検証する

`specrunner doctor` の runtime カテゴリは、bun 固定ではなく、検出した PM のバイナリ（`<pm> --version`）の
存在を MUST 検証する。検出は doctor の cwd で行い、`required` チェックとする。runtime カテゴリの check 数と
`allChecks` の総数は本変更前後で SHALL 不変でなければならない。

#### Scenario: pnpm プロジェクトの doctor

**Given** doctor の cwd に `pnpm-lock.yaml` が存在し pnpm が PATH にある
**When** package-manager チェックを実行する
**Then** `pass` を返し、メッセージに検出 PM（pnpm）とバージョンを含む

#### Scenario: 検出 PM のバイナリが無い

**Given** 検出された PM のバイナリが PATH に無い（`<pm> --version` が失敗する）
**When** package-manager チェックを実行する
**Then** `fail` を返し、hint に検出 PM のインストール方法を含む

### Requirement: 外部依存を増やさない

本変更は新しい npm 依存を MUST 追加しない。`package.json` の `dependencies` は 4 個のまま維持する。

#### Scenario: dependencies 件数が変わらない

**Given** 本変更が適用される前の `package.json` の `dependencies` が 4 個
**When** 本変更を適用する
**Then** `package.json` の `dependencies` は 4 個のままで、新しいエントリが追加されていない
