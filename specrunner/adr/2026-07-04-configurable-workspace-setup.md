# ADR-20260704: workspace セットアップを config 駆動にし、言語非依存化する

## ステータス

accepted

## コンテキスト

local runtime の job は worktree 作成後に依存 install を**無条件**で実行する。`src/core/worktree/manager.ts` の `create()` は git worktree add に成功すると `detectPm(repoRoot)` で package manager を決め、`installCommand(pm)` を worktree 内で spawn する。exit 非 0 なら worktree を `git worktree remove --force` + `rm -rf` して throw する。

lockfile も `package.json` の `packageManager` フィールドも無いとき `detectPackageManager` は default `{ pm: "npm" }` を返し、`installCommand("npm")` は `["npm", "ci"]` を返す。`npm ci` は lockfile 必須のため、lockfile を持たない非 JS（Python / Go / Rust）や lockfile 未コミットの JS では `EUSAGE` で必ず失敗し、worktree は自己清掃されて痕跡を残さず job ログも空のまま終わる。

一方 verification step は `config.verification.commands` に任意のコマンド列を指定でき言語非依存になっている。**セットアップ層だけがハードコードで JS 専用**という非対称が、多言語プロジェクトでの実質的な使用不能を生んでいた。install をスキップ・差し替える分岐は `create()` 内に存在せず、config を介して setup コマンドを差し込む seam も無かった。

## 決定

### D1: config キーは top-level `workspace.setup`、コマンド形状を `ShellCommand` に一般化して `verification.commands` と共有する

新しい top-level オブジェクト `workspace` を追加し、その `setup` フィールドをコマンド列とする。

```text
workspace?: { setup?: ShellCommand[] }
ShellCommand = string | { name?: string; run: string }
```

現行の `VerificationCommand` 型と `verificationCommandSchema` を、意味的に中立な名前 `ShellCommand` / `shellCommandSchema` に一般化する。`VerificationCommand` は `ShellCommand` への型 alias として残し、`workspace.setup` と `verification.commands` の双方が参照する。

**Rationale**: `verification.commands` と同じ `(string | { name?; run })[]` 形状・同じ `sh -c` 実行モデル・同じ fail-fast を共有することで、利用者は verification で既に学んだ書式をそのまま使える。型と schema を共有することで検証ロジックの二重化を避ける。キー名 `workspace.setup` は「workspace セットアップフェーズのコマンド」を表し、`verification.commands` が verification フェーズを表すのと対称。

**Alternatives considered**:
- *`setup.commands`（`verification.commands` を字面どおり写す）*: `<phase>.commands` の対称性は最も高いが、top-level `setup` は用途が曖昧。`workspace.setup` を採る。
- *`install` キー*: install は JS 前提の語で、非 JS の任意コマンドを包含する名前として不適。却下。

### D2: setup 方針は `WorkspaceSetupPlan` に解決してから `manager.create()` へ渡す（解決は runtime、実行は manager）

setup の解決結果を判別可能な union `WorkspaceSetupPlan` として表現する。

```text
WorkspaceSetupPlan =
  | { kind: "detect-install" }                        // 従来の detectPm + install
  | { kind: "commands"; commands: { name?; run }[] }  // config 駆動
  | { kind: "skip" }                                  // install しない
```

解決（どの kind か）は `LocalRuntime` 側の純関数 `resolveWorkspaceSetupPlan()` が行い、`manager.create()` は受け取った plan を実行するだけにする。`create()` の plan 引数は optional で、**省略時の既定は `{ kind: "detect-install" }`**（＝現行の無条件 install）とする。

**Rationale**: 「方針決定（config + 痕跡）」と「実行（spawn + 後片づけ）」を分離することで、決定ロジックを git/worktree なしの純関数として単体テストでき、`create()` は spawn mock だけで種別ごとに検証できる。`create()` の既定を `detect-install` にすることで、plan を渡さない**既存の manager テストが無改修で現行挙動のまま green**になる。production の `LocalRuntime` は 3 つの create 呼び出しすべてで解決済み plan を明示的に渡すため、痕跡ゲート / config 駆動が有効になる。plan を渡し忘れた経路があっても `detect-install`（現行挙動）へ安全に縮退する。

**Alternatives considered**:
- *`manager.create()` の内部で config と痕跡から解決する*: manager が config schema と痕跡判定に依存し、plan を渡さない既存 manager テストが全面的に壊れる。解決を runtime に上げることで manager の既定挙動を保存する。却下。
- *`create()` のシグネチャを options bag に再設計*: 3 つの呼び出し元と多数のテストを巻き込む破壊的変更。optional な末尾引数の追加に留め、影響を局所化する。却下。

### D3: 解決規則 — `setup` 定義の有無を第一分岐、痕跡は default 経路のみで参照する

`resolveWorkspaceSetupPlan(setup: ShellCommand[] | undefined, hasJsTraces: boolean)`:

1. `setup !== undefined`（空配列 `[]` を含む）→ `{ kind: "commands", commands: normalize(setup) }`。
2. `setup === undefined` かつ `hasJsTraces === true` → `{ kind: "detect-install" }`。
3. `setup === undefined` かつ `hasJsTraces === false` → `{ kind: "skip" }`。

`setup` が定義されていれば（空配列でも）そのコマンド列だけを実行する。空配列は「コマンド 0 件を実行」＝明示的な install スキップとして機能する。

**Rationale**: config が明示された場合は痕跡に関わらず config が唯一の真実源（利用者の意図が最優先）。空配列を「明示スキップ」と定義することで、痕跡がある JS プロジェクトでも install を意図的に無効化する手段を与える（`undefined`＝未設定 と `[]`＝明示的に何もしない を区別）。

**Alternatives considered**:
- *空配列を「未設定と同義」に丸める*: `undefined` と `[]` を区別できず、JS プロジェクトで install を明示的に切る手段が無くなる。区別を保つ。却下。

### D4: 「JS 依存管理の痕跡」は repoRoot 直下の lockfile または `package.json` の存在で判定する

`src/util/detect-pm.ts` に加算的な純関数を追加する。

```text
hasJsDependencyTraces(repoRoot, fsLike?): boolean
  = 既存 LOCKFILE_MAP のいずれかの lockfile が repoRoot に存在する
    OR package.json が repoRoot に存在する
```

既存の `LOCKFILE_MAP` 定数を再利用し、`detectPackageManager` 本体には一切触れない。`existsSync` を `DetectPmFs` 互換の fs 抽象で注入でき、単体テスト可能にする。

**Rationale**: 痕跡＝「lockfile または `package.json`」は要件定義そのもの。判定を repoRoot 直下に限定するのは、worktree が repoRoot の git tree から作られ、install も worktree（＝repoRoot の写し）のルートで走るため、repoRoot が決定境界として一貫するから。`detectPackageManager` を変更せず新関数を足すのは、スコープ外の「PM 検出ロジック再設計」に抵触しないため（`detectPackageManager` は常に PM を返す設計で「痕跡なし」を表現できない。判定には別関数が要る）。

重要な帰結: `package.json` はあるが lockfile が無い JS では痕跡ありと判定され `detect-install`（`npm ci`）に進み**現状どおり失敗する**。これは回帰ではなく現状維持。greenfield-JS の救済は `workspace.setup` の明示で行う。

**Alternatives considered**:
- *`detectPackageManager` の戻り値で痕跡を判定する*: 同関数は lockfile 不在でも `npm` を返し、「検出できなかった」と「default npm」を区別できない。専用関数を足す。却下。
- *lockfile を上位探索する*: repoRoot 直下判定が決定的で単純。上位探索は不要。却下。

### D5: setup コマンドは注入済み `SpawnFn` で `sh -c` 実行し、後片づけは install と共有する

`create()` の `commands` 経路は各コマンドを `spawn("sh", ["-c", run], { cwd: worktreePath })` で実行する。配列順に sequential・fail-fast。exit 非 0 で残りを skip し、worktree remove + `rm -rf` の後 `Setup command '<label>' failed (exit N): <stderr>` を throw する（`label = name ?? run`）。後片づけ（`git worktree remove --force` + `rm -rf`）は `detect-install` 経路と同一の小ヘルパーに集約する。

**Rationale**: manager の `SpawnFn` を `sh -c` で使うことで、既存の spawn mock（`cmd`/`args` を記録）でそのままテストでき、worktree → verification モジュールの横断依存を作らずに済む。実行方式・fail-fast・後片づけを `verification.commands` および現行 install と揃えることで、失敗時の後片づけ要件（worktree remove + throw）を現行パス踏襲で満たす。`util/spawn.spawnCommand` は子プロセス env から secrets を strip するため、verification 経路と同じセキュリティ姿勢になる。

**Alternatives considered**:
- *`core/verification/commands.ts` の `spawnCommand` / `normalizeCommands` を import して再利用*: worktree が verification に横断依存し、setup が verification の内部実装に意味的に結合する。normalize は数行なので worktree 側 `setup.ts` に自前で持ち、注入済み `SpawnFn` で `sh -c` する方が結合が薄い。却下。
- *setup を verification の PATH 拡張（`node_modules/.bin` 付与）付きで実行*: install 前段では `node_modules/.bin` は未生成で意味が薄く、非 JS では無関係。却下。

### D6: config を factory → `LocalRuntime` → `create()` へ最小配線する

`LocalRuntimeOptions` に `workspaceSetup?: ShellCommand[]` を追加し、`factory.ts` が `config.workspace?.setup` を渡す。`LocalRuntime.setupWorkspace()` は noWorktree 早期 return の後で `resolveWorkspaceSetupPlan(this.workspaceSetup, hasJsDependencyTraces(this.cwd))` を 1 回解決し、worktree を作る 3 経路（recreate / null resume / run）すべての `manager.create(...)` に plan を渡す。

**Rationale**: `LocalRuntime` は config 全体を保持していない（config は `buildDeps` で個別に受け取る）。必要な slice（`workspace.setup`）だけを constructor options で受ける方が状態を増やさず最小。痕跡判定は `this.cwd`（repoRoot）に対する fs 読みで、worktree 作成前でも repoRoot にプロジェクトファイルがあるため正しい。noWorktree 経路は `manager.create()` を呼ばないため plan 不要。

**Alternatives considered**:
- *config 全体を `LocalRuntime` に保持させる*: 未使用フィールドまで抱える。必要な slice のみ受ける。却下。
- *plan を `WorkspaceOptions` 経由で `setupWorkspace()` に渡す*: 呼び出し側（CommandRunner）に setup 解決責務が漏れる。runtime 内部で config slice から解決する方が責務分離が明確。却下。

## 検討した代替案

### A1: `package.json` 不在ガードのみ追加する（案B）

`package.json` が repoRoot に存在しないとき install をスキップする guard 分岐を `manager.create()` に追加するだけで対処する案。

- **Pros**: 変更量が最小。config schema 変更・型一般化・plan union いずれも不要。
- **Cons**: `package.json` はあるが lockfile が無い JS プロジェクト（greenfield-JS）を救えない。Python / Go / Rust 等の非 JS プロジェクトで任意の setup コマンド（`uv sync` / `go mod download` 等）を明示する手段が無く、インフラ構築ステップを config で制御できないまま。
- **Why not**: 「セットアップを config 駆動にし言語非依存化する」という要件の核心（要件 1）を満たさない。install スキップガードに留まると `workspace.setup` による任意コマンド指定が不可能で、Python/Go/Rust の実用ユースケースを切り捨てる。

### A2: npm フォールバックを `npm ci` から `npm install` に変更する（案C）

lockfile が無い場合のデフォルトコマンドを `npm ci`（lockfile 必須）から `npm install`（lockfile 不要）に変更することで、lockfile 未コミットの JS を救う案。

- **Pros**: `detect-pm.ts` の 1 行変更で済む。config schema や型の変更が不要。
- **Cons**: Go / Python / Rust 等の非 JS プロジェクトで npm を走らせ続ける。`npm install` は `node_modules` が無いと失敗するケースがあり、また非 JS プロジェクトに `node_modules` を混入させる副作用がある。多言語対応の本質的な問題が解決しない。
- **Why not**: 根本原因は「セットアップ層が JS 専用にハードコードされている」点にあり、コマンドを変えても非 JS プロジェクトでの失敗を解消しない。言語非依存化のために config 駆動が必要。

### A3: 解決責務を `manager.create()` 内部に持たせる

config と痕跡判定の両方を `manager.create()` 内部で行い、runtime は plan を渡さずに create を呼ぶ案。

- **Pros**: `LocalRuntime` 側の配線変更が最小になる。plan union と `resolveWorkspaceSetupPlan` の追加が不要。
- **Cons**: `manager.create()` が config schema（`ShellCommand`）と fs 判定（`hasJsDependencyTraces`）に依存し、manager の責務が「worktree 操作」から「config 解釈」へ広がる。plan を渡さない既存の manager テスト（install が常に走る前提）が全面的に壊れ、install 有無を変えるためにプロジェクトルートに偽ファイルを配置するような煩雑な fixture が必要になる。省略時の既定が「痕跡ゲート付き install」に変わるため、plan なしで呼ぶ全テストが影響を受ける。
- **Why not**: 「決定（config + 痕跡）」と「実行（spawn）」を分離することで、決定ロジックを git/worktree なしの純関数として独立テストでき、`create()` は spawn mock だけで検証できる。解決を runtime に上げ `create()` の既定を `detect-install` に保つことで、既存の manager テストが無改修 green になる後方互換を確保できる。

### A4: setup 実行に `core/verification/commands.ts` を横断 import して再利用する

verification ステップが持つ `spawnCommand` / `normalizeCommands` を worktree manager から import し、setup コマンドの実行に流用する案。

- **Pros**: normalize と spawn の実装が一箇所になり重複が最小化される。
- **Cons**: `src/core/worktree/` が `src/core/verification/` に横断依存し、worktree モジュールが verification の内部実装に意味的に結合する。verification の normalize ロジックを変更すると setup の挙動が連動して変わるリスクがある。モジュール境界が崩れ、worktree ↔ verification の依存方向が双方向化しうる。
- **Why not**: normalize は数行の実装であるため worktree 側 `setup.ts` に自前で持ち、注入済み `SpawnFn` で `sh -c` する方が結合が薄く、モジュール境界を保てる。重複は意図的な局所性と判断した。

## 影響

- JS/TS 以外のプロジェクト（Python / Go / Rust 等）および lockfile を未コミットの JS プロジェクトが、`workspace.setup` を明示することで worktree セットアップを成功させられる
- `package.json` も lockfile も持たない真の非 JS / greenfield プロジェクトは無設定で install をスキップし worktree セットアップが成功する
- lockfile を持つ既存 JS プロジェクトは設定変更なしに従来通り `detectPm` + install が実行される（回帰なし）
- `VerificationCommand` は `ShellCommand` の alias として継続機能し、既存の config ファイルや API 利用者への後方互換を維持する
- setup コマンドが exit 非 0 で失敗したときの worktree remove + throw は現行パスと同一
- `manager.create()` に plan を渡さない既存コード・テストは `detect-install` 既定で動作し、一切の改修が不要

本 ADR は以下の ADR を補完する:
- `2026-05-26-verification-commands-abstraction.md`（`VerificationCommand` の定義元。`ShellCommand` への一般化対象）
- `2026-06-07-no-worktree-execution-mode.md`（noWorktree 経路の定義。今回の変更対象外）
- `2026-06-08-detect-package-manager.md`（`detectPackageManager` の設計。今回は変更せず新関数を加算）

## 参照

- Request: `specrunner/changes/configurable-workspace-setup/request.md`
- Design: `specrunner/changes/configurable-workspace-setup/design.md`
- Spec: `specrunner/changes/configurable-workspace-setup/spec.md`
- Implementation: `src/config/schema.ts` · `src/util/detect-pm.ts` · `src/core/worktree/setup.ts` · `src/core/worktree/manager.ts` · `src/core/runtime/local.ts` · `src/core/runtime/factory.ts`
