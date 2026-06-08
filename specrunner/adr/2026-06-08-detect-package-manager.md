# lockfile ベースのパッケージマネージャ自動検出

**Date**: 2026-06-08
**Status**: accepted
**Related**: `specrunner/adr/2026-04-27-cli-core-pipeline.md`（pipeline 実行の上位決定）

## Context

specrunner は pipeline 実行中に 2 種類のパッケージマネージャ（PM）コマンドを対象プロジェクトに
対して spawn するが、PM 名が `bun` にハードコードされていた。

| 箇所 | 旧コマンド | 実行 cwd |
|------|-----------|---------|
| `src/core/worktree/manager.ts` `create()` | `bun install --frozen-lockfile` | worktree |
| `src/core/verification/runner.ts` `spawnScript()` | `spawn("bun", ["run", <script>])` | verification cwd |
| `src/core/doctor/checks/runtime/bun.ts` | `execFile("bun", ["--version"])` | — |

対象プロジェクトが pnpm / npm / yarn を使う場合、`bun` が PATH に無いか、他 PM の lockfile を
無視してインストールされる問題が生じる。業界標準（Turborepo / Nx / create-next-app）は lockfile
から PM を決定的に導出する方式であり、本変更もこれに倣う。

## Decision

### D1: 検出関数は `src/util/detect-pm.ts`（util 層）に置く

util 層は副作用を持たず他のどの層からも参照可能で、worktree（core）/ verification（core）/
doctor（core）の 3 consumer から共通に import できる。

**Rationale**: util 層配置は他層からの一方向依存のみを生み、循環依存を作らない。検出ロジックを
3 consumer に inline するのは DRY 違反であり却下。

### D2: lockfile を第一シグナル、`packageManager` フィールドを補助、`npm` を fallback とする

検出優先順:

1. **lockfile の存在**（決定的順序: `pnpm-lock.yaml` → `bun.lockb` → `bun.lock` → `yarn.lock` → `package-lock.json`）
2. **`package.json` の `packageManager` フィールド**（`"<name>@<version>"` の `<name>` を取り出し既知 PM なら採用）
3. **fallback `npm`**

**Rationale**: lockfile は業界標準の第一シグナル。`packageManager` フィールドは Corepack が
Node.js 25 から除外され普及率が下がっているため補助に留める。複数 lockfile が同時存在する
稀なケースは固定順序の先勝ちで単一の決定的結果を返す。fallback を npm にするのは、lockfile も
field も無い素の Node プロジェクトで最も無難なため。

### D3: 検出関数は async、fs アクセスは注入可能インターフェース（`DetectPmFs`）に依存させる

```text
PackageManager = "bun" | "pnpm" | "yarn" | "npm"
DetectPmFs = { existsSync(path): boolean; readFile(path, "utf-8"): Promise<string> }
detectPackageManager(cwd: string, fsLike?: DetectPmFs): Promise<PackageManager>
```

`fsLike` 省略時は `node:fs` の `existsSync` + `node:fs/promises` の `readFile` を使う。

**Rationale**: `DoctorFs` は `existsSync(path): boolean` と `readFile(path, "utf-8"): Promise<string>`
を持ち `DetectPmFs` を構造的にそのまま満たす。doctor は `detectPackageManager(ctx.cwd, ctx.fs)` と
書けてユニットテストで lockfile 有無をモックできる。sync 関数（`readFileSync`）では `DoctorFs` と
構造的に適合しないため却下。

### D4: install / run コマンドは PM enum から導出する pure 関数で表現する

```text
installCommand(pm): [command, ...args]
runCommand(pm): (script) => [command, ...args]
```

| PM | `installCommand` | `runCommand(s)` |
|----|-----------------|-----------------|
| bun | `["bun","install","--frozen-lockfile"]` | `["bun","run",s]` |
| pnpm | `["pnpm","install","--frozen-lockfile"]` | `["pnpm","run",s]` |
| yarn | `["yarn","install","--frozen-lockfile"]` | `["yarn","run",s]` |
| npm | `["npm","ci"]` | `["npm","run",s]` |

**Rationale**: コマンドを `[command, ...args]` タプルで返し呼び出し側が `spawn(cmd, args)` に分解
する。npm だけ install が `npm ci`（`npm install --frozen-lockfile` は存在せず `npm ci` が lockfile
準拠の clean install）。文字列 1 本で `sh -c` 実行する代替案は shell injection 面の後退のため却下。

### D5: worktree manager の検出は `repoRoot` で行い install は worktree で実行する

`create(repoRoot, slug, jobId, ...)` の先頭で `detectPackageManager(repoRoot)` を呼ぶ。
`createWorktreeManager` に第 4 引数 `detectPmFn?: (cwd) => Promise<PackageManager>`
（デフォルト `detectPackageManager`）を追加して DI を提供する。

**Rationale**: `repoRoot` は lockfile を持つ正準なプロジェクトルートであり検出シグナルの所在が
一意。第 4 positional 引数は既存 DI（spawnFn/rmFn/sleepFn）と同じスタイルで既存 3 引数呼び出しを
壊さない。検出を worktree で行う代替案は動作はするが architect 決定が `repoRoot` を指定しており却下。

### D6: verification runner は `runVerificationPhases` 内で 1 回検出し全 phase で共有する

`runVerificationPhases` の冒頭で `runCommand(await detectPackageManager(cwd))` を求め、各 phase で
渡す。`runVerificationCommands`（commands 経路）は `sh -c` 実行で PM 非依存のため変更しない。

**Rationale**: 1 呼び出し内の検出再利用はキャッシュではなくローカル変数であり「毎回検出してよい」
方針と矛盾しない。phase ごとに毎回検出する代替案は同一 cwd を無駄に複数回検出するだけで利点がなく却下。

### D7: doctor は `bun.ts` を削除し `package-manager.ts` に置換する

`packageManagerCheck`（`name: "package-manager"`, `category: "runtime"`, `required: true`）を新設し、
`detectPackageManager(ctx.cwd, ctx.fs)` で検出した PM に対し `ctx.execFile(pm, ["--version"])` を実行
する。runtime カテゴリの check 数と `allChecks` の総数は変更前後で不変。

**Rationale**: doctor の役割は「pipeline が使う PM バイナリが存在するか」の検証。bun 固定では pnpm
プロジェクトで誤検知する。bun チェックを残しつつ他 PM チェックを追加する代替案は利用していない PM まで
required にすると誤 fail を出すため却下。

## Alternatives Considered

### Alternative 1: D1 — 検出ロジックを各 consumer に inline 実装する

- **Pros**: モジュール間依存が増えない
- **Cons**: 同一の lockfile 判定ロジックが worktree / verification / doctor の 3 箇所に分散し DRY 違反となる。将来の lockfile 種類追加時に 3 箇所を同期して修正する必要がある
- **Why not**: 重複実装の保守コストが util 層への集約より明らかに高い。却下

### Alternative 2: D2 — `packageManager` フィールドを第一シグナルにする

- **Pros**: プロジェクト作者の意図を明示的に優先できる
- **Cons**: Corepack が Node.js 25 から除外されフィールドの普及率が低下しており、lockfile より信頼度が低い
- **Why not**: 業界標準（Turborepo / Nx 等）は lockfile 優先。普及率の低いシグナルを第一にする根拠がない。却下

### Alternative 3: D2 — 複数 lockfile が同時存在する場合にエラーを投げる

- **Pros**: 不明確な状態を明示的に報告できる
- **Cons**: 複数 lockfile は稀なケースだが、エラーで pipeline を止めると運用上の不便が大きい
- **Why not**: 固定優先順序による決定的な先勝ちで吸収すれば利用者に影響なく処理できる。却下

### Alternative 4: D3 — 検出関数を sync にする

- **Pros**: await 不要でシンプル
- **Cons**: `DoctorFs` は async `readFile` しか持たず構造的に適合しない。doctor 用に別経路を持たせると検出ロジックが二重化する
- **Why not**: 単一の検出関数で全 consumer を統一する設計目標と矛盾する。却下

### Alternative 5: D4 — 文字列 1 本（`"pnpm install --frozen-lockfile"`）を返し `sh -c` で実行する

- **Pros**: 呼び出し側の分解が不要
- **Cons**: 既存 spawn は `shell: false` の配列引数を使う方針であり、文字列化は shell injection 面の後退
- **Why not**: セキュリティ方針との整合が取れない。却下

### Alternative 6: D5 — 検出を worktree（`worktreePath`）で行う

- **Pros**: worktree も committed lockfile を含むため動作する
- **Cons**: worktree の作成完了タイミングに検出が依存する。architect の決定が `repoRoot` を指定しており、検出シグナルの所在が一意でなくなる
- **Why not**: `repoRoot` が lockfile を持つ正準な場所であり、worktree の完了前後で検出タイミングが変わる設計は不必要な複雑さを生む。却下

### Alternative 7: D5 — `createWorktreeManager` を options オブジェクト化する

- **Pros**: 引数が増えても可読性が保たれる
- **Cons**: 全 call site の変更が必要でスコープ外
- **Why not**: 影響範囲が不必要に広がる。第 4 positional 引数に留める。却下

### Alternative 8: D7 — bun チェックを残しつつ pnpm / npm チェックを追加する

- **Pros**: 既存テストへの影響が最小
- **Cons**: 利用していない PM まで required にすると誤った fail を出す
- **Why not**: pnpm プロジェクトで bun が必須扱いになる誤検知は本変更の解決対象。却下

## Consequences

### Positive

- pnpm / npm / yarn プロジェクトで worktree install・verification・doctor が正しく動く
- bun プロジェクトでの挙動を完全保存（後方互換）
- 外部依存ゼロ（`package.json` dependencies は 4 個のまま）
- `DetectPmFs` インターフェースにより全 consumer でモック可能

### Negative / Known Debt

- Yarn 2+（Berry）は `--frozen-lockfile` を hard error にする（`--immutable` が必要）。Berry 利用者は `verification.commands` で回避する
- `createWorktreeManager` の引数が 4 つに増える

## References

- Request: `specrunner/changes/detect-package-manager/request.md`
- Design: `specrunner/changes/detect-package-manager/design.md`
