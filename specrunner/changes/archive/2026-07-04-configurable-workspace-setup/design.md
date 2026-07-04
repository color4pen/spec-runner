# Design: workspace セットアップの config 駆動化と言語非依存化

## Context

local runtime の job は worktree 作成後に依存 install を**無条件**で実行する。
`src/core/worktree/manager.ts` の `create()` は git worktree add に成功すると
`detectPm(repoRoot)` で package manager を決め、`installCommand(pm)` を worktree 内で spawn する
（`manager.ts:124-135`）。exit 非 0 なら worktree を `git worktree remove --force` + `rm -rf` して throw する。

この install 段は対象プロジェクトの言語を問わず走る。lockfile も `package.json` の `packageManager`
フィールドも無いとき `detectPackageManager` は default `{ pm: "npm" }` を返し（`detect-pm.ts:96`）、
`installCommand("npm")` は `["npm", "ci"]` を返す（`detect-pm.ts:103-108`）。`npm ci` は lockfile 必須のため、
lockfile を持たない非 JS（Python / Go / Rust）や lockfile 未コミットの JS では `EUSAGE` で必ず失敗し、
worktree は自己清掃されて痕跡を残さず job ログも空のまま終わる。

一方 verification step は `config.verification.commands` に任意のコマンド列を指定でき言語非依存になっている
（`schema.ts:120-128`、実行は `core/verification/commands.ts` の `sh -c` 経由）。**セットアップ層だけが
ハードコードで JS 専用**という非対称が、多言語プロジェクトでの実質的な使用不能を生んでいる。

### config が worktree manager に届く経路

`manager.create()` は現状 config を受け取らない。config は `createRuntime` factory
（`runtime/factory.ts:37`）が `LocalRuntime` を生成する時点で参照でき、`LocalRuntime.setupWorkspace()`
が run / resume の 3 経路で `manager.create()` を呼ぶ（`local.ts:402, 423, 466`）。したがって
setup コマンドは factory → `LocalRuntime` → `manager.create()` の引数として配線するのが自然な seam になる。

### 触れる seam

- `src/config/schema.ts` — top-level `workspace.setup` を追加（`verification.commands` と同じコマンド形状を共有）。
- `src/util/detect-pm.ts` — 「JS 依存管理の痕跡」を判定する加算的な純関数を追加（既存の PM 検出は変更しない）。
- `src/core/worktree/setup.ts`（新規） — setup 方針を解決する純関数と plan 型。
- `src/core/worktree/manager.ts` — `create()` に解決済み plan を渡し、plan の種別で install / commands / skip を分岐実行する。
- `src/core/runtime/local.ts` — config の setup を受け取り、痕跡判定と併せて plan を解決して `create()` へ渡す。
- `src/core/runtime/factory.ts` — `config.workspace?.setup` を `LocalRuntime` へ配線する。

## Goals / Non-Goals

**Goals**:

- worktree 作成後に実行する setup コマンド列を `config.workspace.setup` で指定でき、指定時はハードコード
  install の代わりにそれを実行する（`verification.commands` と対称・言語非依存）。
- setup 未指定かつ JS 依存管理の痕跡（lockfile または `package.json`）が無いとき install をスキップして
  worktree セットアップを成功させる（非 JS / greenfield が無設定で通る）。
- setup 未指定かつ痕跡があるとき、従来の `detectPm` + install を**そのまま**実行する（既存 JS+lockfile を回帰させない）。
- setup コマンド / install の exit 非 0 時の後片づけ（worktree remove + throw）を現行パスと同一に保つ。

**Non-Goals**:

- verification / archive など worktree セットアップ以外のステップの挙動変更。
- greenfield-JS で lockfile を自動生成するヒューリスティック（`workspace.setup` の明示で対応する）。
- `detect-pm` の PM 検出ロジック自体の再設計（既存の `detectPackageManager` / `installCommand` は流用する）。
- remote（managed）runtime のセットアップ経路。`ManagedRuntime.setupWorkspace()` は worktree を作らず
  install も行わない（`git checkout -b` のみ）ため、本変更の対象外。

## Decisions

### D1: config キーは top-level `workspace.setup`、コマンド形状は `verification.commands` と共有する

新しい top-level オブジェクト `workspace` を追加し、その `setup` フィールドをコマンド列とする。

```text
workspace?: { setup?: ShellCommand[] }
ShellCommand = string | { name?: string; run: string }
```

`verification.commands` が使う既存のコマンド要素型・zod schema を共有する。実装では現行の
`VerificationCommand` 型と `verificationCommandSchema` を、意味的に中立な名前
`ShellCommand` / `shellCommandSchema` に一般化し（`VerificationCommand` は `ShellCommand` への
alias として残す）、`workspace.setup` と `verification.commands` の双方が参照する。

**Rationale**: request が要求する非対称の解消は「verification と対称な setup コマンド列」。同じ
`(string | { name?; run })[]` 形状・同じ `sh -c` 実行モデル・同じ fail-fast を共有することで、利用者は
verification で既に学んだ書式をそのまま使える。型と schema を共有することで検証ロジックの二重化を避ける。
キー名を `workspace.setup` にするのは、これが「workspace セットアップ」フェーズのコマンドであることを
名前で表現するため（`verification.commands` が verification フェーズを表すのと対称）。

**Alternatives considered**:

- *`setup.commands`（`verification.commands` を字面どおり写す）*: `<phase>.commands` の対称性は最も高いが、
  top-level `setup` は用途が曖昧。「workspace のセットアップ」というフェーズ名を持つ `workspace.setup` を採る。
- *`install` キー*: install は JS 前提の語で、非 JS の任意コマンド（`uv sync` / `go mod download`）を包含する
  名前として不適。却下。

### D2: setup 方針は「plan」に解決してから `manager.create()` へ渡す（解決は runtime、実行は manager）

setup の解決結果を判別可能な union `WorkspaceSetupPlan` として表現する。

```text
WorkspaceSetupPlan =
  | { kind: "detect-install" }                        // 従来の detectPm + install
  | { kind: "commands"; commands: { name?; run }[] }  // config 駆動
  | { kind: "skip" }                                  // install しない
```

解決（どの kind か）は `LocalRuntime` 側の純関数 `resolveWorkspaceSetupPlan()` が行い、`manager.create()`
は受け取った plan を実行するだけにする。`create()` の plan 引数は optional で、**省略時の既定は
`{ kind: "detect-install" }`**（＝現行の無条件 install）とする。

**Rationale**: 「方針決定（config + 痕跡）」と「実行（spawn + 後片づけ）」を分離することで、決定ロジックを
git/worktree なしの純関数として単体テストでき、`create()` は spawn mock だけで種別ごとに検証できる。
`create()` の既定を `detect-install` にすることで、plan を渡さない**既存の manager テストが無改修で
現行挙動のまま green**になる（後方互換）。production の `LocalRuntime` は 3 つの create 呼び出しすべてで
解決済み plan を明示的に渡すため、痕跡ゲート / config 駆動が有効になる。plan を渡し忘れた経路があっても
`detect-install`（現行挙動）へ安全に縮退する。

**Alternatives considered**:

- *`manager.create()` の内部で config と痕跡から解決する*: manager が config schema（`ShellCommand`）と痕跡
  判定に依存し、かつ既定挙動が「痕跡ゲート付き install」に変わるため、plan を渡さない既存 manager テスト
  （install が常に走る前提）が全面的に壊れる。解決を runtime に上げることで manager の既定挙動を保存する。却下。
- *`create()` のシグネチャを options bag に再設計*: 3 つの呼び出し元と多数のテストを巻き込む破壊的変更。
  optional な末尾引数の追加に留め、影響を局所化する。却下。

### D3: 解決規則 — `setup` 定義の有無を第一分岐、痕跡は default 経路のみで参照する

`resolveWorkspaceSetupPlan(setup: ShellCommand[] | undefined, hasJsTraces: boolean)`:

1. `setup !== undefined`（空配列 `[]` を含む）→ `{ kind: "commands", commands: normalize(setup) }`。
2. `setup === undefined` かつ `hasJsTraces === true` → `{ kind: "detect-install" }`。
3. `setup === undefined` かつ `hasJsTraces === false` → `{ kind: "skip" }`。

`setup` が定義されていれば（空配列でも）そのコマンド列だけを実行する。空配列は「コマンド 0 件を実行」＝
明示的な install スキップとして機能する。

**Rationale**: config が明示された場合は痕跶に関わらず config が唯一の真実源（利用者の意図が最優先）。
空配列を「明示スキップ」と定義することで、痕跡がある JS プロジェクトでも install を意図的に無効化する
手段を与える（`undefined`＝未設定 と `[]`＝明示的に何もしない を区別）。痕跡判定は default 経路
（未設定）でのみ参照する。

**Alternatives considered**:

- *空配列を「未設定と同義」に丸める*: `undefined` と `[]` を区別できず、JS プロジェクトで install を明示的に
  切る手段が無くなる。区別を保つ。却下。

### D4: 「JS 依存管理の痕跡」は repoRoot 直下の lockfile または `package.json` の存在で判定する

`src/util/detect-pm.ts` に加算的な純関数を追加する。

```text
hasJsDependencyTraces(repoRoot, fsLike?): boolean
  = 既存 LOCKFILE_MAP のいずれかの lockfile が repoRoot に存在する
    OR package.json が repoRoot に存在する
```

既存の `LOCKFILE_MAP` 定数を再利用し、`detectPackageManager` 本体には一切触れない。`existsSync` を
`DetectPmFs` 互換の fs 抽象で注入でき、単体テスト可能にする。

**Rationale**: 痕跡＝「lockfile または `package.json`」は request の要件 2 の定義そのもの。判定を repoRoot
直下に限定するのは、worktree が repoRoot の git tree から作られ、install も worktree（＝repoRoot の写し）の
ルートで走り、`detectPackageManager` の default root も cwd=repoRoot であるため、repoRoot が決定境界として
一貫するから。`detectPackageManager` を変更せず新関数を足すのは、スコープ外「PM 検出ロジックの再設計」に
抵触しないため（`detectPackageManager` は常に PM を返す設計で「痕跡なし」を表現できない。判定には別関数が要る）。

痕跡定義の重要な帰結: `package.json` はあるが lockfile が無い JS では痕跡ありと判定され `detect-install`
（`npm ci`）に進み**現状どおり失敗する**。これは回帰ではなく現状維持であり、request がスコープ外とした
greenfield-JS の救済は `workspace.setup` の明示で行う、という設計と整合する。要件 2 が保証するのは
「lockfile も `package.json` も無い」真の非 JS / greenfield ケースのみ。

**Alternatives considered**:

- *`detectPackageManager` の戻り値で痕跡を判定する*: 同関数は lockfile 不在でも `npm` を返し、「検出できな
  かった」と「default npm」を区別できない。痕跡判定には使えない。専用関数を足す。却下。
- *lockfile を上位探索する*: worktree は repoRoot（git root）から作られ、`detectPackageManager` も `.git` で
  探索を止める。repoRoot 直下判定が決定的で単純。上位探索は不要。却下。

### D5: setup コマンドは注入済み `SpawnFn` で `sh -c` 実行し、後片づけは install と共有する

`create()` の `commands` 経路は各コマンドを `spawn("sh", ["-c", run], { cwd: worktreePath })` で実行する。
配列順に sequential・fail-fast。exit 非 0 で残りを skip し、worktree remove + `rm -rf` の後
`Setup command '<label>' failed (exit N): <stderr>` を throw する（`label = name ?? run`）。
後片づけ（`git worktree remove --force` + `rm -rf`）は `detect-install` 経路と同一の小ヘルパーに集約する。

setup コマンドは worktree manager が既に持つ注入済み `SpawnFn`（既定 `util/spawn.spawnCommand`）で実行する。
`sh -c` により POSIX shell のパイプ / リダイレクト / 変数展開 / `&&` 連結が使え、`uv sync` や
`go mod download && go build` のような一行が書ける。`util/spawn.spawnCommand` は子プロセス env から
secrets を strip するため、verification 経路と同じセキュリティ姿勢になる。

**Rationale**: manager の `SpawnFn` を `sh -c` で使うことで、既存の spawn mock（`cmd`/`args` を記録）で
そのままテストでき、worktree → verification モジュールの横断依存を作らずに済む。実行方式・fail-fast・
後片づけを `verification.commands` および現行 install と揃えることで、失敗時の後片づけ要件（要件 4）を
現行パス踏襲で満たす。

**Alternatives considered**:

- *`core/verification/commands.ts` の `spawnCommand` / `normalizeCommands` を import して再利用*: worktree が
  verification に横断依存し、setup が verification の内部実装に意味的に結合する。normalize は数行なので
  worktree 側 `setup.ts` に自前で持ち、注入済み `SpawnFn` で `sh -c` する方が結合が薄い。却下。
- *setup を verification の PATH 拡張（`node_modules/.bin` 付与）付きで実行*: install 前段では
  `node_modules/.bin` は未生成で意味が薄く、非 JS では無関係。現行 install と同じ素の env で足りる。却下。

### D6: config を factory → `LocalRuntime` → `create()` へ最小配線する

`LocalRuntimeOptions` に `workspaceSetup?: ShellCommand[]` を追加し、`factory.ts` が
`config.workspace?.setup` を渡す。`LocalRuntime.setupWorkspace()` は noWorktree 早期 return の後で
`resolveWorkspaceSetupPlan(this.workspaceSetup, hasJsDependencyTraces(this.cwd))` を 1 回解決し、worktree を
作る 3 経路（recreate / null resume / run）すべての `manager.create(...)` に plan を渡す。

**Rationale**: `LocalRuntime` は config 全体を保持していない（config は `buildDeps` で個別に受け取る）。
必要な slice（`workspace.setup`）だけを constructor options で受ける方が状態を増やさず最小。痕跡判定は
`this.cwd`（repoRoot）に対する fs 読みで、worktree 作成前でも repoRoot にプロジェクトファイルがあるため
正しい。noWorktree 経路は `manager.create()` を呼ばず（cwd をそのまま使い install もしない）ため plan 不要。
既存 worktree を再利用する resume 経路（`local.ts:388-399`）も `create()` を呼ばないため対象外で、install が
新たに走ることはない。

**Alternatives considered**:

- *config 全体を `LocalRuntime` に保持させる*: 未使用フィールドまで抱える。必要な slice のみ受ける。却下。
- *plan を `WorkspaceOptions` 経由で `setupWorkspace()` に渡す*: 呼び出し側（CommandRunner）に setup 解決
  責務が漏れる。runtime 内部で config slice から解決する方が責務分離が明確。却下。

## Risks / Trade-offs

- [Risk] `create()` に痕跡ゲートを入れると `/repo` 等の偽 repoRoot を使う既存 manager テストで install が
  スキップされ回帰する → Mitigation: D2 で解決を runtime に上げ、`create()` の既定を `detect-install` に
  固定。plan を渡さない既存テストは現行挙動のまま green。新規テストで commands / skip 経路を固定する。
- [Risk] `package.json` はあるが lockfile 無しの JS で従来どおり `npm ci` が失敗する（要件 2 が救えない）→
  Mitigation: これは現状維持であり回帰ではない。D4 で痕跡定義の帰結として明示し、救済は `workspace.setup`
  明示（スコープ外の自動化ではなく）とする設計に整合。
- [Risk] setup コマンドは利用者 config 由来の任意 shell であり `sh -c` で実行される → Mitigation: 実行は
  worktree 内 cwd 限定・secrets strip 済み env で、`verification.commands` と同一の信頼モデル。新たな攻撃面を
  増やさない。
- [Trade-off] `create()` の引数が 1 つ増える → optional + 既定 `detect-install` で既存呼び出し・テストの後方
  互換を保ち、影響を局所化する。
- [Trade-off] normalize ロジックが verification と worktree で小さく重複する → 横断依存を避けるための意図的な
  数行の重複。共有ユーティリティ化は本 request のスコープを超えるため見送る。

## Open Questions

- なし（config キー名は D1 で `workspace.setup` に確定、痕跡判定の厳密条件は D4 で「repoRoot 直下の
  lockfile または `package.json`」に確定、`undefined` と `[]` の区別は D3 で確定。いずれも request の
  architect 評価済み方針の範囲内で解決済み）。
