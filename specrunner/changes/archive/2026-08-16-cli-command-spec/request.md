# CLI command interface の正本化: CommandSpec から parser / help / dispatch を導出する

## Meta

- **type**: new-feature
- **slug**: cli-command-spec
- **base-branch**: main
- **adr**: true

## 背景

現在の CLI は `command-registry.ts` に一定の構造化情報(flags / positional / usage / requiresRepo / handler)を持っているが、CLI 契約全体の正本にはなっていない。top-level help・command help・alias・deprecated syntax・repo guard・worktree guard・可視性・コマンド実在判定・特殊 subcommand が別々の場所で手書き管理されており、実際に以下の drift / 重複が存在する:

- `run` は `job start` の promoted shortcut なのに alias として機械表現されず、独立エントリになっている
- `doctor repair` が registry 外の inline 分岐で、command path として存在しない
- `job` は全体として repo-owned なのに leaf ごとに `requiresRepo` がばらつき、持たない leaf は handler 側が個別フォールバックする
- deprecated flag の help 非表示が手書き省略で担保されている
- top-level USAGE の手書き一覧が実コマンドと drift し得る(部分的な toContain テストでのみ固定)
- 数値・slug 等の型検証を handler が個別に再実装している
- dispatch が subcommand 経路と normal 経路で二重実装され、エラー処理が経路により異なる

目的は、CLI の公開契約を `CommandSpec` に集約し、そこから parsing / dispatch / help(leaf・parent・top-level)/ alias / deprecated 互換面 / repo requirement / visibility / コマンド実在判定を機械的に導出できるようにすること。コマンドを整理する変更ではなく、**「何が CLI なのか」をコード上で一意に定義できるようにする変更**である。原則として既存コマンドの意味・挙動は変更しない。

## 現状コードの前提

- `src/cli/command-registry.ts:52-72` — `CommandDef` / `ParentCommandDef` / `CommandEntry`。2 階層固定で、default action + children(doctor 型)を表現できない
- `src/cli/command-registry.ts:74-122` — top-level `USAGE` は手書き一覧。実コマンドとの整合は `src/cli/__tests__/detach-output-contract.test.ts` と `src/cli/__tests__/login.test.ts`(TC-001)の toContain / not.toContain で部分固定されるのみ
- `src/cli/command-registry.ts:522-527` — `run` は独立 top-level エントリ。`RUN_JOB_FLAGS` / `runJobHandler` の共有とコメント「Alias: job start」のみで alias 関係の機械表現は無い
- `bin/specrunner.ts:124` — top-level worktree guard は `WORKTREE_GUARDED_COMMANDS = new Set(["run"])` の手書き。直上コメントは廃止済み `job finish` に言及したまま残っている(drift の実例)
- `bin/specrunner.ts:47-119` と `bin/specrunner.ts:122-188` — subcommand 経路と normal 経路で help pre-scan / worktree guard / parseFlags / context 構築 / requiresRepo 検査 / エラー処理が二重実装。subcommand 経路の catch には `SpecRunnerError` 分岐が無く、同じ例外が経路により Error/Hint/exitCode 表示(normal)と Fatal 表示(subcommand)に分かれる
- `src/cli/command-registry.ts:1087-1100` — `doctor repair` は doctor handler 内の `positionals[0] === "repair"` inline 分岐。doctor 本体は repo optional、repair は handler 内で repo を要求する
- `requiresRepo` は leaf ごとの手書き(command-registry.ts:472, 536, 672, 855, 932, 957, 998)。`job start` / `job ls` / `job show` / `job wait` は持たず、handler 側が `ctx?.repoRoot ?? invokerCwd` / `process.cwd()` で個別フォールバックする
- `src/cli/command-registry.ts:456,901,1003` — `--issue` / merge-wait-ms / limit の数値検証を handler が個別実装。slug 検証も handler 内 `SLUG_REGEX.test`(例: command-registry.ts:576)
- `src/cli/flag-parser.ts:6-12` — `FlagDef` は `type: "boolean" | "string"` + `values` enum + `deprecated`(message は per-value 関数可)。deprecated の help 非表示は `LOGIN_USAGE` の手書き省略で担保
- worktree guard の subcommand 側は parent 単位の `guardedSubcommands` Set(command-registry.ts:595, 987)で、bin 側の top-level Set と二重管理

## 要件

1. **CommandSpec 型と registry** — CLI 公開契約を単一の `CommandSpec` に集約する。概念的には:

   ```ts
   type CommandSpec = {
     path: string[];              // 例: ["job", "resume"], ["credentials", "set"]
     summary: string;
     args?: ArgSpec[];            // typed positional (string / integer / enum / slug / step 等)
     flags?: Record<string, FlagSpec>;
     requiresRepo?: boolean;      // parent から継承、child で override 可
     worktreeGuard?: boolean;
     visibility?: "normal" | "operator" | "maintenance" | "repair" | "compatibility";
     aliasOf?: string[];          // 例: run → ["job", "start"]
     deprecated?: DeprecatedSpec;
     help?: CommandHelp;
     handler: CommandHandler;
   };
   ```

   metadata と handler の分離(`defineCommands({...})` + handlers map)は設計裁量。class hierarchy は作らない。既存の 2 階層固定を廃し、default action + children(`doctor` = default action diagnose、`doctor repair` = child)を表現できること
2. **parser / dispatch の CommandSpec 由来化** — subcommand / normal の二重 dispatch を単一 flow に統一する。integer / enum / slug 等、**既存契約と等価に表現可能な値**の型検証を spec 宣言から parser 層で行い、handler 内の重複 validation(`Number` / `parseInt` / `SLUG_REGEX`)を除去する。複合参照の positional(`run` の slug|file、`request validate` の file|slug、`job show` の jobId|slug、`job resume` の slug|short jobId prefix)は専用の domain validator または string のまま保持できること。**CommandSpec 導入を理由に既存の入力 domain を狭めない**(env var の解釈は flag ではないため対象外)
3. **alias の機械表現** — `run` を `aliasOf: ["job", "start"]` で表現し、flags / worktree guard / requiresRepo / help が target の spec から解決されること(独立エントリの二重定義を廃す)
4. **requiresRepo の継承と override** — CommandSpec は parent から child への継承と child override を表現できること。継承機構そのものはテスト用 spec で固定する。実物では `doctor`(repo optional)と `doctor repair`(repo required)の override を使う。本 request では既存コマンドの repo requirement を意味的に変更せず、現行 leaf の要求をそのまま移植する(`job start` / `job ls` / `job show` / `job wait` 等が requiresRepo を持たない現状も保存する。`job` 全体を repo-required へ強化する変更はスコープ外)
5. **worktree guard の宣言一元化** — parent 単位の `guardedSubcommands` Set と bin 側の手書き top-level Set を廃し、spec の宣言から guard を導出する
6. **visibility と deprecated 互換面** — visibility を metadata として保持する(本 request では help の表示グルーピングまでは要求しない。列挙 API で filter 可能であればよい)。deprecated flag は通常 help に表示しない
7. **help の導出** — leaf `--help` / parent `--help` / top-level `--help` を CommandSpec から生成し、手書き `USAGE` 一覧を廃止または最小化する。既存テストが pin している help 内容(`--detach` の説明・`job wait` 誘導・`--provider` 非表示等)は spec 側の文言として保持し、生成後の help に対して同一 assertion が成立すること(定数廃止に伴うテストの参照先書き換えは可、assertion の弱体化は不可)
8. **コマンド実在判定 API** — 全 public command path を registry から列挙する API を公開し、hint / ガイド系の「案内するコマンドが実在するか」検証がこの API を使えるようにする。列挙 API は canonical path と alias を区別できること(canonical のみの列挙 / alias を含む列挙 / alias 入力から canonical と invokedAs を返す解決。`run` が「実在しない」ことも「`job start` と別 command として数えられる」ことも無いようにする)
9. **挙動保存契約** — 既存コマンドの意味・exit code・出力仕様を変更しない。唯一の例外として、dispatch 統一に伴い subcommand 経路の `SpecRunnerError` が normal 経路と同じ Error/Hint/exitCode 表示に正規化されることは許容する(現状の経路差は accidental drift であり、Fatal 表示への縮退はバグに準ずるため)

## スコープ外

- `specrunner guide` サブコマンドと guide 本文(CommandSpec 移行後の別 request)
- コマンドの大規模な rename / remove
- repoRoot debt の全面修正(handler 内の個別フォールバック挙動は現状維持)
- inbox の exit propagation 修正
- login の config 副作用除去
- doctor hint の内容改善
- rules / reviewers の仕様変更
- runtime reset の semantics 変更
- 個別コマンドの UX 改善
- repo requirement の意味的変更(`job` 配下を一括 repo-required 化する等の強化は CLI surface cleanup の別 request で扱う)
- handler の application operation 層への全面移行(terminal 依存除去は将来の別 request。CommandSpec は CLI Adapter の契約であり、境界だけを固定する)
- visibility に基づく help の表示グルーピング・出し分け

## 受け入れ基準

- [ ] 全 public command path が registry の列挙 API から取得でき、列挙が canonical と alias を区別できる(canonical のみ / alias 含む / alias → canonical + invokedAs の解決)ことをテストで固定する(手書き一覧との突合ではなく spec を正本とする)
- [ ] `run` が `job start` の alias として解決され、flags / worktree guard / requiresRepo が target と同一に働くことをテストで固定する
- [ ] `doctor`(default action)と `doctor repair <slug>` が command path として表現され、doctor は repo 外で実行可・repair は repo 必須であることをテストで固定する
- [ ] `requiresRepo` の parent 継承と child override の機構をテスト用 spec で固定し、かつ全 public command の repo requirement が移行前と意味的に同一であることをテストで固定する
- [ ] worktree guard が spec 宣言から導出され、`bin/specrunner.ts` の手書き Set と registry の `guardedSubcommands` が存在しないこと
- [ ] deprecated flag(`login --provider`)が通常 help に出ず、既存の移行エラーメッセージ挙動が保たれることをテストで固定する
- [ ] top-level / parent / leaf の help が CommandSpec から生成され、help 内容を pin する既存テスト(`src/cli/__tests__/detach-output-contract.test.ts` / `src/cli/__tests__/login.test.ts`)の assertion 内容が全て生成後の help に対して green であること(`USAGE` / `LOGIN_USAGE` 定数の廃止に伴う参照先の書き換えは許容するが、assertion の削除・弱体化は不可)
- [ ] dispatch が単一 flow に統一され、`SpecRunnerError` が subcommand / normal どちらの経路でも Error/Hint/exitCode 表示になることをテストで固定する
- [ ] 要件 9 の正規化を除き、既存の behavioral / output contract テスト(exit code・stdout/stderr・コマンド挙動・help 内容を検証するもの)が無改変で green であること(挙動保存)。旧 registry の内部構造そのもの(`COMMANDS` の形・`USAGE` 定数の直接 import 等)を検査するテストは、新しい CommandSpec 正本を検査する形への移行を許容する
- [ ] `typecheck && test` が green

## 分割検討済み

土台(CommandSpec 型 + parser / dispatch 由来化)→ 上物(help / alias / deprecated / guard の導出と旧 USAGE 削除)の 2 request 分割を検討したが、1 request とする。分割すると中間状態の main に「手書き USAGE と CommandSpec の二重正本」が残り、本 request の解消対象そのものが増えるため。段階移行(型導入 → parser / dispatch → help / alias / deprecated / guard 導出 → 旧 USAGE・特殊分岐・重複 metadata 削除)は PR 内の実装順序として維持し、各段階で既存テスト green を保つ。

## architect 評価済みの設計判断

- **正本の一意化が目的であり、class hierarchy は不採用** — 多態は不要。plain object の spec と、必要なら handlers map の分離まで
- **help 生成と既存 pin テストの両立** — 生成に寄せても、既存テストが要求する文言(`--detach` 説明・`job wait` 誘導等)は spec の summary / help 文言として保持し、同一 assertion を生成 help に対して維持する。文言が保持できない生成形式は不採用
- **既存テストの扱いは契約種別で分ける** — behavioral / output contract テスト(exit code・stdout/stderr・コマンド挙動)は無改変で green。旧実装構造(`COMMANDS` の形・`USAGE` 定数)に結合したテストのみ、新正本を検査する形への移行を許容する。完全無改変を要求すると旧構造の互換 shim を残す誘因になるため(却下理由: shim は二重正本の温存)
- **入力 domain は狭めない** — 複合参照 positional(slug|file / jobId|slug 等)の「正しい validation 化」は本 request でやらない。CLI surface cleanup と混ざるため
- **型検証は parser 層、env var は対象外** — `SPECRUNNER_*` 環境変数の parseInt は flag parsing の契約外であり、handler / util 側に残す
- **alias は解決であって複製ではない** — `run` の spec は target への参照のみを持ち、flags / guard を再宣言しない(drift の構造的排除)
- **visibility は今回 metadata 保持まで** — help の出し分けは列挙 API の filter で将来実装できる。今回入れると help 出力が既存 pin テストと衝突するため見送り(却下理由: 挙動保存契約との衝突)
