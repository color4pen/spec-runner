# Design: agent の git 状態変更とスコープ外書込を permission 層で遮断する

## Context

local runtime（Claude Agent SDK）の各 agent step は、実行中に Bash tool 経由で git の全能力を持ち、
かつ worktree 全域への Write / Edit を許されている。commit 層（pipeline-sole-committer）は
「mixed reset で agent 自己 commit を巻き戻し、pipeline が合成 commit を作り、単一 egress で照合する」
という **事後の壁** を敷くが、agent は step 実行中は依然として自由に git 状態を変更でき、宣言範囲外の
ファイルや正典・state を書き換えられる。この結果:

- agent の自己 commit → mixed reset → 再合成という無駄なサイクルが常態化している。
- 改変された正典 / state を後段 step が読む前に止める「最速の防御線」が tool call 時点に存在しない。
- egress 台帳の正である `state.json` が agent 可書きのまま残る。

合成モデルの成立により、**agent が git 状態を変更する正当用途は存在しない**（commit は pipeline が合成する）。
また各 step の書込範囲は `writes()` で宣言済みである。本変更はこの 2 つの事実を tool permission 層
（`canUseTool`）で実行時に強制し、攻撃・事故の大半を tool call 時点で遮断する **多重防御** を追加する。
これは壁の置き換えではない — 壁は commit 層の合成 + egress のままであり、本変更はサイクルを短縮し防御を
多層化するものである。回避不能性は主張しない（inspection モデルの轍を踏まない）。shell 経由の回避
（変数展開・リダイレクトによる書込等）は残余として明記し、commit 層が引き続き受け止める。

### 現状コード（検証済みの前提）

- `src/adapter/claude-code/agent-runner.ts:443-446` — `allowedTools = ["Read","Bash","Grep","Glob"]`
  （+ 条件付き report MCP tool）。Bash は pre-approve され、`canUseTool` を素通りする。
- `src/adapter/claude-code/agent-runner.ts:121-150` — `createWorkspaceToolGuard(cwd)` は Edit / Write のみ
  対象とし cwd 境界だけを deny。宣言 writes・保護正典・pipeline 管理パスの知識を持たない。それ以外の
  tool は終端で `{ behavior: "allow", updatedInput: input }`。
- `src/adapter/claude-code/agent-runner.ts:94-104` — `buildWorkspaceSandbox`: `failIfUnavailable:false`、
  `autoAllowBashIfSandboxed:true`、`allowUnsandboxedCommands:false`、`filesystem.allowWrite=[cwd, cwd/**]`。
- `src/core/port/agent-runner.ts:113-141` — `AgentRunContext` は宣言 writes / staging mode を運ぶ field を持たない。
- `src/core/step/step-context-builder.ts:130-157` — `AgentRunContext` 組み立て点。`step`・`state`・`deps`
  （`PipelineDeps extends StepContext = StepDeps`、`deps.slug` を含む）・`cwd` が揃い、
  `step.writes?.(state, deps)` と `stagingModeFor(step.name)` をここで計算できる。
- `src/core/step/write-scope.ts` — leaf module（`util/paths` のみ import）。再利用可能な純関数:
  `stagingModeFor`(:51)、`protectedCanonPaths`(:64)、`forbiddenWritePaths`(:104)、`GUARDED_WRITE_STEPS`(:33)。
- `src/core/pipeline/round-git-scope.ts:104-106` — `pipelineManagedPaths(slug)` =
  `[state.json, events.jsonl, usage.json, bite-evidence-result.md]`。すべて worktree 相対。
- `src/core/step/commit-push.ts:449-450 / 543-544` — 宣言 write パスの解決形は
  `step.writes?.(state, deps) ?? []` を `r.artifact !== "gitState"` で絞り `r.path` を取る。本変更もこの式に一致させる。
- 宣言 writes と実 agent 出力の一致（確認済み）: scoped step は自 result / 出力ファイルを `writes()` に宣言する
  （spec-review→result md、design→design.md/tasks.md/spec.md、request-review→result+attestation、
  spec-fixer / test-case-gen / conformance / pr-create / custom-reviewer / regression-gate も同様）。
  scoped 合成は宣言パスしか stage しないため、この一致は既存の不変条件。guard が宣言集合を許可の全集合に
  しても正常系の出力は阻害されない。
- `scripts/probes/write-scope-guard-probe.ts` — 実 SDK に対する permission 挙動の正本 probe。現行は
  Write の in/out-of-workspace と report tool pre-approve の 3 シナリオ（Bash / git は未検証）。
- 実測済み SDK 挙動: `default` mode で allowedTools に無い tool は `canUseTool` が発火し、deny message は
  agent に届き再試行可能。allow は `{ behavior:"allow", updatedInput }` 必須（Zod union 制約）。
- `src/adapter/claude-code/query-one-shot.ts:136` / readiness probe — utility query は `bypassPermissions`
  （agent step の経路ではない、`canUseTool` を呼ばない）。
- `src/adapter/managed-agent/agent-runner.ts` — client 側 permission surface を持たない（tool permission は server 側）。

## Goals / Non-Goals

**Goals**:

- Bash を `canUseTool` 経路に載せ替え、全 agent step で git 状態変更コマンドを tool call 時点で deny する。
- Write / Edit を pipeline 管理パス（`state.json` 等）・`.specrunner/`・宣言外スコープ・保護正典について
  tool call 時点で deny する（step の staging mode に応じて scoped / guarded を分岐）。
- 許可規則の単一ソースを `write-scope.ts` に保ち、guard を既存純関数の再利用で構成する。
- commit 層（合成 + egress）・utility query・managed adapter・正常系 step の挙動を不変に保つ（多重防御の独立性）。
- 検出対象外の残余（shell 変数展開・リダイレクト書込・エディタ系書込・非 git 経由書込）を明文化し、
  commit 層が受け止めることを記す。

**Non-Goals**（request のスコープ外を踏襲）:

- managed runtime の tool permission（server 側。client 側 surface が存在しない）。
- Git / GitHub credential の権限分離（別 track）。
- sandbox の `failIfUnavailable:false`（非対応環境での黙示無効化）の見直し。
- Bash 経由の file 書込（リダイレクト・`sed -i` 等）の分類・遮断（残余として明記、commit 層が担当）。
- `state.json` の正本を agent 非可視領域へ移す構造変更（permission 層の遮断のみを行う）。

## Decisions

### D1: Bash を allowedTools から外し `canUseTool` に載せ替える（R1）

`baseAllowedTools` を `["Read","Grep","Glob"]` に変更（Bash 除去）。`permissionMode:"default"` により
allowedTools に無い Bash に対して `canUseTool` が発火する、という前提を **probe（R5-a）で実測確定してから**
guard の Bash 分岐を有効化する。SDK 挙動の断定は静的読解でなく probe を正とする。

**probe-gated な分岐（`autoAllowBashIfSandboxed` との相互作用）**: `buildWorkspaceSandbox` は現在
`autoAllowBashIfSandboxed:true` を設定している。この設定が sandbox 下の Bash を `canUseTool` より前に
auto-approve する場合、Bash 分岐は発火せず R1/R2 が成立しない。したがって probe R5-a は
「現行 sandbox 設定（`autoAllowBashIfSandboxed:true`）のまま Bash を allowedTools から外したとき、
`canUseTool` が Bash に発火するか」を最初に測る。結果で実装を確定する:

- **観測 A（発火する）**: sandbox 設定は不変のまま。Bash は `canUseTool` を通り、git 状態変更を deny、
  それ以外（テスト実行・読み取り git）は allow され sandbox 下で実行される。これが第一想定。
- **観測 B（auto-approve され発火しない）**: `autoAllowBashIfSandboxed` を `false` に変更し、Bash を
  `canUseTool` 経路に強制する。この場合 probe で追加確認する — 「allow した非 git Bash が引き続き実行
  されるか（sandbox 下 or prompt されず走るか）」。実行されることを確認できて初めて観測 B の設定を採用する。
  実行が確認できない場合は Open Questions に差し戻し、実装前に判断を仰ぐ（勝手にスコープを縮小しない）。

**Rationale**: 発火経路を実測済みの `canUseTool` 一本に揃えることで、判定ロジックを単一箇所（guard）に
集約できる。`autoAllowBashIfSandboxed` は request のスコープ外（sandbox `failIfUnavailable` 見直し）とは
別の設定であり、Bash を `canUseTool` に載せるために必要なら調整対象に含まれる。

**Alternatives considered**:
- *Bash 全面 deny* — 却下。判定系 step はテスト実行（`bun test` 等）・読み取り git を Bash で正当利用する。
- *allowedTools に Bash を残したまま SDK hooks で検査* — 却下。実測済みの「allowedTools は `canUseTool` を
  素通り」と矛盾する。

### D2: git 状態変更コマンドの保守的字句分類器（R2）

新規 leaf module `src/adapter/claude-code/git-command-classifier.ts` に純関数
`classifyGitCommand(command: string): GitCommandVerdict` を置く。`GitCommandVerdict` は
`{ kind: "mutation"; subcommand: string } | { kind: "read-or-nongit" }`。guard は `kind === "mutation"`
のとき deny、それ以外 allow。

**分類アルゴリズム（字句・保守的）**:

1. コマンド文字列を shell 接続子 `&&` `||` `|` `;` `&`・改行で **セグメント分割**し、各セグメントを個別判定する。
2. 各セグメントを空白でトークン化し、先頭の環境変数代入トークン（`VAR=value` 形）をスキップする。
3. 残った先頭トークンの basename が `git`（`git` / 末尾 `/git`、両端引用符除去後）でなければ
   そのセグメントは **非 git** として allow 相当。`git` がセグメント先頭でない位置に arg として現れる場合
   （例 `echo git commit`）は git 実行と見なさない（false positive 抑制）。
4. git 実行と判定したら、`git` の後ろの global option をスキップして最初の bare token を **subcommand** とする。
   値を取る global option（`-C` `-c` `--git-dir` `--work-tree` `--namespace` `--exec-path` の分離引数形）は
   直後トークンも 1 つスキップする。`--opt=value` 形は単一トークンとしてスキップ。
5. subcommand の分類:
   - **ALWAYS_MUTATING**（常に deny）: `commit` `commit-tree` `push` `add` `reset` `restore` `checkout`
     `switch` `clean` `merge` `rebase` `cherry-pick` `revert` `rm` `mv` `am` `apply` `pull` `update-ref`
     `update-index` `filter-branch` `fast-import` `gc` `prune`。
     （`switch`≈`checkout`、`revert`/`pull`/`gc`/`prune` は自明な変更操作。request の列挙 + 同型の変更操作を
     保守的に含める。「等」の範囲。）
   - **CONDITIONAL**（読み取り形は allow、変更形のみ deny）: `branch` `tag` `stash`。
     - `stash`: 直後の sub-action が `list` / `show` なら allow、それ以外（bare `git stash` / `push` / `pop` /
       `apply` / `drop` / `clear` / `save` / `create` / `store`）は deny。
     - `branch`: 変更フラグ（`-d` `-D` `--delete` `-m` `-M` `--move` `-c` `-C` `--copy` `-f` `--force`
       `-u` `--set-upstream-to` `--unset-upstream` `--edit-description`）を含む、または flag でない
       位置引数（= 作成対象名）を含むなら deny。読み取りフラグのみ / 引数なしは allow（一覧）。
     - `tag`: 変更フラグ（`-d` `--delete` `-a` `--annotate` `-s` `--sign` `-m` `--message` `-F` `-f`
       `--force`）を含む、または位置引数（= tag 名の作成）を含むなら deny。`-l` / `--list` / 引数なしは allow。
   - **READ_ONLY（閉集合 allowlist、allow）**: `status` `diff` `diff-tree` `diff-index` `log` `show`
     `show-ref` `rev-parse` `rev-list` `blame` `grep` `ls-files` `ls-tree` `ls-remote` `describe`
     `shortlog` `cat-file` `for-each-ref` `name-rev` `merge-base` `count-objects` `check-ignore`
     `check-attr` `var` `help` `version`。`remote` は CONDITIONAL（bare / `-v` / `show` / `get-url` のみ
     allow、`add` / `set-url` / `remove` 等は deny — set-url は後続の pipeline push の宛先を差し替え得る）。
   - **未知の git subcommand: deny（mutation 扱い）**。`config` / `worktree` / `submodule` / `notes` /
     `reflog` / `symbolic-ref` / alias 名を含む。

**Rationale**: 合成モデルの成立で agent の git 状態変更に正当用途が無いため、分類は step 別ではなく
「変更系 or それ以外」の 1 軸で済む。当初は未知 subcommand を allow に倒す blocklist を採用したが、
レビューで具体的反例が示された: `git config alias.p push`（config 未分類 → allow）→ `git p`（alias 未知 →
allow）の 2 手で**直 push（実 incident のベクター）**に到達し、sandbox は agent の git 書込を実測で止めない。
主脅威に対して fail-open になるため、READ_ONLY 閉集合 + 未知 deny の allowlist 方式へ反転した。
可用性の懸念（読み取り系の取りこぼし）は、deny message が読み取り系の許可を agent に伝えて再試行を誘導する
こと・取りこぼしは READ_ONLY への明示追加 1 行で解消することで受ける（閉集合に未知構文を許さない原則は
type-only 判定・write-scope と同型）。CONDITIONAL は request が明示した「branch の削除・移動」を尊重しつつ、
一覧（読み取り）の誤 deny を避けるための最小限の nuance。

**Alternatives considered**:
- *未知 subcommand を allow（blocklist 方式・当初採用）* — 反転済み。alias 定義（`config` 経由）で任意の
  変更系コマンドに未知名を付けられるため、blocklist は主脅威に対して構造的に fail-open。
- *config を CONDITIONAL にして読み取り形のみ allow* — 却下。alias / core.editor / hook 系など書込形の
  攻撃面が広く、agent に config の正当用途がない。全 deny が単純で安全。
- *shell を厳密にパースして変数展開・リダイレクトも解析* — 却下。permission 層は回避不能性を主張しない方針で、
  厳密パーサは複雑度と誤判定を招く。残余は commit 層が担当。

### D3: 書込スコープを `buildStepContext` で計算し `AgentRunContext` に threading（R3）

`AgentRunContext` に optional field を追加する:

```
interface AgentWriteScope {
  stepName: string;
  slug: string;
  declaredWritePaths: string[];        // worktree 相対、gitState 除外
  stagingMode: "scoped" | "guarded";
}
// AgentRunContext に:  writeScope?: AgentWriteScope;
```

`buildStepContext`（Step 7 組み立て）で計算して設定する:

- `declaredWritePaths = (step.writes?.(state, deps) ?? []).filter(r => r.artifact !== "gitState").map(r => r.path)`
  （`commit-push.ts:449-450` と同一式。単一ソース）。
- `stagingMode = stagingModeFor(step.name)`（`write-scope.ts`）。
- `stepName = step.name`、`slug = deps.slug`。

adapter（`agent-runner.ts`）は `ctx.writeScope` を guard factory に渡す。

**optional にする理由と本番保証**: `AgentRunContext` を literal 構築するサイト（adapter / 多数の test）が
存在するため、field を required にすると広範な churn を招く。本番の組み立て点は `buildStepContext` 唯一で、
そこで必ず `writeScope` を設定する。adapter は `writeScope` があれば scoped/guarded 規則を適用し、無ければ
cwd 境界のみへ **strictly weaker** に fallback する（非本番 / legacy ctx 用）。Bash の git 分類は
`writeScope` の有無に依存せず常時適用する（R2 は全 step 一律であり scope 情報を要さない）。
本番配線が緩む事故を防ぐため、`buildStepContext` が scoped / guarded 両方の step で `writeScope` を
正しく設定することをテストで固定する（D6）。

**Rationale**: 許可規則の計算を core の seam に集約し、adapter を runtime-neutral に保つ。guard は
`write-scope.ts` leaf の既存関数の再利用に徹し、許可規則の単一ソースを維持する。

**Alternatives considered**:
- *adapter 内で `step.writes` を再計算* — 却下。adapter が scope 意味論を知ることになり単一ソースが崩れる。
- *`writeScope` を required field 化* — 見送り（トレードオフ）。安全性は高いが 30+ サイトの churn を伴う。
  本番唯一の組み立て点 + テスト固定 + strictly-weaker fallback + Bash 常時適用で本番保証を確保する。

### D4: guard の Edit / Write 分岐を拡張（R3）

`createWorkspaceToolGuard(cwd, scope?)` に第 2 引数 `scope?: AgentWriteScope` を追加する。Edit / Write の
判定順:

1. `file_path` が非文字列 → allow（`updatedInput` パススルー、既存挙動）。
2. **cwd 境界**（既存・維持）: `path.resolve(cwd, file_path)` が cwd 外なら deny。
3. `scope` があるとき、cwd 相対パスを **posix 正規化**（`path.sep`→`/`）した `rel` で:
   - **全 step 共通 deny**: `rel ∈ pipelineManagedPaths(scope.slug)`、または `rel === ".specrunner"` /
     `rel` が `.specrunner/` 配下 → deny（`state.json` 等 egress 台帳 / machine-local sidecar の閉鎖）。
   - **scoped**（`stagingMode === "scoped"`）: `rel ∉ declaredWritePaths` → deny（宣言 = 許可の全集合）。
   - **guarded**（`stagingMode === "guarded"`）: `rel ∈ forbiddenWritePaths(stepName, slug, declaredWritePaths)`
     （保護正典 − 宣言）→ deny。それ以外の worktree 内書込は allow。
4. `scope` が無いとき（fallback）: cwd 内なら allow（既存挙動）。
5. deny message には対象パスと step の許可範囲の要約（scoped は宣言パス、guarded は「保護正典は書込不可」）を含める。
6. allow は必ず `{ behavior:"allow", updatedInput: input }` を返す（Zod union 制約、既存契約）。

`.specrunner` の判定は単一ソース化のため `util/paths.ts` に `dotSpecrunnerDirRel(): string`（`.specrunner`）を
追加して参照する（既存 `localSidecarBaseDirRel()` は `.specrunner/local` で範囲が狭いため別途用意）。

`pipelineManagedPaths` は `bite-evidence-result.md` を含むが、これを宣言する bite-evidence step は CLI step
（agent step でない）であり guard の対象外。したがって全 agent step で pipeline 管理パスを無条件 deny しても
正常系の宣言出力を阻害しない。

**Rationale**: 保護正典（design/spec/tasks/test-cases/request/attestation）は `forbiddenWritePaths` が、
egress 台帳 `state.json` 等は `pipelineManagedPaths` が既存単一ソース。guard はこれらを import して再利用する
（adapter→core は正方向 import）。

**Alternatives considered**:
- *guard で `isJudgeArtifact` を別途判定* — 不要。review step は自 result を `writes()` に宣言済みで、
  宣言集合（許可の全集合）で足りる。他 slug の judge artifact は宣言外 → 自然に deny。isJudgeArtifact は
  commit 層の関心として残す。

### D5: 挙動不変の境界（R4）

- commit 層（`commit-push.ts` の mixed reset + 合成 + write-scope 強制 + egress）は一切変更しない。
- utility query（`query-one-shot.ts` / readiness probe、`bypassPermissions`）と managed adapter は
  `canUseTool` を持たず対象外。
- 正常系の許可挙動（宣言内 Write/Edit、読み取り git、非 git Bash = テスト実行等）が変わらないことを
  テストで固定する。

### D6: probe 拡張と残余の明文化（R5）

`write-scope-guard-probe.ts` にシナリオを追加する（実 SDK 検証、機械 grep 可能な verdict 行）:

- **(a)** allowedTools から Bash を外したとき（現行 sandbox 設定）Bash に `canUseTool` が発火する
  （= D1 の観測 A/B を確定する gating シナリオ、最初に走らせる）。
- **(b)** `git commit`（および代表的な変更系）Bash が deny される。
- **(c)** 読み取り git（`git status` 等）Bash が allow される。
- **(d)** scoped step の宣言外 Write が deny される。
- **(e)** `state.json` への Write が deny される。

probe の 5 シナリオ verdict は design（本節の追記 or PR コメント）に実行記録として残す。

**probe 実装状況（permission-layer-git-write-denial）**:
シナリオ (a)〜(e) を `write-scope-guard-probe.ts` に追加実装した（`makeTrackedBashGuard` ヘルパー + 5 シナリオ）。
guard ロジックは単体テスト（classifier TC-001〜TC-009、guard TC-FW-04 拡張、buildStepContext TC-039〜TC-042）で
確定済みのため、probe はベルト・サスペンダーの実 SDK 検証として機能する。
**probe 実行記録(2026-07-23、実 SDK)**:

| シナリオ | 結果 | 観測 |
|---|---|---|
| (a) bash-canusetool-gate | PASS | **観測 B**: `autoAllowBashIfSandboxed: true` は Bash を canUseTool より先に auto-approve する(guard 不到達)。`false` では canUseTool が発火(gate-b PASS) |
| (b) bash-git-mutation-deny | PASS | `git commit` が canUseTool で deny される(`false` 設定下) |
| (c) bash-git-read-allow | PASS | route=**sdk-fast-path**: SDK は読み取り安全コマンド(`git status`)を canUseTool 前に auto-approve する。Bash tool_use はストリームで観測され正常実行。guard の read-allow 分岐は fast-path 不適用コマンド向けのベルト・サスペンダー |
| (d) scoped-write-deny | PASS | 宣言外 Write が deny |
| (e) state-json-deny | PASS | state.json Write が deny |

観測 B に基づき production の `buildWorkspaceSandbox` を `autoAllowBashIfSandboxed: false` に変更した(D1 の処方どおり)。`false` 下でも allow された Bash は sandbox 内で正常実行される(シナリオ (c) で実測)。既存シナリオ out-of-workspace-write / in-workspace-write / report_result も同日 PASS を確認(report_result は同日の再実行 1 回で in-process client の一時的 auth 失敗あり — guard と無関係)。

テスト側の固定:

- **classifier 単体テスト**: 変更系 git（複合コマンド・パイプ・`&&` 連結を含む）が mutation、読み取り git と
  非 git が read-or-nongit に分類される。
- **guard 単体テスト**: scoped 宣言外 deny / 宣言内 allow、guarded 保護正典 deny / その他 allow、
  pipeline 管理パス deny（全 step）、`.specrunner/` deny、cwd 境界 deny（既存挙動保存）、Bash git 変更 deny /
  読み取り・非 git allow、allow 経路の `updatedInput` パススルー。
- **buildStepContext テスト**: scoped step と guarded step の両方で `writeScope`（declaredWritePaths /
  stagingMode / stepName / slug）が正しく設定される（本番配線の固定）。
- **破壊確認**: (i) `allowedTools` が Bash を含まないことを固定するテスト（revert で Bash を戻すと fail）、
  (ii) guard の scoped 宣言外 deny / Bash git 変更 deny のテスト（revert で cwd 境界のみ / Bash pre-approve に
  戻すと fail）。この 2 レバーを PR に破壊確認として記録する。

**残余（検出対象外。commit 層が壁）**:

- shell 変数展開（`$CMD commit`）・コマンド置換（`$(...)` / backtick）・`xargs` / `sh -c "..."` 経由の git 実行。
- リダイレクト（`>` `>>`）・`tee` / `sed -i` / `dd` 等の Bash 経由 file 書込（Write/Edit tool を経由しないため
  guard の Edit/Write 分岐に載らない）。
- エディタ系コマンド（`ed` 等）経由の書込。

これらは `canUseTool` の字句分類・Edit/Write 分岐では捕捉されず、commit 層の mixed reset + 合成 + egress 照合が
最終的に受け止める。permission 層は回避不能性を主張しない。

## Risks / Trade-offs

- [Risk] `autoAllowBashIfSandboxed:true` が Bash を `canUseTool` より前に auto-approve し、git deny が
  成立しない。 → Mitigation: probe R5-a を最初に走らせ、観測 B なら `autoAllowBashIfSandboxed:false` に
  切替え、非 git Bash が引き続き実行されることを probe で確認してから採用する（D1）。確認できなければ実装前に
  判断を仰ぐ。
- [Risk] 字句分類の false negative（変数展開・置換・`sh -c` 経由の git 変更が素通り）。 → Mitigation: 残余として
  明文化し commit 層が壁。permission 層は多重防御でありサイクル短縮が目的。
- [Risk] 字句分類の false positive（引用符内の `;` 等で過剰分割し、正当コマンドを誤 deny）。 → Mitigation: 誤
  deny は可用性影響であり安全側。deny message で agent に読み取り系許可・git 状態変更不要を伝え再試行を誘導。
  代表的な複合コマンドをテストで固定する。
- [Risk] パスのプラットフォーム差（`path.relative` の区切り）で管理パス / 正典比較が外れる。 → Mitigation:
  比較前に posix 正規化する（macOS/Linux では no-op だが明示）。
- [Risk] `writeScope` を optional にしたことで本番配線が緩む。 → Mitigation: 本番組み立て点は
  `buildStepContext` 唯一。scoped/guarded 両方で `writeScope` 設定を固定するテストを追加。fallback は
  strictly weaker（cwd 境界のみ）で本番より弱くはならない。Bash git 分類は scope 非依存で常時適用。
- [Trade-off] `TC-SB-02`（`sandbox-scope.test.ts`: `allowedTools` が Bash を含む・`autoAllowBashIfSandboxed:true`）
  は旧挙動の固定であり、Bash 除去に伴い更新が必要。これは本変更が対象とする adapter テストであって、
  「無改変 green を要する commit 層（write-scope / 合成 / egress）テスト」とは別物。

## Open Questions

- 観測 B（`autoAllowBashIfSandboxed:false`）を採る場合、allow した Bash が sandbox 下で実行されるか、
  あるいは prompt/deny されずに走るか。probe で「allow した非 git Bash（`bun test` 等）が実行される」ことを
  確認できなければ、テスト実行系 step を壊すため実装前に判断を仰ぐ（勝手にスコープを縮小しない）。
