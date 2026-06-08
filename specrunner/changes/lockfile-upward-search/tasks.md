# Tasks: detectPackageManager の lockfile 上位探索と lockfile root の PATH 反映

## T-01: `detectPackageManager` を上位探索化し `{ pm, root }` を返す

対象: `src/util/detect-pm.ts`

- [x] 戻り値型 `interface DetectPmResult { pm: PackageManager; root: string }` を定義し export する。
- [x] `detectPackageManager(cwd, fsLike?)` のシグネチャを `Promise<DetectPmResult>` に変更する。
- [x] 既存の lockfile 単一ディレクトリ検査を、`cwd` を起点とする上位探索ループに置き換える（design.md D1 の手順）:
  - 各ディレクトリ `dir` で既存の固定優先順序（`pnpm-lock.yaml`→pnpm、`bun.lockb`→bun、`bun.lock`→bun、`yarn.lock`→yarn、`package-lock.json`→npm）で `fs.existsSync(path.join(dir, <lockfile>))` を確認し、見つかれば `{ pm, root: dir }` を返す。
  - lockfile が無ければ `fs.existsSync(path.join(dir, ".git"))` を確認し、存在すれば（ディレクトリ / ファイル両方を `existsSync` で拾う）ループを停止する（git root より上は探索しない）。
  - `const parent = path.dirname(dir);` を求め、`parent === dir`（filesystem root）ならループを停止する。そうでなければ `dir = parent` で次のイテレーションへ進む。
- [x] ループ停止後、`packageManager` フィールド読み取り → `npm` fallback の既存ロジックを維持する。読み取り対象は `cwd` の `package.json`（上位探索しない）。この経路で決定した場合は `{ pm, root: cwd }` を返す。
- [x] `installCommand` / `runCommand` は変更しない。外部ライブラリを import しない（`node:*` のみ）。`Bun.*` / `bun:*` を使わない。

**Acceptance Criteria**:
- `cwd` に lockfile があるとき、上位探索する前に `cwd` の lockfile で確定し `{ pm, root: cwd }` を返す（後方互換）。
- `cwd` に lockfile が無く親ディレクトリにあるとき、その親の lockfile から PM を検出し `root` を親ディレクトリにする。
- git root（`.git` を持つディレクトリ）自身の lockfile は採用するが、git root より上位の lockfile は採用しない。
- lockfile 不在時は `packageManager` フィールド → `npm` の順で決定し `root = cwd` を返す。
- filesystem root 到達で必ず停止する（無限ループしない）。

## T-02: `spawnCommand` に `root` 引数を追加し PATH に root の `.bin` を反映する

対象: `src/core/verification/commands.ts`

- [x] `spawnCommand` のシグネチャに optional 第 4 引数 `root?: string`（既定 `cwd`）を追加する。
- [x] PATH 先頭に付与する `.bin` を design.md D3 の順で組み立てる:
  - 常に `${cwd}/node_modules/.bin` を含める。
  - `root` が指定され `root !== cwd` のときのみ `${root}/node_modules/.bin` を `cwd` のものの後ろに追加する。
  - 連結順は `cwd/.bin`（→ `root/.bin`）→ 元の `env.PATH`。`env.PATH` 不在時は `.bin` 群のみ。
- [x] `spawn` / `stripSecrets` / stdout-stderr 収集 / `close` / `error` ハンドリングは変更しない。docstring の PATH 説明を root 反映を含む内容に更新する。

**Acceptance Criteria**:
- `root` が `cwd` と異なるとき、子プロセスの `PATH` が `cwd/node_modules/.bin` を `root/node_modules/.bin` より前に含み、両方を含む。
- `root` 省略時（または `root === cwd`）は `cwd/node_modules/.bin` のみを付与し、従来挙動と一致する（後方互換）。
- `normalizeCommands` は変更しない。

## T-03: verification runner を `{ pm, root }` に追従させる

対象: `src/core/verification/runner.ts`

- [x] phase 経路: `runVerificationPhases` 内の `const toRunCmd = runCommand(await detectPackageManager(cwd));` を `const { pm } = await detectPackageManager(cwd); const toRunCmd = runCommand(pm);` に変更する。
- [x] commands 経路: `runVerificationCommands` の冒頭で `const { root } = await detectPackageManager(cwd);` を 1 回求め、各 `spawnCommand(cmd.run, cwd, stripSecrets(...))` 呼び出しに `root` を第 4 引数として渡す。
- [x] commands のコマンド実行 cwd・`sh -c` 実行方式・fail-fast 順序・verdict 判定・`writeVerificationResult` は変更しない。`detectPackageManager` の import は維持する。

**Acceptance Criteria**:
- phase fallback 経路が検出 PM の run コマンド（例: `pnpm run <script>`）で従来どおり実行される（TC-042 相当が green）。
- commands 経路が `detectPackageManager(cwd)` の `root` を `spawnCommand` に渡し、子プロセス PATH に lockfile root の `node_modules/.bin` が含まれる。
- `runner.ts` 内で `detectPackageManager` の戻り値を旧 string 前提で扱う箇所が残らない。

## T-04: worktree manager を `{ pm }` に追従させる（DI 型据え置き）

対象: `src/core/worktree/manager.ts`

- [x] `createWorktreeManager` の DI 引数 `detectPmFn?: (cwd: string) => Promise<PackageManager>` の型は変更しない。
- [x] 本体のデフォルトを `const detectPm = detectPmFn ?? detectPackageManager;` から、`{ pm }` を取り出すアダプタ `const detectPm = detectPmFn ?? (async (c: string): Promise<PackageManager> => (await detectPackageManager(c)).pm);` に変更する。
- [x] `create()` 内の `const pm = await detectPm(repoRoot);` 以降（`installCommand(pm)` / spawn / cleanup / エラーメッセージ）は変更しない。
- [x] `detectPackageManager` / `PackageManager` の import は維持する。

**Acceptance Criteria**:
- 単一パッケージプロジェクトの worktree install コマンドが本変更前と同一（後方互換）。
- 既存の manager テスト（`makePmStub` が `PackageManager` を返す）が無改修で通る。
- `manager.ts` 内で `detectPackageManager` の戻り値を旧 string 前提で扱う箇所が残らない。

## T-05: doctor package-manager チェックを `{ pm }` に追従させる

対象: `src/core/doctor/checks/runtime/package-manager.ts`

- [x] `const pm = await detectPackageManager(ctx.cwd, ctx.fs);` を `const { pm } = await detectPackageManager(ctx.cwd, ctx.fs);` に変更する。
- [x] `execFile(pm, ["--version"], ...)` 以降の pass / fail / hint ロジックは変更しない。

**Acceptance Criteria**:
- 検出 PM のバイナリ（`<pm> --version`）の required チェックが本変更前と同一に動作する。
- 既存の doctor package-manager テスト（TC-PM-100〜103）が（戻り値分解の追従後）green。

## T-06: テストの更新と追加・検証

対象: `tests/unit/util/detect-pm.test.ts`、`tests/unit/verification/commands.test.ts`、`tests/unit/core/verification/runner.test.ts`、`tests/core/doctor/checks/runtime/package-manager.test.ts`、`tests/core/worktree/manager.test.ts`

- [x] `tests/unit/util/detect-pm.test.ts`: 既存の `expect(await detectPackageManager(...)).toBe("...")` を `{ pm }` 取得形式（例: `expect((await detectPackageManager(...)).pm).toBe("...")`）に更新する。`makeFsMock` の `existsSync` が `.git` を含む全パスに対応していること（既定 false でよい）を確認する。
- [x] `tests/unit/util/detect-pm.test.ts` に新規ケースを追加する:
  - cwd に lockfile があるとき `root === cwd`（後方互換）。
  - cwd に lockfile が無く親ディレクトリにある場合、親の PM を検出し `root` が親ディレクトリになる。
  - git root（`.git`）を超えて探索しない（git root 上位の lockfile を採用しない）。
  - git root 自身に lockfile がある場合は採用する。
  - `.git` がファイル（gitdir pointer）でも停止する。
  - lockfile 不在時に `root === cwd` で npm fallback する。
  - fs モックは `DetectPmFs`（`existsSync` / `readFile`）で lockfile / `.git` の有無とディレクトリ階層を制御する。
- [x] `tests/unit/verification/commands.test.ts` に `spawnCommand` の PATH 反映ケースを追加する:
  - `root` を `cwd` と異なる値で渡し、子プロセス PATH に `cwd/node_modules/.bin` と `root/node_modules/.bin` が両方含まれ、`cwd` のものが先に来ることを検証する。
  - `root` 省略時に従来どおり `cwd/node_modules/.bin` + 元の PATH のみであることを検証する（既存 C-01〜C-03 は無改修で維持）。
- [x] `tests/unit/core/verification/runner.test.ts`: 既存 TC-042（phase fallback の pnpm 検出）が green であることを確認する。
- [x] `tests/core/doctor/checks/runtime/package-manager.test.ts` / `tests/core/worktree/manager.test.ts` が green であることを確認する（戻り値分解の追従後）。
- [x] `tests/grep-no-bun-imports.test.ts` 等の横断テストが green（本変更は `bun:*` / `Bun.*` を導入しない）。
- [x] `bun run typecheck` が pass する。
- [x] `bun run test` が pass する。
- [x] `bun run lint` が pass する（`--max-warnings 0`、未使用 import / unused-vars を出さない）。

**Acceptance Criteria**:
- request.md の受け入れ基準をすべて満たす:
  - cwd に lockfile がなく親ディレクトリにある場合、親の lockfile から PM を検出する。
  - cwd に lockfile がある場合は従来どおりそのまま検出する（後方互換）。
  - `.git` を超えて探索しない。
  - `spawnCommand()` が lockfile root の `node_modules/.bin` を PATH に含める。
  - テストケースが追加されている。
  - `typecheck && test` が green。
  - `lint` が green。
