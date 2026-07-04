# Tasks: workspace セットアップの config 駆動化と言語非依存化

## T-01: config schema に `workspace.setup` を追加し、コマンド形状を共有型に一般化する

対象: `src/config/schema.ts`

- [ ] コマンド要素型を意味的に中立化する: `export type ShellCommand = string | { name?: string; run: string }` を追加し、`export type VerificationCommand = ShellCommand`（既存参照を壊さない alias）に変更する。
- [ ] `export interface WorkspaceConfig { setup?: ShellCommand[] }` を追加する。docstring に「worktree 作成後に実行する setup コマンド列。定義時はハードコード install の代わりに実行する。未定義時は JS 依存管理の痕跡があれば従来の detectPm + install、無ければ install スキップ」と明記する。
- [ ] `SpecRunnerConfig` に `workspace?: WorkspaceConfig` を追加する（`verification?` の近くに配置）。
- [ ] `RawConfig` に `workspace?: unknown`（passed through, validated in schema）を追加する。
- [ ] zod schema を共有化する: 既存 `verificationCommandSchema` を `shellCommandSchema` にリネームし、`verification.commands` の array 要素をこれに差し替える（`shellCommandSchema` を再利用）。
- [ ] `configSchema` に `workspace: optional(object({ setup: optional(array(shellCommandSchema, "must be an array.")) }, "must be an object."))` を追加する。フィールド順コメント（`... verification → github ...`）に `workspace` を追記する。
- [ ] `applyMigration` / `deepMergeConfig` は変更しない（spread と generic deep merge で `workspace` は自動的に保持・マージされる）。

**Acceptance Criteria**:
- `config.workspace.setup` に `["uv sync"]` や `[{ name: "deps", run: "go mod download" }]` を指定した config が `validateConfig` を通る。
- `workspace.setup` に非文字列・`run` 欠落オブジェクト等の不正値を入れると `CONFIG_INVALID`（パス `workspace.setup[0]...`）で reject される。
- `workspace` 未指定の既存 config が従来どおり通る（後方互換）。
- `verification.commands` の既存バリデーション挙動が `shellCommandSchema` 共有後も不変（既存 schema テスト green）。

## T-02: `hasJsDependencyTraces` を `detect-pm.ts` に加算する

対象: `src/util/detect-pm.ts`

- [ ] 純関数 `export function hasJsDependencyTraces(repoRoot: string, fsLike?: { existsSync(path: string): boolean }): boolean` を追加する。
  - `fsLike ?? { existsSync: nodeFs.existsSync }` を使い、既存 `LOCKFILE_MAP` の各 lockfile が `path.join(repoRoot, <lockfile>)` に存在すれば `true` を返す。
  - lockfile がいずれも無ければ `path.join(repoRoot, "package.json")` の存在を確認し、あれば `true`、無ければ `false` を返す。
- [ ] `detectPackageManager` / `installCommand` / `runCommand` / `LOCKFILE_MAP` の既存ロジックは変更しない（`LOCKFILE_MAP` は再利用）。外部依存を増やさない（`node:*` のみ）。`Bun.*` / `bun:*` を使わない。

**Acceptance Criteria**:
- repoRoot に任意の lockfile（`pnpm-lock.yaml` / `bun.lock` / `yarn.lock` / `package-lock.json` 等）があるとき `true`。
- lockfile は無いが `package.json` があるとき `true`。
- lockfile も `package.json` も無いとき `false`。
- `existsSync` を注入して fs アクセスなしに単体テストできる。

## T-03: setup plan の解決関数と型を新設する

対象: `src/core/worktree/setup.ts`（新規）

- [ ] plan 型を定義・export する:
  ```
  export type WorkspaceSetupPlan =
    | { kind: "detect-install" }
    | { kind: "commands"; commands: { name?: string; run: string }[] }
    | { kind: "skip" };
  ```
- [ ] 純関数 `export function resolveWorkspaceSetupPlan(setup: ShellCommand[] | undefined, hasJsTraces: boolean): WorkspaceSetupPlan` を design.md D3 の規則で実装する:
  - `setup !== undefined`（空配列を含む）→ `{ kind: "commands", commands: <normalize(setup)> }`。
  - `setup === undefined` かつ `hasJsTraces` → `{ kind: "detect-install" }`。
  - `setup === undefined` かつ `!hasJsTraces` → `{ kind: "skip" }`。
- [ ] ローカルな normalize 関数を持つ（`string` → `{ run }`、`{ name?, run }` → `{ name, run }`）。verification モジュールを import しない（横断依存回避、design.md D5）。
- [ ] `ShellCommand` 型は `src/config/schema.ts` から import する。

**Acceptance Criteria**:
- `resolveWorkspaceSetupPlan(["uv sync"], false)` が `{ kind: "commands", commands: [{ run: "uv sync" }] }`。
- `resolveWorkspaceSetupPlan([], true)` が `{ kind: "commands", commands: [] }`（空配列＝明示スキップ）。
- `resolveWorkspaceSetupPlan(undefined, true)` が `{ kind: "detect-install" }`。
- `resolveWorkspaceSetupPlan(undefined, false)` が `{ kind: "skip" }`。
- object 形式 `[{ name: "deps", run: "go mod download" }]` が `{ name, run }` に正しく normalize される。

## T-04: `manager.create()` を plan 実行に対応させる（既定は現行 install を保存）

対象: `src/core/worktree/manager.ts`

- [ ] `WorktreeManager.create` の interface シグネチャに末尾 optional 引数 `plan?: WorkspaceSetupPlan` を追加する（`src/core/worktree/setup.ts` から型 import）。docstring を install / commands / skip の分岐を反映する内容に更新する。
- [ ] 実装 `create(repoRoot, slug, jobId, baseRef?, branchName?, plan: WorkspaceSetupPlan = { kind: "detect-install" })` とし、`git worktree add`（retry ロジック含む）成功後に plan の kind で分岐する:
  - `"detect-install"`: **現行の `detectPm(repoRoot)` + `installCommand(pm)` + spawn + 失敗時 cleanup + throw をそのまま**実行する（`manager.ts:124-135` の挙動を保存）。
  - `"commands"`: `plan.commands` を配列順に `spawn("sh", ["-c", cmd.run], { cwd: worktreePath })` で実行。exit 非 0 で残りを skip し、cleanup 後に `Setup command '<label>' failed (exit <code>): <stderr>`（`label = cmd.name ?? cmd.run`）を throw。空配列は何も実行せず成功。
  - `"skip"`: 何も実行せず worktreePath を返す。
- [ ] 失敗時の後片づけ（`git worktree remove --force` + `rm(worktreePath, { recursive, force })`）を `detect-install` / `commands` で共有する小ヘルパーに集約する（挙動は現行と同一）。
- [ ] `detectPackageManager` / `installCommand` の import と DI（`detectPmFn`）は維持する。

**Acceptance Criteria**:
- plan を渡さない `create()` 呼び出しが現行と同一の `detectPm` + install を実行する（既存 manager テスト無改修 green）。
- `{ kind: "commands", commands: [{ run: "uv sync" }] }` で `git worktree add` 成功後に `sh -c uv sync` が worktreePath を cwd として実行され、detectPm ベース install は実行されない。
- `{ kind: "commands" }` のコマンドが exit 非 0 のとき worktree remove + `rm` が呼ばれ、ラベルと exit code を含むエラーが throw される。
- `{ kind: "skip" }` で install も setup コマンドも実行されず worktreePath が返る。

## T-05: `LocalRuntime` で plan を解決し 3 経路の `create()` に配線する

対象: `src/core/runtime/local.ts`

- [ ] `LocalRuntimeOptions` に `workspaceSetup?: ShellCommand[]` を追加し、constructor で `this.workspaceSetup = opts.workspaceSetup` を保持する（`ShellCommand` を `src/config/schema.ts` から import）。
- [ ] `setupWorkspace()` の noWorktree 早期 return より後で、plan を 1 回解決するヘルパー（例: `private resolveSetupPlan(): WorkspaceSetupPlan { return resolveWorkspaceSetupPlan(this.workspaceSetup, hasJsDependencyTraces(this.cwd)); }`）を用意する。
- [ ] worktree を作成する 3 経路すべてで解決済み plan を `manager.create(...)` の末尾引数に渡す:
  - recreate 経路（`local.ts:402` 付近、branchName 無し）: `manager.create(this.cwd, slug, jobId, remoteBaseRef, undefined, plan)`。
  - null resume 経路（`local.ts:423` 付近）: 同上。
  - run 経路（`local.ts:466` 付近、branchName 有り）: `manager.create(this.cwd, slug, jobId, remoteBaseRef, branchName, plan)`。
- [ ] 既存 worktree を再利用する resume 経路（`local.ts:388-399`、`create()` を呼ばない）と noWorktree 経路は変更しない。
- [ ] `resolveWorkspaceSetupPlan` / `WorkspaceSetupPlan` を `src/core/worktree/setup.ts` から、`hasJsDependencyTraces` を `src/util/detect-pm.ts` から import する。

**Acceptance Criteria**:
- `workspaceSetup` を注入した `LocalRuntime` の run 経路が、解決済み plan（commands）を `manager.create` に渡す。
- `workspaceSetup` 未注入かつ repoRoot に痕跡がある場合、plan が `detect-install` に解決され従来どおり install が走る。
- mock manager を注入する既存 `LocalRuntime` テスト（`create` を mock）は plan 引数を無視して green。

## T-06: factory で `config.workspace.setup` を配線する

対象: `src/core/runtime/factory.ts`

- [ ] `createRuntime` の local 分岐で `new LocalRuntime({ cwd, githubClient, githubToken, owner: repo.owner, repo: repo.name, workspaceSetup: config.workspace?.setup })` に変更する。
- [ ] managed 分岐は変更しない（`ManagedRuntime.setupWorkspace()` は worktree / install を行わないため対象外）。

**Acceptance Criteria**:
- local runtime で `config.workspace.setup` が `LocalRuntime` に渡り、worktree セットアップの plan 解決に反映される。
- managed runtime の生成経路は不変。

## T-07: config 型パリティテストに `workspace` を追加する

対象: `tests/config/schema-type-parity.test-d.ts`

- [ ] `WorkspaceConfig` / `ShellCommand` を import に追加する。
- [ ] locality 用の型アサーションを追加する:
  - `type _Workspace = Expect<Equal<NonNullable<I["workspace"]>, WorkspaceConfig>>;`
  - `type _SetupCmd = Expect<Equal<NonNullable<NonNullable<I["workspace"]>["setup"]>[number], ShellCommand>>;`
- [ ] `_Top`（`Omit<I, "steps" | "agents">` vs `Omit<SpecRunnerConfig, "steps" | "agents" | "specFixer">`）は `workspace` を両側に追加したことで自動的に等価を保つ（変更不要であることを確認する）。
- [ ] `VerificationCommand` を `ShellCommand` の alias にした後も既存 `_VerCmd` アサーションが green であることを確認する。

**Acceptance Criteria**:
- `bun run typecheck`（`.test-d.ts` 含む）が pass する。
- schema と interface の `workspace` 形状が構造的に一致することが型レベルで固定される。

## T-08: テストの追加・更新

対象: `tests/unit/util/detect-pm.test.ts`、`tests/unit/core/worktree/setup.test.ts`（新規）、`tests/core/worktree/manager.test.ts`、`tests/unit/config/schema.test.ts`

- [ ] `tests/unit/util/detect-pm.test.ts`: `hasJsDependencyTraces` のケースを追加する（lockfile あり→true、`package.json` のみ→true、いずれも無し→false）。`existsSync` は注入 stub で制御する。
- [ ] `tests/unit/core/worktree/setup.test.ts`（新規）: `resolveWorkspaceSetupPlan` の 4 分岐（commands / 空配列 commands / detect-install / skip）と object 形式コマンドの normalize を固定する。
- [ ] `tests/core/worktree/manager.test.ts`:
  - 既存 `detect-install` 系ケース（TC-WTM-001/003/008/009/010/013/014/018/019 等）は **plan 引数を渡さず無改修**で green を維持することを確認する。
  - 新規: `create(..., { kind: "commands", commands: [{ run: "uv sync" }] })` で `git worktree add` の次に `sh -c uv sync` が worktreePath cwd で実行され、install（`bun install` / `npm ci` 等）が呼ばれないことを固定する。
  - 新規: `commands` 経路で最初のコマンドが exit 非 0 のとき、`git worktree remove --force` + `rm` が呼ばれ、ラベル + exit code を含むエラーが throw されることを固定する（後片づけ要件）。
  - 新規: `create(..., { kind: "skip" })` で install も setup コマンドも呼ばれず worktreePath が返ることを固定する。
- [ ] `tests/unit/config/schema.test.ts`: `workspace.setup` の valid（string / object 形式）と invalid（`run` 欠落 / 非配列）ケースの validate 挙動を追加する。
- [ ] mock manager を持つ既存 `LocalRuntime` テスト（`tests/local-no-jobs-dir-writes.test.ts` / `tests/unit/no-worktree-mode.test.ts` 等）で `create` mock のシグネチャが末尾 optional 引数を受けても型・挙動が壊れないことを確認する（必要なら mock 型に optional 引数を追記）。

**Acceptance Criteria**:
- request.md の受け入れ基準を満たす:
  - config で workspace setup コマンドを指定でき worktree 作成後に実行されることがテストで固定される。
  - setup 未指定かつ痕跡無しで install を実行せず成功することが非 JS / greenfield を模したテストで固定される。
  - 既存 JS + lockfile プロジェクトで従来どおり install されることが既存テスト無変更 green で固定される。
  - 注: request.md の受け入れ基準「spec-runner 自身の自己ホスト（worktree での依存 install → verification）が回帰しない」は unit regression では自動化できない（CI 実環境依存）。これは「既存 JS+lockfile プロジェクトが `detect-install` 経路で従来どおり install する」（＝spec-runner は痕跡ありで無設定なので `detect-install` に解決される）ことを上記テストで担保し、実 job の自己ホストは CI / 手動 smoke で確認する範囲とする。
- `bun run typecheck` が pass する。
- `bun run test` が pass する。
- `bun run lint` が pass する（未使用 import / unused-vars を出さない）。

## T-09: ドキュメントを更新する

対象: `docs/configuration.md`、`README.md`

- [ ] `docs/configuration.md` に `workspace.setup` セクションを追加する: schema（`(string | { name?; run })[]`）、実行モデル（worktree 作成後に `sh -c` で配列順 fail-fast）、未指定時の default（痕跡があれば detectPm + install、無ければ skip）、空配列＝明示スキップ、非 JS / greenfield の例（`["uv sync"]` / `["go mod download"]`）を記す。`verification.commands` との対称性に触れる。
- [ ] `README.md` に language-agnostic な worktree セットアップの短い言及（config で setup コマンドを指定でき非 JS でも通る旨）を追加する。

**Acceptance Criteria**:
- `docs/configuration.md` を読めば `workspace.setup` の書式・実行タイミング・default 判定・空配列の意味が分かる。
- ドキュメントの記述が design.md / spec.md の挙動と一致する。
