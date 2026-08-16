# ADR-20260816: CommandSpec を CLI 公開契約の単一正本にし、parser / dispatch / help を機械導出する

> 本 ADR は `cli-command-spec` request の設計判断を記録する。`2026-05-20-cli-noun-verb-restructure.md` が導入した `guardedSubcommands` Set と `WORKTREE_GUARDED_COMMANDS` Set による二重管理を廃止し、spec 宣言からの導出に一本化する。

## ステータス

accepted

related: `specrunner/adr/2026-05-20-cli-noun-verb-restructure.md`（noun-verb 体系確立 / guardedSubcommands 導入の旧 ADR）

## コンテキスト

noun-verb 体系（ADR-20260520）の確立後も、CLI 契約の情報は 3 箇所に分散して手書き管理されていた:

- `src/cli/command-registry.ts` — `CommandDef`(leaf) / `ParentCommandDef`(2 階層固定)。flags / positional / usage / requiresRepo / handler と、parent 単位の `guardedSubcommands` Set、top-level `USAGE` 手書き一覧、各コマンド専用の `*_USAGE` 定数。
- `bin/specrunner.ts` — `"subcommands" in entry` で subcommand 経路と normal 経路に分岐し、help pre-scan / worktree guard / parseFlags / context 構築 / requiresRepo 検査 / エラー処理を二重実装。top-level worktree guard は `WORKTREE_GUARDED_COMMANDS = new Set(["run"])` の手書き（廃止済み `job finish` への drift コメントが残っていた）。
- `src/cli/flag-parser.ts` — `FlagDef`(boolean | string + enum + deprecated)。

この分散が生む構造的 drift:
1. `run` は `job start` の promoted shortcut だが alias 関係が機械的に表現されず、`RUN_JOB_FLAGS`/`runJobHandler` の共有とコメントのみ。
2. `doctor repair` は `positionals[0] === "repair"` の inline 分岐で command path として存在しない。
3. `requiresRepo` は leaf ごと手書き。`job start/ls/show/wait` は持たず handler が個別フォールバック。
4. deprecated flag(`login --provider`)の help 非表示は `LOGIN_USAGE` の手書き省略で担保。
5. top-level `USAGE` 一覧は実コマンドと drift し得る（部分的 `toContain` テストでのみ固定）。
6. `--issue`/`--merge-wait-ms`/`--limit` の数値検証と slug 検証を handler が個別実装。
7. subcommand 経路の catch に `SpecRunnerError` 分岐が無く、同じ例外が経路により `Error/Hint/exitCode`(normal) と `Fatal`(subcommand) に分かれる。

**既存の機械的歯（制約として確認済み）**:
- `src/cli/command-registry.ts` は B-18 import 境界テスト（LLM 系 port/adapter を import 不可）と CWD allowlist ratchet（`src/` の全 `process.cwd()` が allowlist で被覆）に縛られる。handler 本体（`process.cwd()` を持つコード）を別ファイルへ移設すると両検査が壊れる。
- pinned help 内容は `toContain` / `not.toContain` / regex による部分文字列固定（`detach-output-contract` / `login` / `resume-help` / `help-flag-dispatch` / `prune-usage` / `doctor-help` / `help-output-tc`）。

## 決定

### D1: CommandSpec を plain-object の再帰ツリーとして定義する。class hierarchy は作らない

**決定**: CLI 契約を `CommandSpec` の再帰ツリーとして表現する:

```ts
type CommandSpec = {
  path: string[];              // canonical path, 例 ["job","resume"]
  summary: string;
  args?: ArgSpec[];            // typed positional
  flags?: Record<string, FlagSpec>;
  requiresRepo?: boolean;      // 省略時は parent から継承
  worktreeGuard?: boolean;     // 省略時 false
  visibility?: "normal" | "operator" | "maintenance" | "repair" | "compatibility";
  aliasOf?: string[];          // 指定時、flags/args/guard/requiresRepo/help を target から解決
  deprecated?: DeprecatedSpec;
  help?: CommandHelp;
  handler?: CommandHandler;    // default action。pure parent は持たない
  children?: Record<string, CommandSpec>;
};
```

2 階層固定（`CommandDef` / `ParentCommandDef`）を廃止。ノードは handler（default action）と children を同時に持てる。handler 本体は `src/cli/command-registry.ts` に留める（Context の B-18 / CWD allowlist 制約）。

**Rationale**: 多態は不要。正本の一意化が目的であり、plain object の木が列挙・導出（parser/help/guard の機械生成）に最も素直。木構造なら 2 階層固定を撤廃でき、`doctor`(handler=diagnose)+`doctor.children.repair` を追加構造なしで表現できる。

**却下案**: class 階層 + メソッド override — 多態不要、正本の分散を増やす。`CommandDef | ParentCommandDef` を維持 + `doctor repair` を inline のまま — 正本一意化という目的を満たさない。

### D2: 型検証は parser 層。ただし「既存契約と等価に表現可能な値」に限る

**決定**: `FlagSpec` / `ArgSpec` に型を宣言し、parser が既存挙動と等価な場合に限り検証する。

- `--issue`（現行: `Number → isInteger && n>0`、不正 exit 2）→ `integer`(min 1) FlagSpec。等価。
- `--limit`（現行: `Number → isInteger && n>=0`、不正 exit 2）→ `integer`(min 0) FlagSpec。等価。
- enum flag（`--runtime`/`--provider`/`--status`/`--from`）→ `values` を FlagSpec に移送。parser が既存と同じ enum 検証。
- **`--merge-wait-ms` は parser 型検証にしない**。現行は不正値を無視して続行する lenient 契約であり、strict integer（不正 → exit 2）と**等価でない**。string flag のまま handler 内 domain parse を維持。`ponytail:` コメントで「lenient 契約・behavior preservation」を明示。
- 複合参照 positional（`run` の slug|file / `job show` の jobId|slug 等）は string または専用 domain validator で保持（入力 domain を狭めない）。
- `ParsedArgs.flags` の値型を `string | boolean` → `string | number | boolean` に拡張。

**Rationale**: 「型検証を parser へ寄せる」目的と「入力 domain を狭めない / 挙動を保存する」制約の両立点は「等価に表現可能な値だけ移送」。lenient / composite は等価でないため handler に残すのが正しい。

**却下案**: `--merge-wait-ms` を strict integer 化 — 不正値で exit 2 になり挙動 regression。却下。複合 positional の「正しい validation 化」— CLI surface cleanup と混ざる。却下。

### D3: alias は「解決」であって「複製」ではない

**決定**: `run` の spec は `{ path:["run"], aliasOf:["job","start"], summary, help, visibility:"compatibility" }` のみを持つ。flags / args / worktreeGuard / requiresRepo は resolve 時に target(`job start`)から解決する。`RUN_JOB_FLAGS` の二重宣言と独立エントリを廃止。

**Rationale**: alias を複製で表すと drift の温床（現状そのもの）。参照解決に一元化すれば flags/guard の再宣言が構造的に不可能になる。

**却下案**: `run` を `job start` と同一 flags を再宣言した独立 spec にする — drift を残す。却下。

### D4: requiresRepo は parent 継承 + child override

**決定**: 実効 requiresRepo は「root からノードを辿り、明示された最も近い値を採用（child override が勝つ）」。`doctor`(false) と `doctor.children.repair`(true) にこの機構を使う。`job` parent には `requiresRepo` を設定しない（未指定=false）。これにより `job start/ls/show/wait` は現状どおり repo-optional のまま。継承機構はテスト専用の小さな spec fixture（parent true → childA 継承 / childB override false）で固定する。

**Rationale**: `job` を repo-required へ強化するのはスコープ外。継承機構は doctor で実使用しつつ、汎用性は test fixture で保証する。

**却下案**: `job` parent に requiresRepo:true を置く — `job start/ls/show/wait` を repo-required に変え挙動 regression。却下。

### D5: worktree guard は spec 宣言から導出。手書き Set を全廃

**決定**: 各 leaf に `worktreeGuard?: boolean` を宣言。dispatch は resolve 済み spec（alias は target）の `worktreeGuard` を見て guard を実行する。`guardedSubcommands`(job / inbox) と `WORKTREE_GUARDED_COMMANDS`(bin) と drift コメントを削除する。

guard=true 対象: `job start` / `job resume` / `job attach` / `job archive` / `job prune` / `job reopen` / `inbox run`。`run` は alias 解決で `job start` の guard を引き継ぐ。現状の guarded 集合を逐語移植（`job stats` は guard 対象外のまま等）。

**Rationale**: guard を宣言に一元化すれば top-level / subcommand の二重管理と drift（廃止 `job finish` コメント）が消える。

**却下案**: guard を親 spec に集約 Set として残す — 宣言の分散が消えず drift 源が残る。却下。

### D6: dispatch を単一 flow に統一し、SpecRunnerError を両経路で正規化する

**決定**: `bin/specrunner.ts` を薄い entry にし、resolve → help pre-scan → worktree guard → parseFlags → buildCommandContext → requiresRepo 検査 → handler 実行 → 統一 catch の**単一パイプライン**（`src/cli` 側の dispatch 関数）に委譲する。

- 順序は現行 normal 経路を踏襲（help 最優先 → guard → parse → context → repo 検査 → handler）。
- catch は FlagParseError（exit 2 + usage）/ `SpecRunnerError`（`Error: {message}` / `Hint: {hint}` / `exit {exitCode}`）/ その他（`Fatal:` + exit 1）を**両経路共通**で扱う。
- 唯一の許容 behavior 変更: subcommand 経路の `SpecRunnerError` が `Fatal` 縮退から `Error/Hint/exitCode` へ正規化される（現状の経路差は accidental drift であり、Fatal 縮退はバグに準ずる）。
- handler+children ノード（`doctor` 等）の dispatch fallback: `args[1]` が既知 child キーに一致 → child を解決。一致しない / 存在しない → ノード自体を解決し `restArgs` に残りを渡す（unknown-subcommand を返さない）。「children を持ち handler を持たない pure parent」のみ unknown-subcommand を返す。

**Rationale**: 二重実装がエラー処理の経路差（accidental drift）を生んでいた。単一 flow が根本解。順序を normal 経路に合わせるのは、pinned な help 最優先・guard-before-parse の挙動を保つため。

**却下案**: 経路は 2 つ残し catch だけ揃える — 二重実装という根本原因が残り再 drift する。却下。

### D7: help は spec が持つ文言を組み立てて生成する（手書き一覧を廃止）

**決定**: `CommandHelp` に権威ある文言を載せ、renderer がそれを組み立てる。

- **leaf `--help`**: `spec.help.detail`（各コマンドの `*_USAGE` 定数を逐語移送）があればそれを出力。無ければ summary + 非 deprecated flags + args から最小生成。
- **parent `--help`**: parent の help 本文または `Usage: specrunner <cmd> <sub1|sub2>` を生成。
- **top-level `--help`**: registry の spec を宣言順のグループで反復して一覧行を生成。グループ見出し（`Request commands` / `Job commands` / `Environment commands` 等）と `Options:` footer は静的 scaffolding。Aliases セクションは `aliasOf` を持つ spec のみを反復。
- **anti-drift**: 一覧が spec 反復で生成されるため、コマンド追加/削除が自動反映され手書き一覧との drift が消える。
- **deprecated flag 非表示**: 生成 help は `deprecated` 宣言の flag を列挙しない（`login --provider` は help に出ない）。移行エラー文言（parser throw）は不変。
- **文言保持**: pinned な部分文字列（`--detach` 説明 / `job wait` 誘導 / `--from`・`--apply-canon`・`Mutually exclusive`・`Valid steps:`・`composite step` / `job prune` 行の worktree+sidecar / グループ見出し / Aliases に `run` のみ 等）は spec 文言として逐語保持し、生成後 help に対して同一 assertion を green に保つ。

**Rationale**: 「生成に寄せる」目的（drift 排除）と「pinned 文言保持」制約の両立点は、**文言は spec に持たせ、組み立てだけ生成**する形。文言を完全機械生成する形式は pinned assertion を壊すため不採用。

**却下案**: help を summary/flags から完全機械生成 — `Mutually exclusive` 節・step 列挙など pinned 文言が再現できず assertion 破壊。却下。

### D8: コマンド実在判定 API（listCommandPaths + resolveCommand）

**決定**: registry から以下を公開する。

- `listCommandPaths(opts?: { includeAliases?: boolean }): string[][]` — canonical path 列挙。`includeAliases: true` で alias path（`["run"]`）を含める。
- `resolveCommand(tokens: string[]): { spec, canonicalPath, invokedAs, restArgs } | { kind: "unknown-command" | "unknown-subcommand" | "needs-subcommand", ... }` — token を辿り children を解決、`aliasOf` は canonical target へ解決し `invokedAs`（入力どおり `["run"]`）と `canonicalPath`（`["job","start"]`）を分離して返す。

**canonical / alias の区別契約**:
- `run` は `listCommandPaths({ includeAliases: true })` に alias として現れ、`listCommandPaths()`（canonical のみ）には現れない。
- hint / guide 実在検査は `listCommandPaths({ includeAliases: true })` を使い、`run` を参照する案内を実在扱いとする。

**Rationale**: 実在判定を spec 由来 API に一元化すれば「案内するコマンドが実在するか」を単一正本で検査できる。`Object.keys(COMMANDS)` の 2 階層固定では children の再帰列挙も alias 区別も表現できない。

**却下案**: `Object.keys(COMMANDS)` を維持 — 2 階層固定に縛られ alias の区別も表現できない。却下。

## 却下した代替案（全体方針）

### 案 A: 土台 request（CommandSpec 型 + parser/dispatch 由来化）と上物 request（help/alias/deprecated/guard 導出 + 旧 USAGE 削除）に 2 分割する

- **Pros**: 各 PR が小さく、中間レビューが入りやすい。土台だけ merge した状態でも型安全なベースラインが得られる。
- **Cons**: 中間状態の main に「手書き `USAGE` と `CommandSpec` の二重正本」が共存する。本 request の解消対象そのものが増え、次の上物 request の出発点が悪化する。`commandSpec` 導入済みなのに `USAGE` 定数と並走するコードが一時的にコードベースに定着し、ツールやレビューの混乱源になる。
- **Why not**: 分割のコスト（二重正本の温存）が分割の便益（PR サイズ）を上回る。中間状態を作ることで本 request の問題領域を自ら拡大するため。request.md「分割検討済み」と design.md D9 で architect 評価済みに却下。

### 案 B: CommandSpec を class hierarchy で表現する（CommandNode 基底クラス + LeafCommand / ParentCommand サブクラス）

- **Pros**: 型が命名で自己文書化される。型ごとのメソッド追加が将来容易になる。TypeScript の型システムで leaf / parent の識別が discriminated union なしで行える。
- **Cons**: 多態が不要な場面で class を導入すると、列挙・導出（parser/help/guard の機械生成）に対して `instanceof` チェックか型ガードが散らばる。正本の一意化という目的に対して抽象レイヤが 1 枚余分になる。handler / help / children を同じノードが持てる「default action + children」型（doctor）を表現するためにさらに深い継承か mixin が必要になる。
- **Why not**: 多態が必要な場面が現時点で存在しない（YAGNI）。plain object の再帰ツリーで全要件を満たせるため、class 導入は複雑性コストのみを払う。request.md「正本の一意化が目的であり、class hierarchy は不採用」で architect 評価済みに却下。

## 影響

### Positive

- CLI 公開契約が `CommandSpec` に一意に定義され、コマンド追加がすべて spec 追加で完結する
- top-level help の手書き一覧が spec 反復で自動生成されるため、コマンド追加/削除が一覧に自動反映される
- `guardedSubcommands` Set と `WORKTREE_GUARDED_COMMANDS` Set の二重管理が消え、guard の drift・コメント drift が構造的に排除される
- `run` の alias 関係が宣言に落ちることで、flag/guard の二重定義が構造的に不可能になる
- `SpecRunnerError` が subcommand 経路でも `Error/Hint/exitCode` 表示に正規化される（accidental drift の修正）
- `listCommandPaths` / `resolveCommand` で hint・guide 系の実在検査が spec 正本に統一される

### Negative

- subcommand 経路の `SpecRunnerError` 表示が `Fatal` から `Error/Hint/exitCode` に変わる（意図的な正規化、既存テストの pin なし）
- `--issue`・`--limit` の不正値が parse 時点で exit 2 になる（現行は handler 内で同じ exit 2 になるが評価タイミングが変わる。既存 pin テストなし、exit code は等価）

### Known Debt / Deferred

- `--merge-wait-ms` の lenient（不正値無視）契約は handler に残る。`ponytail:` コメントで明示。strict 化は別 request で CLI surface cleanup と併せて判断する
- 複合参照 positional（slug|file / jobId|slug 等）の validation 強化はスコープ外。handler / domain validator に残る
- `job` 配下を一括 repo-required 化する強化は別 request（CLI surface cleanup）で扱う
- visibility に基づく help の表示グルーピング・出し分けは metadata 保持のみ。列挙 API の filter で将来実装できる
- `specrunner guide` サブコマンドと guide 本文は CommandSpec 移行後の別 request で追加する

## 参照

- Request: `specrunner/changes/cli-command-spec/request.md`
- Design: `specrunner/changes/cli-command-spec/design.md`
- Spec: `specrunner/changes/cli-command-spec/spec.md`
- Implementation: `src/cli/command-registry.ts`（CommandSpec 型・COMMANDS registry・resolveCommand・listCommandPaths・help 生成）・`bin/specrunner.ts`（単一 dispatch flow）・`src/cli/flag-parser.ts`（integer 型・deprecated）
- Related: `specrunner/adr/2026-05-20-cli-noun-verb-restructure.md`（noun-verb 体系確立・guardedSubcommands 導入の旧 ADR。本 ADR は guardedSubcommands を廃止し spec 宣言に一元化する）
