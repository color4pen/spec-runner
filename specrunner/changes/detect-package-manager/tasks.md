# Tasks: パッケージマネージャを自動検出して bun ハードコードを解消する

## T-01: `src/util/detect-pm.ts` を新設する（検出 + コマンド導出）

対象: `src/util/detect-pm.ts`（新規）

- [x] `PackageManager` 型を定義する: `"bun" | "pnpm" | "yarn" | "npm"`。
- [x] `DetectPmFs` インターフェースを定義する: `{ existsSync(path: string): boolean; readFile(path: string, encoding: "utf-8"): Promise<string> }`。
- [x] `detectPackageManager(cwd: string, fsLike?: DetectPmFs): Promise<PackageManager>` を実装する。
  - `fsLike` 省略時は `node:fs` の `existsSync` と `node:fs/promises` の `readFile` を既定にする（`import * as nodeFs from "node:fs"` / `import * as nodeFsp from "node:fs/promises"`）。
  - lockfile 判定（先勝ち固定順序）: `pnpm-lock.yaml`→pnpm、`bun.lockb`→bun、`bun.lock`→bun、`yarn.lock`→yarn、`package-lock.json`→npm。各々 `path.join(cwd, <lockfile>)` を `existsSync` で確認。
  - lockfile が無ければ `package.json` の `packageManager` フィールドを読む: `readFile` で取得 → `JSON.parse` → `packageManager` を `"<name>@<version>"` とみなし `split("@")[0]` で name 抽出 → 既知 PM 名（bun/pnpm/yarn/npm）なら採用。読み取り / parse 失敗は握りつぶす。
  - いずれにも該当しなければ `"npm"` を返す。
- [x] `installCommand(pm: PackageManager): [string, ...string[]]` を実装する: bun/pnpm/yarn→`[pm, "install", "--frozen-lockfile"]`、npm→`["npm", "ci"]`。
- [x] `runCommand(pm: PackageManager): (script: string) => [string, ...string[]]` を実装する: 全 PM で `(script) => [pm, "run", script]`。
- [x] 外部ライブラリを import しない（`node:*` のみ）。`Bun.*` / `bun:*` を使わない。

**Acceptance Criteria**:
- `detectPackageManager` が spec.md の 7 検出シナリオ（pnpm / bun(lockb) / bun(lock) / yarn / npm / packageManager フィールド / fallback / 複数 lockfile 先勝ち）どおりに単一の決定的結果を返す。
- `installCommand` / `runCommand` が design.md D4 の導出表どおりのタプルを返す。
- ファイル内に外部依存の import が無い。`deps` は 4 個のまま。

## T-02: `src/core/worktree/manager.ts` の install を検出 PM コマンドに置き換える

対象: `src/core/worktree/manager.ts`

- [x] `import { detectPackageManager, installCommand, type PackageManager } from "../../util/detect-pm.js";` を追加する。
- [x] `createWorktreeManager` のシグネチャに第 4 引数 `detectPmFn?: (cwd: string) => Promise<PackageManager>` を追加し、本体先頭で `const detectPm = detectPmFn ?? detectPackageManager;` を定義する（既存 `spawnFn`/`rmFn`/`sleepFn` の DI パターンに合わせる）。
- [x] `create()` 内、worktree 作成完了後の install 直前で `const pm = await detectPm(repoRoot);` を呼ぶ（検出は `worktreePath` ではなく `repoRoot`）。
- [x] `const [installCmd, ...installArgs] = installCommand(pm);` を求め、`spawn("bun", ["install", "--frozen-lockfile"], { cwd: worktreePath })` を `spawn(installCmd, installArgs, { cwd: worktreePath })` に置き換える（実行 cwd は worktree のまま）。
- [x] install 失敗時のエラーメッセージ / cleanup を保持しつつ、メッセージの `bun install failed` を検出 PM 由来の文言（例: `${installCmd} install failed (...)` 等、command を反映した表現）に一般化する。docstring の「Runs bun install ...」記述も検出 PM 表現に更新する。
- [x] worktree add のリトライ / branch cleanup / lock contention ロジックは変更しない。

**Acceptance Criteria**:
- `repoRoot` に pnpm-lock.yaml があるとき install が `pnpm install --frozen-lockfile`（cwd=worktreePath）で実行される。
- `repoRoot` に bun.lockb / bun.lock があるとき従来どおり `bun install --frozen-lockfile` が実行される（後方互換）。
- lockfile 不在時は `npm ci` が実行される。
- `manager.ts` 内に install コマンド名の `"bun"` ハードコードが残らない。

## T-03: `src/core/verification/runner.ts` の run を検出 PM コマンドに置き換える

対象: `src/core/verification/runner.ts`

- [x] `import { detectPackageManager, runCommand } from "../../util/detect-pm.js";` を追加する。
- [x] `spawnScript` のシグネチャを run コマンドを受け取る形（例: `spawnScript(command: string, args: string[], cwd: string)`）へ一般化し、内部の `spawn("bun", ["run", script], {...})` を渡されたコマンド/引数で spawn するよう変更する。env / stdout-stderr 収集 / error ハンドリングは変更しない。
- [x] `runVerificationPhases` 冒頭（integrity check の後、phase ループの前）で `const toRunCmd = runCommand(await detectPackageManager(cwd));` を求める。
- [x] phase ループ内の `spawnScript(scriptName, cwd)` 呼び出しを、検出 PM の run コマンド（`toRunCmd(scriptName)` を分解して `command` / `args`）を渡す形に変更する。
- [x] `runVerificationCommands`（commands 経路）は変更しない（`sh -c` 実行で PM 非依存）。
- [x] `node:child_process` import / `isScriptPhase` / `scriptExists` / `writeVerificationResult` / verdict 判定ロジックは変更しない。

**Acceptance Criteria**:
- verification cwd に pnpm-lock.yaml があるとき phase fallback 経路が `pnpm run <script>` で実行される。
- verification cwd に bun.lockb / bun.lock があるとき従来どおり `bun run <script>` で実行される（後方互換）。
- `verification.commands` 設定時は commands 経路で実行され PM 検出を経由しない。
- `runner.ts` 内の phase 実行で `"bun"` ハードコードが残らない（`node:child_process` の import 記述は維持）。

## T-04: doctor の bun チェックを package-manager チェックに置き換える

対象: `src/core/doctor/checks/runtime/package-manager.ts`（新規）、`src/core/doctor/checks/runtime/bun.ts`（削除）、`src/core/doctor/checks/index.ts`

- [x] `src/core/doctor/checks/runtime/package-manager.ts` を新設し `packageManagerCheck: DoctorCheck` を export する。
  - `name: "package-manager"`, `category: "runtime"`, `required: true`。
  - `check(ctx)`: `const pm = await detectPackageManager(ctx.cwd, ctx.fs);` で検出（`DoctorFs` は `DetectPmFs` を構造的に満たす）。
  - `await ctx.execFile(pm, ["--version"], { signal: AbortSignal.timeout(5000) })` 成功 → `{ status: "pass", message: \`${pm} ${version}\` }`。
  - 失敗（throw）→ `{ status: "fail", message: \`${pm} is not installed or not in PATH\`, hint: 検出 PM のインストール手順 }`。
- [x] `src/core/doctor/checks/runtime/bun.ts` を削除する。
- [x] `src/core/doctor/checks/index.ts`: `bunVersionCheck` の import を `packageManagerCheck`（`./runtime/package-manager.js`）に差し替え、`commonChecks` 配列の `bunVersionCheck` エントリと末尾 re-export を `packageManagerCheck` に差し替える。runtime カテゴリのコメント（「3」）は据え置き。

**Acceptance Criteria**:
- `specrunner doctor` が検出 PM のバイナリ（`<pm> --version`）を required チェックする。
- pnpm プロジェクトでは pnpm を、bun プロジェクトでは bun をチェックする。
- `allChecks` の総数（>= 17）と 7 カテゴリ網羅は不変、runtime カテゴリの check 数は 3 のまま。
- `src/core/doctor/checks/` 配下に bun 固定の存在チェックが残らない。

## T-05: 既存テストの更新と検証

対象: `tests/core/worktree/manager.test.ts`、`tests/unit/core/verification/runner.test.ts`、`tests/core/doctor/checks/runtime/`（`bun.test.ts` 置換）、`tests/core/doctor/checks/all-checks.test.ts`、`tests/unit/util/detect-pm.test.ts`（新規）

- [x] `tests/unit/util/detect-pm.test.ts`（新規）: 検出シナリオ（lockfile 各種 / packageManager フィールド / fallback / 複数 lockfile 先勝ち）と `installCommand`/`runCommand` 導出表を検証する。fs は temp dir もしくは `DetectPmFs` モックで制御する。
- [x] `tests/core/worktree/manager.test.ts`: `create` 系の各ケースで第 4 引数に検出 stub（`async () => "bun"`）を注入し、`bun install --frozen-lockfile` のアサーションを後方互換として維持する。pnpm（stub `"pnpm"` → `pnpm install --frozen-lockfile`）/ npm（stub `"npm"` → `npm ci`）の新規ケースを追加する。bun install 失敗 cleanup ケースの stub も合わせる。
- [x] `tests/unit/core/verification/runner.test.ts`: 既存ケースは `spawn` モックのため behavior 不変を確認。pnpm-lock.yaml を temp dir に置き phase fallback が `pnpm run <script>` を spawn することを検証する新規ケースを追加する。
- [x] `tests/core/doctor/checks/runtime/bun.test.ts` を `package-manager.test.ts` に置換し、`ctx.fs.existsSync` のモックで lockfile 有無を制御して検出 PM が変わること、`execFile` 成功/失敗で pass/fail になることを検証する。
- [x] `tests/core/doctor/checks/all-checks.test.ts` が引き続き green（総数 / カテゴリ網羅）であることを確認する。
- [x] `tests/grep-no-bun-imports.test.ts` が green（本変更は `bun:*` / `Bun.*` を導入しない）。
- [x] `bun run typecheck` が pass する。
- [x] `bun run test` が pass する。
- [x] `bun run lint` が pass する（`--max-warnings 0`、未使用 import / unused-vars を出さない）。

**Acceptance Criteria**:
- request.md の受け入れ基準 9 項目をすべて満たす:
  - pnpm-lock.yaml プロジェクトで worktree install が `pnpm install --frozen-lockfile`。
  - pnpm-lock.yaml プロジェクトで verification が `pnpm run <script>`。
  - bun.lockb / bun.lock プロジェクトで `bun install` / `bun run`（後方互換）。
  - lockfile 不在で npm fallback。
  - `specrunner doctor` が検出 PM の存在をチェック。
  - `verification.commands` 設定時は PM 検出に影響されない。
  - 外部依存が 4 個のまま。
  - `bun run typecheck && bun run test` が green。
  - `bun run lint` が green。
