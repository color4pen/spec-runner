# Tasks: CommandSpec 正本化

> 実装順序は「型導入 → parser/dispatch 由来化 → help/alias/deprecated/guard 導出 → 旧構造削除」。
> 各段階で挙動テスト（`main()` を叩く exit code / stdout / stderr 検査）を green に保つこと。
> 構造結合テスト（`COMMANDS` の形 / `USAGE` 定数直 import）は、その構造を変える段階と同一段階で
> 新 API 参照へ移行する。behavioral / content の assertion は無改変、構造参照のみ書換。
>
> **全タスク共通の不変制約**:
> - handler 本体（`process.cwd()` を含むコード）は `src/cli/command-registry.ts` に留める
>   （B-18 import 境界 と CWD allowlist の file-path ratchet がこの path を検査するため）。
> - `src/cli/command-registry.ts` に LLM 系 port / adapter の import を足さない（B-18）。
> - 既存コマンドの意味・exit code・出力を変えない。唯一の許容例外は要件 9 の SpecRunnerError 正規化。

## T-01: CommandSpec 型モデルと registry 木を定義する

- [ ] `src/cli/command-registry.ts` に `CommandSpec` 型を定義する: `path: string[]` / `summary: string` /
      `args?: ArgSpec[]` / `flags?: Record<string, FlagSpec>` / `requiresRepo?: boolean` /
      `worktreeGuard?: boolean` / `visibility?` / `aliasOf?: string[]` / `deprecated?` / `help?: CommandHelp` /
      `handler?: CommandHandler` / `children?: Record<string, CommandSpec>`。
- [ ] `CommandHandler` の signature は現行を維持: `(parsed: ParsedArgs, ctx?: CommandContext) => Promise<void>`。
- [ ] 2 階層固定を廃し、ノードが handler(default action) と children を同時に持てる木にする。
      class hierarchy は作らない（plain object）。metadata と handler の分離は実装裁量だが handler は当 file に残す。
- [ ] 現行 `COMMANDS` の全コマンドを CommandSpec 木へ移植する（意味・handler 本体は不変）:
      `init` / `login` / `credentials set` / `request {new,prompt,ls,template,validate}` /
      `job {start,ls,show,wait,cancel,resume,reopen,attach,archive,prune,stats}` / `config effective` /
      `inbox run` / `rules new` / `reviewers new` / `runtime {setup,status,reset}` / `doctor`(+child `repair`) /
      `usage` / alias `run`。
- [ ] `visibility` を各 spec に付与する（metadata 保持のみ。help 出し分けは実装しない）:
      `run` = `compatibility`、`doctor repair` = `repair` 等。分類は request の enum に沿えばよい。

**Acceptance Criteria**:
- CommandSpec 型が単一 registry として全コマンドを表現し、`doctor` が default action + child `repair` を
  同時に持てる（2 階層固定が撤廃されている）。
- 移植後 `typecheck` が green。
- 挙動テスト（`removed-commands` / `specrunner-worktree-guard` / `help-flag-dispatch` / `doctor-cli` /
  `attach-cli`）が無改変で green。

## T-02: flag-parser を spec 型宣言由来の検証に拡張する

- [ ] `src/cli/flag-parser.ts` の `FlagDef` を `FlagSpec` へ拡張し、`type: "boolean" | "string" | "integer"` と
      integer 用の下限（`--issue` は min 1、`--limit` は min 0）を表現できるようにする。enum(`values`)と
      `deprecated` は現行仕様を維持する。
- [ ] `ParsedArgs.flags` の値型を `string | boolean` → `string | number | boolean` に拡張し、integer flag は
      数値で格納する。
- [ ] parser は integer flag の非整数 / 範囲外を `FlagParseError` で拒否する（dispatch で exit 2 になる）。
- [ ] `--issue` / `--limit` を integer FlagSpec に宣言変更し、`runJobHandler`（command-registry.ts:456 相当）と
      `inbox run` handler（command-registry.ts:1003 相当）の `Number(...)` + `isInteger` 重複検証を除去する。
      handler は parser が返す数値を再検証なしで使う。
- [ ] **`--merge-wait-ms` は integer 型にしない**。現行の lenient 契約（不正値を無視して続行）を保つため
      string flag のまま handler 内 domain parse を維持し、`ponytail:` コメントで「lenient・behavior preservation・
      strict 化禁止」を明示する。
- [ ] 複合参照 positional は string / 専用 domain validator のまま保持する: `run` の slug|file、
      `request validate` の file|slug（`SLUG_REGEX` は既存ファイル非存在時のみ適用する domain validator として維持）、
      `job show` の jobId|slug、`job resume` の slug|short jobId prefix。CommandSpec 導入を理由に domain を狭めない。
- [ ] `ArgSpec` 型（typed positional: string / integer / enum / slug / domain）を定義する。実コマンドは大半が
      string/domain 相当だが、型で表現できること（機構は T-08 の test 専用 spec fixture で固定）。

**Acceptance Criteria**:
- `--issue abc` / `--limit abc` が parser 層で exit 2 になり、正整数/非負整数は数値として handler に渡る。
- `--merge-wait-ms` の不正値が従来どおり無視され、コマンドが続行する（exit 2 にならない）。
- `request validate <既存ファイル>` が slug 形式検証で拒否されない（domain 非縮小）。
- `issue-flag.test.ts`（自前 flag def で `type:"string"` を使う TC-IF-001 等）が無改変で green。
- `typecheck && test` が green。

## T-03: コマンド解決 + 実在判定（列挙）API を公開する

- [ ] `resolveCommand(tokens: string[])` を実装する: token を辿り children を解決、`aliasOf` は canonical target へ
      解決し `{ spec, canonicalPath, invokedAs, restArgs }` を返す。未解決は `unknown-command` /
      `unknown-subcommand` / `needs-subcommand` を区別して返す。
- [ ] `listCommandPaths(opts?: { includeAliases?: boolean })` を実装する: canonical path を再帰列挙し、
      `includeAliases:true` で alias path（`["run"]`）を含める。visibility filter を付与可能にする。
- [ ] `run` の解決契約を満たす: `resolveCommand(["run",...])` は `canonicalPath=["job","start"]`,
      `invokedAs=["run"]`。`listCommandPaths()`（canonical のみ）に `["run"]` は現れず、
      `listCommandPaths({includeAliases:true})` には現れる。
- [ ] これらの純関数は `process.cwd()` を持ち込まない（当 file 内 or 新 CLI file どちらでも可）。

**Acceptance Criteria**:
- canonical 列挙 / alias 包含列挙 / alias→canonical+invokedAs 解決の 3 契約がテストで固定される。
- `run` が「実在しない」とも「`job start` と別 command として二重計上」ともされないことをテストで固定する。
- `["doctor","repair"]` / `["credentials","set"]` / `["job","resume"]` 等の leaf が canonical 列挙に含まれる。

## T-04: dispatch を単一 flow に統一する

- [ ] `bin/specrunner.ts` を薄い entry にし、resolve → help pre-scan → worktree guard → parseFlags →
      buildCommandContext → requiresRepo 検査 → handler 実行 → 統一 catch の単一パイプラインへ委譲する。
      subcommand 経路 / normal 経路の二重実装を廃す。
- [ ] 順序は現行 normal 経路を踏襲する（help 最優先 → guard → parse → context → repo 検査 → handler）。
- [ ] 統一 catch を両経路共通にする: `FlagParseError`（`e.message` + 該当 usage、exit 2）/
      `SpecRunnerError`（`Error: {message}` / `Hint: {hint}` / exit `{exitCode}`）/ その他（`Fatal:` + exit 1）。
      → 要件 9: subcommand 経路の `SpecRunnerError` が Fatal 縮退から Error/Hint/exitCode に正規化される。
- [ ] 実効 requiresRepo は spec 木の継承 + child override で解決し、`repoRoot === null` なら `repoRequiredError`
      を出して halt する（現行と同じ path/command 名で）。
- [ ] worktree guard は resolve 済み spec（alias は target）の `worktreeGuard` から導出する。
- [ ] 未知コマンド / 未知サブコマンド / サブコマンド欠如 / `--help` / `-h` / `--version` / 引数なし の
      文言・exit code を逐語保存する（`Unknown command: <x>` / `Unknown <parent> subcommand: <sub>` /
      `Error: specrunner <cmd> requires a subcommand.` / `Usage: specrunner <cmd> <sub1|sub2>`）。
- [ ] handler 内に残っていた handler-local な `SpecRunnerError` catch（cancel / resume / reopen / attach /
      archive / prune 等）は、統一 catch に集約できるものは集約する。ただし各 handler の exit code / 文言は不変に保つ。

**Acceptance Criteria**:
- `specrunner-worktree-guard.test.ts`（run / job start / archive / resume が guard 発火 exit 2、
  job ls / cancel / show は非 guard）が無改変で green。
- `removed-commands.test.ts`（unknown command/subcommand 文言、login --provider 移行メッセージ）が無改変で green。
- `help-flag-dispatch.test.ts`（各 leaf/parent の `--help` exit 0 と本文、`job resume` 無 slug exit 2）が
  無改変で green。
- subcommand handler が投げた `SpecRunnerError` が Error/Hint/exitCode 表示になることをテストで固定する。
- `typecheck && test` が green。

## T-05: alias(`run`) と doctor default-action + child(`doctor repair`) を導出化する

- [ ] `run` の spec を `{ path:["run"], aliasOf:["job","start"], summary, help, visibility:"compatibility" }` のみに
      する。`RUN_JOB_FLAGS` の二重宣言と独立エントリ相当を廃し、flags / args / worktreeGuard / requiresRepo は
      target(`job start`)から解決する。top-level worktree guard も target 由来にする。
- [ ] `doctor` を default action(diagnose) + child `repair` の node にする。`doctor` の
      `positionals[0] === "repair"` inline 分岐（command-registry.ts:1087-1100 相当）を廃し、`repair` を child spec
      にする。repair child は `requiresRepo:true`（override）と slug 必須 positional を持ち、handler 本体
      （`repairSlugOccupancySidecar` 呼び出し・`ctx?.repoRoot ?? process.cwd()` フォールバック含む）は
      当 file 内に残す。`doctor`(親) は repo optional のまま。
- [ ] worktree guard を spec 宣言へ移す: `job start/resume/attach/archive/prune/reopen` と `inbox run` に
      `worktreeGuard:true`。現状の guarded 集合を逐語移植する（`job stats` は非 guard のまま）。

**Acceptance Criteria**:
- `run` が `job start` の alias として解決され、flags / worktree guard / requiresRepo が target と同一に働くことを
  テストで固定する（`detach-flag-cli` の run/job start 契約が新 API 参照で green）。
- `doctor`(default action) が repo 外実行可、`doctor repair <slug>` が repo 必須、`doctor repair`(無 slug) が
  exit 2 で `specrunner doctor repair` を案内、成功で exit 0、repair 例外で exit 1 になることをテストで固定する
  （doctor-repair の挙動契約を保存。構造結合部分は新 command path 参照へ移行可）。
- `["doctor","repair"]` が canonical 列挙に含まれる。

## T-06: help(top-level / parent / leaf) を CommandSpec から生成する

- [ ] `CommandHelp` 型に権威ある文言（top-level 用 line(s) と leaf 用 detail）を持たせ、既存の
      `*_USAGE` 定数の文言を spec の help へ逐語移送する:
      `LOGIN_USAGE` / `JOB_RESUME_USAGE` / `ARCHIVE_USAGE` / `REOPEN_USAGE` / `PRUNE_USAGE` / `DOCTOR_USAGE` /
      `INBOX_RUN_USAGE` / `CONFIG_EFFECTIVE_USAGE` / `RUNTIME_RESET_USAGE` / `RULES_USAGE` / `REVIEWERS_USAGE` /
      `CREDENTIALS_SET_USAGE`。
- [ ] leaf `--help` renderer: `spec.help.detail` があれば出力、無ければ summary + 非 deprecated flags + args から
      最小生成。
- [ ] parent `--help` renderer: parent の help 本文または `Usage: specrunner <cmd> <sub1|sub2>` を生成。
- [ ] top-level `--help` renderer: registry の spec を宣言順のグループで反復して一覧を生成する。グループ見出し
      （`Request commands` / `Job commands` / `Environment commands` / `Inbox commands` / `Aliases`）と `Options:`
      footer は静的 scaffolding。Aliases セクションは `aliasOf` を持つ spec(`run`)を反復。
- [ ] deprecated flag（`login --provider`）は生成 help に列挙しない。移行エラー文言（parser throw）は不変。
- [ ] 手書き top-level `USAGE` 一覧を生成へ置き換える（コマンド追加/削除が自動反映される）。旧 `USAGE` /
      `*_USAGE` 定数は生成関数の入力（spec 文言）へ移設し、直 import しているテストは T-08 で参照先を書き換える。
- [ ] pin 文言を生成後 help に保持する（部分文字列 assertion が全て green）:
      top-level: `Request commands` / `Job commands` / `request new` / `request ls`（`request show`/`request rm` は不在）/
      `job start` / `job ls` / `job archive` / `job wait` / `runtime` / `--detach` / Aliases に `run` のみ /
      `job prune` 行に worktree+sidecar / `即座に`・`returns immediately` 不在。
      leaf: `job resume` help に `--from`/`--prompt`/`--prompt-file`/`--apply-canon`/`--adopt-commits`/`--detach`/
      `--force`/`--json`/`Mutually exclusive`/`Valid steps:`/`composite step`、`No detailed help available.` 不在。
      その他 leaf: `Archive the completed change folder`（job archive）/ `Delete the Anthropic Environment`（runtime reset）/
      `LOGIN_USAGE` 相当に `--provider` 不在。

**Acceptance Criteria**:
- top-level / parent / leaf help が CommandSpec から生成される。
- pin テスト（`detach-output-contract` / `login`(TC-001) / `resume-help` / `help-flag-dispatch` / `prune-usage` /
  `doctor-help` / `help-output-tc`）の assertion 内容が全て生成後 help に対して green（参照先書換のみ、assertion の
  削除・弱体化なし）。
- 生成 help に deprecated flag が出ないことをテストで固定する。

## T-07: hint / guide の実在検査を列挙 API へ移行する

- [ ] `tests/hint-command-existence.test.ts` / `tests/unit/cli/hint-command-references.test.ts` が使う
      `Object.keys(COMMANDS)` + `entry.subcommands` 直参照を、T-03 の列挙 API(`listCommandPaths` / `resolveCommand`)
      へ移行する。alias 参照が実在扱いされるよう alias 包含列挙を使う。
- [ ] 検査対象（hint 文字列の `specrunner <verb> [<sub>]` 抽出）と破壊確認（架空コマンドで violations が出る）の
      感度は維持する。alias `run` を参照する hint が実在扱いされることを固定する。

**Acceptance Criteria**:
- hint 実在検査が spec 由来列挙 API を正本として使う。
- `specrunner run` を参照する hint が実在扱いされ、`specrunner frobnicate` 等の架空参照は検出される（破壊確認 green）。
- 既存の hint 参照検査（`STATUS_HINTS` / `PROVIDER_READINESS_HINTS` / doctor hints / local-state-writable）が green。

## T-08: 構造結合テストを新 CommandSpec API へ移行する

> behavioral / content の assertion は無改変。旧内部構造（`COMMANDS` の形・`ParentCommandDef`/`CommandDef`・
> `.subcommands`/`.guardedSubcommands`・`USAGE`/`*_USAGE` 定数直 import）への参照のみ、新 API(`resolveCommand` /
> `listCommandPaths` / help 生成関数 / spec lookup)へ書き換える。

- [ ] requiresRepo 継承機構を test 専用の小さな CommandSpec fixture で固定する（parent true → childA 継承 /
      childB override false）。かつ全 public command の実効 repo requirement が移行前と意味的に同一であることを
      固定する（`init`/`request new`/`job cancel`/`job attach`/`job prune`/`job stats`/`inbox run` = true、
      `job start`/`job ls`/`job show`/`job wait` = false、`doctor` = false / `doctor repair` = true）。
- [ ] worktree guard が spec 宣言から導出され、`bin/specrunner.ts` の手書き Set と registry の
      `guardedSubcommands` が存在しないことをテスト（grep 系 or 構造検査）で固定する。
- [ ] 以下の構造結合テストを新 API 参照へ移行する（assertion は保持）:
      `src/cli/__tests__/command-registry-reopen.test.ts` / `command-registry-resume.test.ts` /
      `command-registry-apply-canon.test.ts` / `command-registry-adopt-commits.test.ts` /
      `src/cli/__tests__/detach-flag-cli.test.ts`（`COMMANDS["job"].subcommands[...]` 参照）/
      `tests/unit/cli/doctor-repair.test.ts`（`COMMANDS["doctor"].handler` 直呼び）/
      `tests/unit/cli/prune-usage.test.ts` / `config-effective.test.ts` / `doctor-help.test.ts` /
      `doctor-cli.test.ts`（`USAGE`/`*_USAGE` 定数 import）/ その他 `COMMANDS`/`USAGE` を直 import する test。
- [ ] `login.test.ts`(TC-002) / `detach-output-contract.test.ts` は `COMMANDS`/`USAGE` を import しているため、
      参照先を新 API/生成関数へ書き換える。ただし TC-001/TC-002/TC-019/TC-009 等の assertion 内容は不変に保つ。

**Acceptance Criteria**:
- requiresRepo の parent 継承と child override の機構が test 専用 spec で固定され、全 public command の repo
  requirement が移行前と意味的に同一であることが固定される。
- `bin/specrunner.ts` の手書き worktree guard Set と registry の `guardedSubcommands` が存在しないことが固定される。
- 移行した構造結合テストが新 API 参照で green、かつ behavioral / content assertion は無改変。
- `typecheck && test` が green。

## T-09: 旧構造を削除しクリーンアップする

- [ ] 旧 `CommandDef` / `ParentCommandDef` / `CommandEntry` 型、`COMMANDS` の旧形、`guardedSubcommands`、
      `WORKTREE_GUARDED_COMMANDS`(bin)、廃止 `job finish` 言及の drift コメント(bin/specrunner.ts:123 相当)、
      重複した alias 定義（`RUN_JOB_FLAGS` の二重宣言）を削除する。互換 shim を残さない（二重正本の温存を避ける）。
- [ ] 旧 top-level `USAGE` 手書き一覧と、生成へ移せた `*_USAGE` 定数の直 export を撤去 or 生成関数入力へ集約する
      （定数を残す場合も正本は spec 側に一本化する）。
- [ ] 除去した handler-local validation（`Number`/`isInteger` の重複）が残っていないことを確認する。
      `--merge-wait-ms` の lenient parse は意図的に残す（`ponytail:` コメント付き）。
- [ ] CWD allowlist(`arch-allowlist.ts`) の command-registry.ts 系エントリが指す `process.cwd()` 部分文字列が
      当 file に残っていること（handler を移設していないこと）を確認する。TC-020 が絶対に false のまま
      （converted 3 site を allowlist に足さない）であることを確認する。

**Acceptance Criteria**:
- `guardedSubcommands` / `WORKTREE_GUARDED_COMMANDS` / 旧 2 階層固定型 / alias 二重定義 / drift コメントが
  コードベースから消えている。
- CommandSpec が唯一の正本で、手書き top-level 一覧が生成に置き換わっている。
- CWD allowlist / B-18 import 境界（`request-entrance-llm-boundary` / `core-invariants` TC-010・TC-020）が green。
- `typecheck && test` が全て green（挙動保存 + 全 request 受け入れ基準を満たす）。
