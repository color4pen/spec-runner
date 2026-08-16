# Design: CommandSpec を CLI 公開契約の単一正本にする

## Context

`specrunner` の CLI 契約は現在 3 箇所に分散して手書き管理されている:

- `src/cli/command-registry.ts` — `CommandDef`(leaf)/ `ParentCommandDef`(2 階層固定)。flags / positional / usage / requiresRepo / handler と、parent 単位の `guardedSubcommands` Set、top-level `USAGE` 手書き一覧、各コマンド専用の `*_USAGE` 定数を持つ。
- `bin/specrunner.ts` — dispatch。`"subcommands" in entry` で subcommand 経路と normal 経路に分岐し、help pre-scan / worktree guard / parseFlags / context 構築 / requiresRepo 検査 / エラー処理を **二重実装**する。top-level の worktree guard は `WORKTREE_GUARDED_COMMANDS = new Set(["run"])` の手書き（直上コメントは廃止済み `job finish` に言及したままの drift）。
- `src/cli/flag-parser.ts` — `FlagDef`(boolean | string + enum + deprecated)。

この分散により以下の drift / 重複が構造的に存在する（request 現状コード前提と一致することを確認済み）:

1. `run` は `job start` の promoted shortcut だが独立 top-level エントリで、alias 関係は `RUN_JOB_FLAGS`/`runJobHandler` の共有とコメントでしか表現されていない。
2. `doctor repair` は doctor handler 内の `positionals[0] === "repair"` inline 分岐で、command path として registry に存在しない。
3. `requiresRepo` は leaf ごと手書き。`job start/ls/show/wait` は持たず handler 側が `ctx?.repoRoot ?? process.cwd()` で個別フォールバックする。
4. deprecated flag(`login --provider`)の help 非表示は `LOGIN_USAGE` の手書き省略で担保。
5. top-level `USAGE` の手書き一覧は実コマンドと drift し得る（部分的な `toContain` テストでのみ固定）。
6. `--issue`/`--merge-wait-ms`/`--limit` の数値検証と `request validate` の `SLUG_REGEX` を handler が個別実装。
7. subcommand 経路の catch には `SpecRunnerError` 分岐が無く、同じ例外が経路により `Error/Hint/exitCode`(normal) と `Fatal`(subcommand) に分かれる。

**制約（探索で確認した既存の歯）**:

- `src/cli/command-registry.ts` は path 固定で 2 つの機械検査に縛られている:
  - **B-18 import 境界** (`request-entrance-llm-boundary.test.ts` / `core-invariants.test.ts`): このファイルは LLM 系 port / adapter を import してはならない。
  - **CWD allowlist ratchet** (`arch-allowlist.ts` + `core-invariants.test.ts` TC-010): `src/` の全 `process.cwd()` 出現は allowlist で被覆される必要があり、command-registry.ts 内の 10 箇所が `(file 末尾, pattern 部分文字列)` で登録されている。
  - → **handler 本体（`process.cwd()` を持つコード）を別ファイルへ移設すると両検査が壊れる/弱まる**。本 request は handler を command-registry.ts に留める。
- pinned help 内容は `toContain` / `not.toContain` / regex による部分文字列固定（`detach-output-contract` / `login` / `resume-help` / `help-flag-dispatch` / `prune-usage` / `doctor-help` / `help-output-tc`）。生成後の help がこれらの部分文字列を保持すれば green。
- 挙動テスト（`main()` を end-to-end で叩き exit code / stderr / stdout を検査）は `removed-commands` / `specrunner-worktree-guard` / `help-flag-dispatch` / `doctor-cli` / `attach-cli` 等。`Unknown command: <x>` / `Unknown <parent> subcommand: <sub>` / worktree guard の exit 2 と文言 / help exit 0 と本文が正本。

## Goals / Non-Goals

**Goals**:

- CLI 公開契約を単一の `CommandSpec` 木に集約し、そこから **parsing / dispatch / help(leaf・parent・top-level) / alias / deprecated 互換面 / requiresRepo / worktree guard / visibility / コマンド実在判定** を機械導出する。
- subcommand / normal の二重 dispatch を単一 flow に統一し、`SpecRunnerError` を両経路で `Error/Hint/exitCode` に正規化する。
- `run` を `aliasOf: ["job","start"]` の解決として表現し、独立エントリの二重定義を廃す。
- `doctor`(default action)+ `doctor repair`(child) を command path として表現し、inline 分岐を廃す。
- `guardedSubcommands` Set と `WORKTREE_GUARDED_COMMANDS` Set を廃し、guard を spec 宣言から導出する。
- 全 public command path の列挙 API を公開し、canonical / alias を区別可能にする（hint 実在検査がこれを使う）。
- 既存コマンドの意味・exit code・出力仕様を保存する（唯一の許容例外は要件 9 の SpecRunnerError 正規化）。

**Non-Goals**（request スコープ外を転記）:

- `specrunner guide` サブコマンド / guide 本文。
- コマンドの大規模 rename / remove。
- repoRoot debt の全面修正（handler 内の個別フォールバック挙動は現状維持）。
- inbox の exit propagation 修正 / login の config 副作用除去 / doctor hint の内容改善 / rules・reviewers の仕様変更 / runtime reset の semantics 変更 / 個別コマンドの UX 改善。
- repo requirement の意味的変更（`job` 配下一括 repo-required 化はしない）。
- handler の application operation 層への全面移行（terminal 依存除去）。CommandSpec は CLI Adapter の契約であり境界だけを固定する。
- visibility に基づく help の表示グルーピング・出し分け（今回は metadata 保持 + 列挙 filter まで）。
- `SPECRUNNER_*` env var の parseInt（flag parsing 契約外、handler / util に残す）。

## Decisions

### D1: CommandSpec は plain-object の木。class hierarchy を作らない

**決定**: CLI 契約を `CommandSpec` の再帰ツリーとして表現する。各ノードは概念的に:

```
CommandSpec = {
  path: string[]              // canonical path, 例 ["job","resume"]
  summary: string
  args?: ArgSpec[]            // typed positional
  flags?: Record<string, FlagSpec>
  requiresRepo?: boolean      // 省略時は parent から継承
  worktreeGuard?: boolean     // 省略時 false
  visibility?: "normal" | "operator" | "maintenance" | "repair" | "compatibility"
  aliasOf?: string[]          // 指定時、flags/args/guard/requiresRepo/help を target から解決
  deprecated?: DeprecatedSpec // command-level（本 request では未使用でよい）
  help?: CommandHelp          // 権威ある文言（後述）
  handler?: CommandHandler    // default action。純粋な parent は持たない
  children?: Record<string, CommandSpec>
}
```

- 2 階層固定（`CommandDef` / `ParentCommandDef`）を廃す。ノードは **handler（default action）と children を同時に持てる** ため、`doctor`(handler=diagnose)+`doctor.children.repair` を自然に表現できる。
- metadata と handler を分離（`defineCommands({...})` + handlers map）するかは実装裁量とするが、**handler 本体は `src/cli/command-registry.ts` に留める**（Context の B-18 / CWD allowlist 制約）。
- `CommandHandler` の signature は現行を維持: `(parsed: ParsedArgs, ctx?: CommandContext) => Promise<void>`。

**Rationale**: 多態は不要で、正本の一意化が目的。plain object は列挙 / 導出（parser/help/guard を spec から機械生成）に最も素直。木構造なら 2 階層固定を撤廃でき、`doctor` 型の default+children を追加コードなしで表現できる。

**Alternatives considered**:
- class 階層 + メソッド override — architect 評価で却下済み（多態不要、正本の分散を増やす）。
- 現行 `CommandDef | ParentCommandDef` を維持し `doctor repair` だけ inline のまま — 正本一意化という目的を満たさない。

### D2: 型検証は parser 層。ただし「既存契約と等価に表現可能な値」に限る

**決定**: `FlagSpec` / `ArgSpec` に型（`string` / `integer` / `enum` / `slug` / domain）を宣言し、parser が **既存挙動と等価な場合に限り** 検証する。

- `--issue`（現行 `Number` → `isInteger && n>0`、不正は exit 2）→ `integer` FlagSpec（min 1）。不正は `FlagParseError` → dispatch で exit 2。**exit code 等価**。
- `--limit`（現行 `Number` → `isInteger && n>=0`、不正は exit 2）→ `integer` FlagSpec（min 0）。**exit code 等価**。
- enum flag（`--runtime`/`--provider`/`--status`/`--from`）→ 既に parser が enum 検証済み。`values` を FlagSpec に移送。
- **`--merge-wait-ms` は parser 型検証にしない**。現行は不正値を **無視して続行**する寛容（lenient）契約であり、strict integer（不正 → exit 2）と **等価でない**。string flag のまま handler 内 domain parse を維持し、`ponytail:` コメントで「lenient 契約・behavior preservation」を明示する。
- **複合参照 positional は string / 専用 domain validator で保持**（domain を狭めない）:
  - `run` の `slug|file`、`request validate` の `file|slug`（`SLUG_REGEX` は既存ファイル非存在時のみ適用する domain validator として保持）、`job show` の `jobId|slug`、`job resume` の `slug|short jobId prefix`。
- `ParsedArgs.flags` の値型を `string | boolean` → `string | number | boolean` に拡張し、integer flag は数値で格納する。

**Rationale**: 「型検証を parser へ寄せる」目的と「入力 domain を狭めない / 挙動を保存する」制約の両立点は「等価に表現可能な値だけ移送」。lenient / composite は等価でないため handler / domain に残すのが正しい lazy 解（誤って strict 化すると挙動 regression）。

**Alternatives considered**:
- merge-wait-ms も strict integer 化 — 不正値で exit 2 になり挙動 regression。却下。
- composite positional を「正しい validation 化」する — CLI surface cleanup と混ざる（architect 評価で本 request では不可）。却下。

### D3: alias は「解決」であって「複製」ではない

**決定**: `run` の spec は `{ path:["run"], aliasOf:["job","start"], summary, help, visibility:"compatibility" }` のみを持つ。flags / args / worktreeGuard / requiresRepo は **resolve 時に target(`job start`)から解決**する。`RUN_JOB_FLAGS` の二重宣言と独立エントリを廃す。top-level worktree guard も target の `worktreeGuard` から導出する。

**Rationale**: alias を複製で表すと drift の温床（現状そのもの）。参照解決に一元化すれば flags/guard の再宣言が構造的に不可能になる。

**Alternatives considered**: `run` を job start と同一 flags を再宣言した独立 spec にする — drift を残す。却下。

### D4: requiresRepo は parent 継承 + child override

**決定**: 実効 requiresRepo は「root からノードを辿り、明示された最も近い値を採用（child override が勝つ）」。

- 実物では `doctor`(false) と `doctor.children.repair`(true override) にこの機構を使う。
- **既存 leaf の repo requirement は意味を変えず逐語移植**する。`job` parent には `requiresRepo` を **設定しない**（未指定=false）。これにより `job start/ls/show/wait` は現状どおり repo-optional のまま。repo-required な leaf（`init` / `request new` / `job cancel` / `job attach` / `job prune` / `job stats` / `inbox run`）は各 spec で `requiresRepo: true` を明示する。
- 継承機構そのものは **test 専用の小さな spec fixture**（parent true → childA 継承 / childB override false）で固定する。

**Rationale**: `job` を repo-required へ強化するのはスコープ外。継承機構は doctor で実使用しつつ、汎用性は test fixture で保証する。

**Alternatives considered**: `job` parent に requiresRepo:true を置き child が inherit — `job start/ls/show/wait` を repo-required に変え挙動 regression。却下（スコープ外の強化）。

### D5: worktree guard は spec 宣言から導出。手書き Set を全廃

**決定**: 各 leaf に `worktreeGuard?: boolean` を宣言。dispatch は resolve 済み spec（alias は target）の `worktreeGuard` を見て guard を実行する。`guardedSubcommands`(job / inbox) と `WORKTREE_GUARDED_COMMANDS`(bin) と drift コメントを削除する。

- guard=true: `job start` / `job resume` / `job attach` / `job archive` / `job prune` / `job reopen` / `inbox run`。`run` は alias 解決で `job start` の guard を引き継ぐ。
- 現状の guarded 集合を逐語移植（`job stats` は guard 対象外のまま等）。

**Rationale**: guard を宣言に一元化すれば top-level / subcommand の二重管理と drift（廃止 `job finish` コメント）が消える。

**Alternatives considered**: guard を親 spec に集約 Set として残す — 宣言の分散が消えず drift 源が残る。却下。

### D6: dispatch を単一 flow に統一し、SpecRunnerError を両経路で正規化

**決定**: `bin/specrunner.ts` を薄い entry にし、resolve → help pre-scan → worktree guard → parseFlags → buildCommandContext → requiresRepo 検査 → handler 実行 → 統一 catch の **単一パイプライン**（`src/cli` 側の dispatch 関数）に委譲する。

- **順序は現行 normal 経路を踏襲**（help 最優先 → guard → parse → context → repo 検査 → handler）。subcommand 経路も同一順序に収束する。
- catch は FlagParseError（exit 2 + usage）/ `SpecRunnerError`（`Error: {message}` / `Hint: {hint}` / `exit {exitCode}`）/ その他（`Fatal:` + exit 1）を **両経路共通**で扱う。要件 9 の許容: subcommand 経路の `SpecRunnerError` が `Fatal` 縮退から `Error/Hint/exitCode` へ正規化される。
- unknown command / unknown subcommand / missing subcommand のエラー文言（`Unknown command: <x>` / `Unknown <parent> subcommand: <sub>` / `Error: specrunner <cmd> requires a subcommand.` / `Usage: specrunner <cmd> <sub1|sub2>`）は逐語保存する（挙動テスト正本）。
- `--help` / `-h` / `--version` / 引数なし の top-level 分岐は現行文言・exit code を保存。
- **handler+children ノードの dispatch fallback**: ノードが `handler`（default action）と `children` を両方持つ場合（`doctor` 等）、`resolveCommand` は次の規則で解決する: `args[1]` が既知 child のキーに一致する → child spec を解決する。`args[1]` が既知 child にマッチしない（または `args[1]` が存在しない）→ そのノード自体を解決済み spec として返し、`restArgs` に残りの tokens を渡す（`unknown-subcommand` を返さない）。これにより `specrunner doctor foo` は default action（diagnose）に渡り、現行挙動を保存する。`unknown-subcommand` は「children を持ち handler を持たない純粋な parent」のみに適用する。

**Rationale**: 二重実装がエラー処理の経路差（accidental drift）を生んでいた。単一 flow が根本解。順序を normal 経路に合わせるのは、pinned な help 最優先・guard-before-parse の挙動を保つため。

**Alternatives considered**: 経路は 2 つ残し catch だけ揃える — 二重実装という根本原因が残り再 drift する。却下。

### D7: help は spec が持つ文言を組み立てて生成する（手書き一覧を廃止）

**決定**: `CommandHelp` に権威ある文言を載せ、renderer がそれを組み立てる。

- **leaf `--help`**: `spec.help.detail`（現行 `JOB_RESUME_USAGE` / `ARCHIVE_USAGE` / `REOPEN_USAGE` / `PRUNE_USAGE` / `DOCTOR_USAGE` / `LOGIN_USAGE` / `INBOX_RUN_USAGE` / `CONFIG_EFFECTIVE_USAGE` / `RUNTIME_RESET_USAGE` / `CREDENTIALS_SET_USAGE` を逐語移送）があればそれを出力。無ければ summary + 非 deprecated flags + args から最小生成。
- **parent `--help`**（`credentials` / `rules` / `reviewers` / `runtime` / 引数なし `job` 等）: parent の help 本文（`RULES_USAGE` / `REVIEWERS_USAGE` 等）または `Usage: specrunner <cmd> <sub1|sub2>` を生成。
- **top-level `--help`**: **registry の spec を宣言順のグループで反復**して一覧行を生成する。各行は spec が持つ top-level 用文言（現行 `USAGE` の各行を spec に移送）。グループ見出し（`Request commands` / `Job commands` / `Environment commands` / `Inbox commands` / `Aliases` 等）と `Options:` footer は静的 scaffolding。Aliases セクションは `aliasOf` を持つ spec（`run` のみ）を反復。
- **anti-drift**: 一覧が spec 反復で生成されるため、コマンド追加/削除が自動反映され手書き一覧との drift が消える。
- **deprecated flag 非表示**: 生成 help は `deprecated` フラグを列挙しない → `login --provider` は help に出ない（TC-001 保持）。移行エラー文言（parser throw）は不変。
- **文言保持**: pinned な部分文字列（`--detach` 説明 / `job wait` 誘導 / `--from`・`--apply-canon`・`Mutually exclusive`・`Valid steps:`・`composite step` / `job prune` 行の worktree+sidecar / `Archive the completed change folder` / `Delete the Anthropic Environment` / `Request commands`・`Job commands` / Aliases に `run` のみ 等）は spec 文言として逐語保持し、生成後 help に対して同一 assertion を green に保つ。

**Rationale**: 「生成に寄せる」目的（drift 排除）と「pinned 文言保持」制約の両立点は、**文言は spec に持たせ、組み立てだけ生成**する形。文言を機械生成し切る形式は pinned assertion を壊すため不採用（architect 評価と一致）。

**Alternatives considered**: help を summary/flags から完全機械生成 — `Mutually exclusive` 節・step 列挙・複合注記など pinned 文言が再現できず assertion 破壊。却下。

### D8: コマンド実在判定 API（列挙 + 解決）

**決定**: registry から以下を公開する。

- `listCommandPaths(opts?: { includeAliases?: boolean }): string[][]` — canonical path 列挙。`includeAliases` で alias path（`["run"]`）を含める。
- `resolveCommand(tokens: string[]): { spec, canonicalPath, invokedAs, restArgs } | { kind: "unknown-command" | "unknown-subcommand" | "needs-subcommand", ... }` — token を辿り children を解決、`aliasOf` は canonical target へ解決し `invokedAs`（入力どおり `["run"]`）と `canonicalPath`（`["job","start"]`）を分離して返す。
- visibility filter を列挙に付与可能にする（help 出し分けは今回未使用、metadata 保持のみ）。

**canonical / alias の区別契約**:
- `run` は `listCommandPaths({includeAliases:true})` に alias として現れ、`listCommandPaths()`（canonical のみ）には現れない。
- `resolveCommand(["run", ...])` は `canonicalPath=["job","start"]`, `invokedAs=["run"]` を返す。
- → `run` が「実在しない」判定も「`job start` と別 command として二重計上」もされない。

**hint / guide 実在検査の移行**: `hint-command-existence.test.ts` / `hint-command-references.test.ts` 等が使う `Object.keys(COMMANDS)` + `entry.subcommands` 直参照を、この列挙 API 経由に移行する（案内文が alias を参照しても実在扱いされるよう `includeAliases:true` を使う）。

**Rationale**: 実在判定を spec 由来 API に一元化すれば「案内するコマンドが実在するか」を単一正本で検査できる。alias 区別を API 契約に含めることで、alias を実在扱いしつつ canonical 集合を汚さない。

**Alternatives considered**: `Object.keys(COMMANDS)` を維持 — 2 階層固定に縛られ children を再帰列挙できず、alias の区別も表現できない。却下。

### D9: 段階移行を PR 内実装順序として維持する（1 request 一括）

**決定**: request の「分割検討済み」に従い 1 request で完遂する。実装は `型導入 → parser/dispatch 由来化 → help/alias/deprecated/guard 導出 → 旧 USAGE・inline 分岐・重複 metadata・手書き Set 削除` の順で進め、**各段階で既存挙動テスト green を保つ**。構造結合テスト（`COMMANDS` の形 / `USAGE` 定数 import）は、その構造を変える段階と同一段階で新 API 参照へ移行する。

**Rationale**: 2 分割すると中間 main に「手書き USAGE と CommandSpec の二重正本」が残り、本 request の解消対象を増やす。

**Alternatives considered**: 土台 request と上物 request の 2 分割 — 中間 main に二重正本が残る（architect 評価で却下済み）。

## Risks / Trade-offs

- [Risk] handler 移設で B-18 import 境界 / CWD allowlist の file-path 検査が壊れる → **Mitigation**: handler 本体（`process.cwd()` を持つコード含む）を `src/cli/command-registry.ts` に留める。help renderer / resolver / 列挙 API のみ純関数として同ファイルまたは新 CLI ファイルに置く（`process.cwd()` を持ち込まない）。
- [Risk] help 生成で空白 / 改行が変わり pinned assertion が破れる → **Mitigation**: pinned は全て `toContain` / `not.toContain` / regex（部分文字列）。文言を spec に逐語移送し、各グループ見出し・footer を静的保持。移行後に対象テスト（`detach-output-contract` / `login` / `resume-help` / `help-flag-dispatch` / `prune-usage` / `doctor-help` / `help-output-tc`）を green で確認する。
- [Risk] `--issue` / `--limit` の parser 移送で detach 経路との評価順が変わる（`run --detach --issue abc` が parse 時点 exit 2 になる）→ **Mitigation**: 現行も detach 子で同 validation により非ゼロ終了に至るため実質等価。exit code（2）を保存する。pinned テストは無い。normal 化として許容範囲。
- [Risk] `--merge-wait-ms` を誤って strict integer 化して挙動 regression → **Mitigation**: D2 で「lenient 維持」を明記し `ponytail:` コメントで固定。tasks に「strict 化禁止」を明記。
- [Risk] 列挙 API 移行で hint 実在検査が alias を「未登録」と誤判定 → **Mitigation**: hint 検査は `includeAliases:true` を使う。`run` を alias として実在扱いする契約をテストで固定。
- [Risk] 構造結合テスト（27 ファイル中の内部構造 import）の移行漏れで typecheck 赤 → **Mitigation**: tasks に移行対象を列挙し、behavioral / content assertion は無改変・構造参照のみ書換の原則を明記。
- [Trade-off] top-level help のグループ見出しはなお静的 scaffolding として残る（完全機械生成しない）。pinned 文言保持を優先した意図的な最小化であり、drift 対象（コマンド一覧）は spec 反復で排除済み。

## Open Questions

（現時点で設計を止める未解決点は無い。以下は実装裁量として明示的に委ねる項目）

- `defineCommands({...})` + handlers map 分離を採るか、handler をノードに inline するか。どちらでも可。制約は「handler 本体を command-registry.ts に留める」のみ。
- top-level help のグループ定義（見出し→spec 群の対応）を独立データとして持つか、各 spec に `group` メタを持たせて反復時に束ねるか。pinned 見出し文言を保てればどちらでも可。
