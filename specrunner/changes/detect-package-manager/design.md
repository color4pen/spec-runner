# Design: パッケージマネージャを lockfile から自動検出して bun ハードコードを解消する

## Context

specrunner CLI は `#!/usr/bin/env node` で動くが、pipeline 実行中に対象プロジェクトへ 2 種類の
パッケージマネージャ（PM）コマンドを直接 spawn しており、その PM 名が `bun` にハードコードされている。

| # | 箇所 | 現状コマンド | 実行 cwd |
|---|------|------------|---------|
| 1 | `src/core/worktree/manager.ts` `create()` | `bun install --frozen-lockfile` | worktree（`worktreePath`） |
| 2 | `src/core/verification/runner.ts` `spawnScript()` | `spawn("bun", ["run", <script>])` | verification cwd（`deps.cwd`） |
| 3 | `src/core/doctor/checks/runtime/bun.ts` | `execFile("bun", ["--version"])`（required） | — |

対象プロジェクトが pnpm / npm / yarn を使う場合、`bun` が PATH に無い、または bun が他 PM の lockfile を
読まずにインストールしてしまう。業界標準（Turborepo / Nx / create-next-app）は lockfile から PM を決定的に
導出する方式であり、本変更もこれに倣う。

lockfile → PM → コマンドの対応は決定的:

| lockfile | PM | install | run |
|---|---|---|---|
| `pnpm-lock.yaml` | pnpm | `pnpm install --frozen-lockfile` | `pnpm run <script>` |
| `bun.lockb` / `bun.lock` | bun | `bun install --frozen-lockfile` | `bun run <script>` |
| `yarn.lock` | yarn | `yarn install --frozen-lockfile` | `yarn run <script>` |
| `package-lock.json` | npm | `npm ci` | `npm run <script>` |

### 触れる seam

- `src/util/detect-pm.ts` — **新規**。検出関数 + コマンド導出関数。外部ライブラリ非依存（inline）。
- `src/core/worktree/manager.ts` — install コマンドを検出結果から導出。検出は **`repoRoot`**（元リポジトリ cwd）で行う。
- `src/core/verification/runner.ts` — `runVerificationPhases` の run コマンドを検出結果から導出。検出は **verification cwd** で行う。
- `src/core/doctor/checks/runtime/` — `bun.ts` を削除し `package-manager.ts` を新設。`checks/index.ts` の import / 配列 / re-export を差し替え。
- `src/core/doctor/types.ts` — **読み取りのみ**（`DoctorFs` が検出関数の fs インターフェースを構造的に満たすことを利用）。

この repo 自身は `bun.lock` を持つため、検出結果は `bun` となり既存挙動と完全一致する（後方互換）。
deps は 4 個（`@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`, `@openai/codex-sdk`, `zod`）のまま増えない。

## Goals / Non-Goals

**Goals**:

- lockfile を第一シグナルとする PM 検出関数を `src/util/detect-pm.ts` に新設する（inline、外部依存ゼロ）。
- 検出結果から install / run コマンド（`[command, ...args]`）を導出する pure 関数を同ファイルに置く。
- worktree install / verification run / doctor の 3 箇所の `bun` ハードコードを検出ベースに置き換える。
- bun プロジェクト（lockfile = `bun.lock` / `bun.lockb`）での挙動を完全保存する（後方互換）。

**Non-Goals**:

- Yarn 2+（Berry）固有対応。`yarn.lock` は検出するが Berry は `--frozen-lockfile` を hard error にする（`--immutable` が必要）。Berry プロジェクトは `verification.commands` で回避する。
- `npm_config_user_agent` の解析（CLI 直接実行では利用不可、補助シグナルとしても不要）。
- config での PM 明示指定オプションの追加（lockfile 検出で十分。必要性が確認できてから）。
- `verification.commands` 経路（`sh -c` 実行で PM 非依存）への影響。変更しない。
- 検出結果の cross-call キャッシュ機構の導入。

## Decisions

### D1: 検出関数は `src/util/detect-pm.ts`（util 層）に置く

util 層は副作用を持たず他のどの層からも参照可能で、worktree（core）/ verification（core）/ doctor（core）の
3 つの consumer から共通に import できる。

**Rationale**: util 層配置は他層からの一方向依存のみを生み、循環依存を作らない。これは architect 評価済みの配置決定。

**Alternatives considered**: *core 内の各 consumer に inline 実装*: 検出ロジックが 3 箇所に分散し DRY 違反。却下。

### D2: lockfile を第一シグナル、`packageManager` フィールドを補助、`npm` を fallback とする

検出優先順:

1. **lockfile**（存在確認のみ）。複数存在時は決定的順序で先勝ち: `pnpm-lock.yaml` → `bun.lockb` → `bun.lock` → `yarn.lock` → `package-lock.json`。
2. **`package.json` の `packageManager` フィールド**（`"<name>@<version>"` の `<name>` を取り出し、既知 PM 名なら採用）。
3. **fallback `npm`**。

**Rationale**: lockfile は業界標準の第一シグナル。`packageManager` フィールドは Corepack が Node.js 25 から
除外され普及率が下がっているため補助に留める（architect 評価済み）。fallback を npm にするのは、lockfile も
field も無い素の Node プロジェクトで最も無難なため。複数 lockfile は稀だが、検出は必ず単一の決定的結果を返す
必要があるため固定順序で先勝ちとする。

**Alternatives considered**: *`packageManager` フィールドを第一シグナルにする*: Corepack の除外で普及率が低く、lockfile より信頼度が低い。却下。 *複数 lockfile でエラーを投げる*: pipeline を止めてしまい運用上不便。決定的先勝ちで吸収する。却下。

### D3: 検出関数は async、fs アクセスは注入可能インターフェースに依存させる

```text
PackageManager = "bun" | "pnpm" | "yarn" | "npm"
DetectPmFs = { existsSync(path): boolean; readFile(path, "utf-8"): Promise<string> }
detectPackageManager(cwd: string, fsLike?: DetectPmFs): Promise<PackageManager>
```

- lockfile 判定は `existsSync`（architect 評価済み「`fs.existsSync` のコストは無視できる」）。
- `packageManager` フィールド読み取りは `readFile`。
- `fsLike` 省略時は `node:fs` の `existsSync` + `node:fs/promises` の `readFile` をデフォルト適用。

**Rationale**: async + 注入可能 fs にすることで 3 consumer すべてと doctor のモック要件を 1 関数で満たせる。
特に doctor の `DoctorFs` は `existsSync(path): boolean` と `readFile(path, "utf-8"): Promise<string>` を持ち、
`DetectPmFs` を**構造的にそのまま満たす**ため、doctor は `detectPackageManager(ctx.cwd, ctx.fs)` と書けて
ユニットテストで lockfile 有無をモックできる。worktree（`create()`）と verification（`runVerificationPhases`）は
ともに async 文脈なので await できる。

**Alternatives considered**:

- *sync 関数（`readFileSync`）*: doctor の `DoctorFs` は async `readFile` しか持たず構造的に適合しない。doctor 用に別経路の fs を持たせると検出ロジックが二重化する。却下。

### D4: install / run コマンドは PM enum から導出する pure 関数で表現する

```text
installCommand(pm): [command, ...args]
runCommand(pm): (script) => [command, ...args]
```

導出表:

| PM | `installCommand` | `runCommand(s)` |
|---|---|---|
| bun | `["bun", "install", "--frozen-lockfile"]` | `["bun", "run", s]` |
| pnpm | `["pnpm", "install", "--frozen-lockfile"]` | `["pnpm", "run", s]` |
| yarn | `["yarn", "install", "--frozen-lockfile"]` | `["yarn", "run", s]` |
| npm | `["npm", "ci"]` | `["npm", "run", s]` |

**Rationale**: コマンドを `[command, ...args]` タプルで返し、呼び出し側が `spawn(cmd, args)` に分解する。
npm だけ install が `npm ci`（`npm install --frozen-lockfile` は存在せず、`npm ci` が lockfile 準拠の clean
install）— これは architect 評価済み。pure 関数なので副作用なく単体テスト容易。

**Alternatives considered**: *文字列 1 本（`"pnpm install --frozen-lockfile"`）を返し `sh -c` で実行*: 既存 spawn は `shell: false` で配列引数を使う方針であり、文字列化は shell injection 面の後退。却下。

### D5: worktree manager の検出は `repoRoot` で行い、install は worktree で実行する

`create(repoRoot, slug, jobId, ...)` の先頭で `detectPackageManager(repoRoot)` を呼ぶ。導出した install コマンドを
`spawn(cmd, args, { cwd: worktreePath })` で実行する（実行 cwd は従来どおり worktree）。検出だけを `repoRoot`
で行う。DI として `createWorktreeManager(spawnFn?, rmFn?, sleepFn?, detectPmFn?)` に第 4 引数
`detectPmFn?: (cwd) => Promise<PackageManager>`（デフォルト `detectPackageManager`）を追加する。

**Rationale**: `repoRoot` は lockfile を持つ正準なプロジェクトルートであり、検出シグナルの所在が一意。
検出を worktree の作成完了タイミングに依存させない。第 4 positional 引数は既存 DI（spawnFn/rmFn/sleepFn）と
同じスタイルで、既存の 3 引数呼び出しを壊さず、fake パスを多用する manager テストが検出器を stub できる。

**Alternatives considered**:

- *検出を worktree（`worktreePath`）で行う*: worktree も committed lockfile を含むため動作はするが、request の architect 決定が `repoRoot` を指定。検出シグナルの所在を一意にする観点でも repoRoot が適切。却下。
- *factory を options オブジェクト化*: 全 call site の変更が必要でスコープ外。第 4 positional 引数に留める。

### D6: verification runner は `runVerificationPhases` 内で 1 回検出し全 phase の run に使う

`runVerificationPhases(slug, cwd, baseBranch)` の冒頭（integrity check の後、phase ループの前）で
`runCommand(await detectPackageManager(cwd))` を求め、`spawnScript` を run コマンド引数を受け取る形に一般化して
各 phase で渡す。`runVerificationCommands`（commands 経路）は `sh -c` 実行で PM 非依存のため**変更しない**。

**Rationale**: 1 回の `runVerificationPhases` 呼び出し内で検出を 1 度行い全 phase で共有するのは「cross-call
キャッシュ」ではなくローカル変数の再利用であり、architect の「キャッシュしない（毎回検出してよい、コスト無視）」
方針と矛盾しない。

**Alternatives considered**: *phase ごとに毎回検出する*: 同一 cwd を無駄に複数回検出するだけで利点がない。1 呼び出し 1 検出に留める。却下。

### D7: doctor は `bun.ts` を削除し `package-manager.ts` に置換する

`packageManagerCheck`（`name: "package-manager"`, `category: "runtime"`, `required: true`）を新設し、
`detectPackageManager(ctx.cwd, ctx.fs)` で検出した PM に対し `ctx.execFile(pm, ["--version"])` を実行する。
成功 → `pass`（例: `pnpm 9.12.0`）、失敗 → `fail`（hint に検出 PM のインストール方法）。`checks/index.ts` の
import / `commonChecks` 配列 / 末尾 re-export の `bunVersionCheck` 参照を `packageManagerCheck` に差し替える。
runtime カテゴリの check 数は 3 のまま、`allChecks` 総数（>= 17）も不変。

**Rationale**: doctor の役割は「この環境で pipeline が使う PM バイナリが存在するか」の検証。bun 固定では pnpm
プロジェクトで誤検知するため、検出 PM のバイナリを検証する。`DoctorFs` が `DetectPmFs` を構造的に満たすので
検出ロジックを再利用でき、テストでは `ctx.fs.existsSync` のモックで PM を制御できる。

**Alternatives considered**: *bun チェックを残しつつ pnpm/npm チェックを追加する*: 利用していない PM まで required にすると誤った fail を出す。検出 PM 1 本に絞る。却下。

## Risks / Trade-offs

- [Risk] manager / verification runner / doctor の既存テストが `bun` 前提で壊れる → Mitigation: manager テストは第 4 引数に検出 stub を注入し bun 系アサーションを後方互換として維持（pnpm/npm の新規ケースを追加）。verification runner テストは `spawn` モックのため behavior 不変（コマンド名直接アサートは現状無し）、pnpm lockfile を temp dir に置く新規ケースを追加。doctor は `bun.test.ts` を `package-manager.test.ts` に置換。
- [Risk] 複数 lockfile の同時存在で検出が非決定になる → Mitigation: D2 の固定順序で先勝ち。テストで明示する。
- [Risk] Yarn Berry が `--frozen-lockfile` を hard error にする → Mitigation: Non-Goal として明示。検出は yarn を返すが Berry 利用者は `verification.commands` で回避する旨を request / spec に記載。
- [Trade-off] `createWorktreeManager` の引数が 4 つに増える → options オブジェクト化より影響範囲が小さく、既存 DI スタイルに整合する第 4 positional を選択。

## Open Questions

- なし（lockfile 検出範囲・コマンド対応・配置はすべて architect 評価済みで確定）。
