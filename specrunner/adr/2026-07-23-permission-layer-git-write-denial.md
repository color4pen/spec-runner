# ADR-20260723: agent の git 状態変更とスコープ外書込を permission 層で遮断する

## ステータス

accepted

## コンテキスト

ADR-20260722（pipeline-sole-committer）により push される歴史は pipeline 合成 commit のみになった。
しかし遮断は commit/push 層の事後の壁であり、agent は実行中に git の全能力と worktree 全域への
書込を持ったままだった。このため:

- agent の自己 commit → mixed reset → 再合成という無駄なサイクルが常態化していた。
- 改変された正典・state を後段 step が読む前に止める最速の防御線が tool call 時点に存在しなかった。
- egress 台帳の正である `state.json` が agent 可書きのまま残っていた（#894）。

合成モデルの成立により、**agent が git 状態を変更する正当用途は存在しない**（commit は pipeline が合成する）。
また各 step の書込範囲は `writes()` で宣言済みである。

ADR-20260710（step-agent-permission-mode-default）は `canUseTool` で workspace guard を実装したが、
Bash は `allowedTools` に残ったまま（= pre-approve）で guard を素通りしていた。また Write/Edit の
guard は cwd 境界のみを対象とし、宣言 writes・保護正典・pipeline 管理パスの知識を持たなかった。

本変更はその欠缺を閉じ、以下の 2 軸の多重防御を permission 層に追加する:

1. **Bash 分岐**: git 状態変更コマンドの字句分類で全 agent step において deny する。
2. **Write/Edit 分岐**: pipeline 管理パス・宣言外スコープ・保護正典への書込を、step の staging mode
   に応じた規則で deny する。

位置づけ: 壁の置き換えではない。壁は commit 層の合成 + egress のままであり、本変更はサイクルを
短縮し防御を多層化する。回避不能性は主張しない（inspection モデルの轍を踏まない）。shell 経由の
回避は残余として明文化し、commit 層が引き続き受け止める。

### probe 実測事実（2026-07-23 確定）

`write-scope-guard-probe.ts` に追加した 5 シナリオの実行結果:

| シナリオ | 結果 | 観測 |
|---|---|---|
| (a) bash-canusetool-gate | PASS | **観測 B**: `autoAllowBashIfSandboxed: true` では Bash が canUseTool より先に auto-approve される（guard 不到達）。`false` に変更すると canUseTool が発火する |
| (b) bash-git-mutation-deny | PASS | `git commit` が canUseTool で deny される（`false` 設定下） |
| (c) bash-git-read-allow | PASS | SDK fast-path: 読み取り安全コマンド（`git status`）は canUseTool 前に auto-approve される |
| (d) scoped-write-deny | PASS | 宣言外 Write が deny される |
| (e) state-json-deny | PASS | `state.json` への Write が deny される |

観測 B に基づき `buildWorkspaceSandbox` を `autoAllowBashIfSandboxed: false` に変更した。
`false` 下でも allow された Bash は sandbox 内で正常実行される（シナリオ (c) で実測）。

## 決定

### D1: Bash を `allowedTools` から外し `canUseTool` に載せ替える

`baseAllowedTools` を `["Read","Grep","Glob"]` に変更（Bash 除去）し、`autoAllowBashIfSandboxed`
を `false` に変更する（観測 B に基づく処方）。`permissionMode:"default"` の下で Bash tool call が
`canUseTool` を経由し、guard の判定を受ける。

probe R5-a を最初に走らせ観測 A/B を確定してから実装する原則を踏襲した。観測 A（`true` のまま
canUseTool が発火）ではなく観測 B が確定したため、`false` への変更を採用した上で、allow された
非 git Bash（テスト実行等）が sandbox 内で実行されることをシナリオ (c) で確認してから採用した。

**採用理由**: 発火経路を実測済みの `canUseTool` 一本に揃えることで、判定ロジックを単一箇所
（guard）に集約できる。SDK 挙動の断定は静的読解でなく probe の実測を正とする。

**却下案**:
- *allowedTools に Bash を残したまま SDK hooks で検査*: 実測済みの「allowedTools の tool は
  canUseTool を素通り」と矛盾する。ADR-20260710 で確定した事実の再確認。

### D2: git 状態変更コマンドの保守的字句分類器を新設する

新規 leaf module `src/adapter/claude-code/git-command-classifier.ts` に純関数
`classifyGitCommand(command: string): GitCommandVerdict` を置く。

**分類アルゴリズム**:

1. コマンド文字列を shell 接続子（`&&` `||` `|` `;` `&` ・改行）でセグメント分割し、各セグメントを個別判定する。
2. 先頭の環境変数代入トークンをスキップし、残った先頭 basename が `git` でなければ非 git（allow）。
3. `git` の後ろの global option をスキップして subcommand を取り出す。
4. subcommand の分類:
   - **ALWAYS_MUTATING（deny）**: `commit` `push` `add` `reset` `restore` `checkout` `switch` `clean`
     `merge` `rebase` `cherry-pick` `revert` `rm` `mv` `am` `apply` `pull` `update-ref`
     `update-index` `filter-branch` `fast-import` `gc` `prune`。
   - **CONDITIONAL**: `branch`（変更フラグ／位置引数 = 作成は deny、一覧は allow）、`tag`（変更フラグ /
     位置引数 = 作成は deny、`-l` / 引数なしは allow）、`stash`（`list` / `show` は allow、それ以外は deny）。
   - **それ以外**（`status` `diff` `log` `show` `rev-parse` `blame` `grep` `ls-files` 等、未知 subcommand 含む）: allow。

未知 subcommand を allow に倒すのは可用性優先（読み取り系の取りこぼしを避ける）。

**採用理由**: 合成モデルの成立で agent の git 状態変更に正当用途が無くなったため、分類は
「変更系 or それ以外」の 1 軸で済む。permission 層は多重防御であり、回避不能性を主張しない。
壁は commit 層の合成 + egress のまま。

**却下案**:
- *Bash 全面 deny*: 判定系 step はテスト実行（`bun test` 等）・読み取り git を Bash で正当利用する。
- *未知 subcommand を deny（allowlist 方式）*: 読み取り系 git の列挙が収束せず正常系を誤って止める。
- *shell を厳密パース（変数展開・リダイレクトも解析）*: permission 層は回避不能性を主張しない方針で
  厳密パーサは複雑度と誤判定を招く。残余は commit 層が担当。

### D3: 書込スコープを `buildStepContext` で計算し `AgentRunContext` に threading する

`AgentRunContext` に optional field `writeScope?: AgentWriteScope` を追加する:

```typescript
interface AgentWriteScope {
  stepName: string;
  slug: string;
  declaredWritePaths: string[];   // worktree 相対、gitState 除外
  stagingMode: "scoped" | "guarded";
}
```

`buildStepContext` で `step.writes?.(state, deps)` と `stagingModeFor(step.name)` を計算して設定する
（`write-scope.ts` 既存純関数の再利用）。許可規則の単一ソースを `write-scope.ts` に保つ。

optional とする理由: 本番の組み立て点は `buildStepContext` 唯一であり、`writeScope` なしの
fallback は strictly weaker（cwd 境界のみ）とすることで本番より弱くならない。Bash の git 分類は
`writeScope` に依存せず常時適用する（全 step 一律、scope 情報を要さない）。本番配線の緩みを防ぐため、
scoped/guarded 両 step で `writeScope` が正しく設定されることをテストで固定する。

**採用理由**: 許可規則の計算を core の seam に集約し、adapter を runtime-neutral に保つ。guard は
`write-scope.ts` leaf の既存関数の再利用に徹し、許可規則の単一ソースを維持する。

**却下案**:
- *adapter 内で `step.writes` を再計算*: adapter が scope 意味論を知ることになり単一ソースが崩れる。
- *`writeScope` を required field 化*: 安全性は高いが 30+ サイトの churn を伴う。本番保証はテスト
  固定 + strictly-weaker fallback + Bash 常時適用で確保する。

### D4: guard の Edit / Write 分岐を拡張する

`createWorkspaceToolGuard(cwd, scope?)` に第 2 引数 `scope?: AgentWriteScope` を追加し、
Edit / Write の判定順を以下とする:

1. `file_path` が非文字列 → allow（updatedInput パススルー、既存挙動）。
2. **cwd 境界**（既存・維持）: cwd 外なら deny。
3. `scope` があるとき:
   - **全 step 共通 deny**: `pipelineManagedPaths(scope.slug)`（state.json / events.jsonl /
     usage.json / bite-evidence-result.md）と `.specrunner/` 配下。
   - **scoped step**: 宣言 write パス以外を deny（宣言 = 許可の全集合）。
   - **guarded step**: `forbiddenWritePaths(stepName, slug, declaredWritePaths)`（保護正典 − 宣言）を deny。
4. `scope` が無いとき（fallback）: cwd 内なら allow（既存挙動）。
5. allow は必ず `{ behavior:"allow", updatedInput: input }` を返す（Zod union 制約）。

`pipelineManagedPaths` に含まれる `bite-evidence-result.md` を宣言する bite-evidence step は CLI step
（agent step でない）であり guard の対象外。全 agent step で pipeline 管理パスを無条件 deny しても
正常系の宣言出力を阻害しない。

**採用理由**: 保護正典は `forbiddenWritePaths` が、egress 台帳 `state.json` 等は
`pipelineManagedPaths` が既存単一ソース。guard はこれらを import して再利用する。

### D5: 挙動不変の境界

commit 層（`commit-push.ts` の mixed reset + 合成 + write-scope 強制 + egress）、utility query
（`bypassPermissions`）、および managed adapter の挙動を変更しない。多重防御の独立性を保つ。
正常系の各 step（スコープ内の Write/Edit、読み取り git、テスト実行等の非 git Bash）の許可挙動が
変わらないことをテストで固定する。

### D6: probe 拡張と残余の明文化

`write-scope-guard-probe.ts` に (a)〜(e) の 5 シナリオを追加し、実行記録を design.md に残す。
残余（検出対象外）を明文化し、commit 層の合成 + egress が最終的に受け止めることを記す:

- shell 変数展開（`$CMD commit`）・コマンド置換（`$(...)` / backtick）・`xargs` / `sh -c` 経由の git 実行。
- リダイレクト（`>` `>>`）・`tee` / `sed -i` / `dd` 等の Bash 経由 file 書込（Write/Edit tool を経由しない）。
- エディタ系コマンド経由の書込。

permission 層は回避不能性を主張しない。

## 影響

### Positive

- agent の自己 commit → mixed reset → 再合成サイクルが tool call 時点で阻止される（サイクル短縮）。
- state.json 等 egress 台帳への agent 書込が permission 層で遮断される（#894 の permission 側閉鎖）。
- scoped step の宣言外書込・保護正典への書込が tool call 時点で deny される。
- deny message によって agent が読み取り系 git / 宣言内パスへの再試行を誘導される（自己修正）。
- 防御が多層化され、commit 層が見る前に攻撃・事故の大半が遮断される。

### Negative

- `autoAllowBashIfSandboxed: false` への変更により、将来 sandbox 設定を変更する際は probe で
  再確認が必要（特に Bash の canUseTool 発火経路の変化リスク）。
- 字句分類の false positive（引用符内の `;` 等で過剰分割し正当コマンドを誤 deny）が可用性影響として残る。
  deny message での再試行誘導が緩和策となる。
- `TC-SB-02`（sandbox-scope.test.ts: `allowedTools` が Bash を含む・`autoAllowBashIfSandboxed: true`）
  は旧挙動の固定であり、本変更に伴い更新が必要（commit 層テストとは別物）。

### Known Residuals

- shell 変数展開・コマンド置換・`xargs`・`sh -c` 経由の git 実行は検出対象外。
- リダイレクト・`tee`・`sed -i` 等の Bash 経由 file 書込は guard の Edit/Write 分岐に載らない。
- これらは commit 層の mixed reset + 合成 + egress 照合が受け止める。
- managed runtime の tool permission は server 側であり client 側 surface を持たない（スコープ外）。

## 検討した代替案

### A1: Bash 全面 deny

Bash tool そのものを全 agent step で常時 deny し、git 状態変更コマンドの分類を不要にする案。

- **Pros**: 分類ロジックが不要で最も単純。git 状態変更の抜け道となる Bash 経由のあらゆる実行を遮断できる。
- **Cons**: 判定系 step はテスト実行（`bun test` 等）・読み取り git（`git status` / `git diff`）を Bash で正当利用する。全面 deny は正常系 step の本務を阻害する。
- **Why not**: 正常系の Bash 用途を破壊するため採用不可。分類器を導入することで「変更系 or それ以外」の 1 軸の判定で済み、正常系を維持しつつ変更系のみを deny できる。

### A2: allowedTools に Bash を残したまま SDK hooks / filter で検査する

`allowedTools = ["Read","Bash","Grep","Glob"]` を維持したまま、何らかの SDK 側 hook で Bash コマンドを検査する案。

- **Pros**: `allowedTools` の変更が不要。既存の許可リストを維持できる。
- **Cons**: ADR-20260710 の probe 実測事実として確定している「`allowedTools` に載った tool は pre-approve され `canUseTool` を素通りする」と矛盾する。Bash を `allowedTools` に残す限り guard コールバックは Bash に対して一度も発火しない。
- **Why not**: guard が inert になる。実測確定済みの SDK 挙動と真っ向から矛盾する選択肢であり採用不可。

### A3: scoped step の Write/Edit を全面 deny する

scoped step において Write/Edit tool を一律 deny し、宣言 writes の許可リストによる分岐をなくす案。

- **Pros**: 許可集合の計算（`writes()` の解決）が不要でガードがより単純になる。宣言外の書込を構造的に不可能にできる。
- **Cons**: 宣言 writes（spec-review の result md、design step の design.md 等）への書込は step の本務であり、全面 deny ではこれを阻害する。step の出力が消える。
- **Why not**: 宣言集合を許可の全集合とすることで正常系を維持しつつ宣言外を deny できる。本務まで deny する必要はない。

### A4: 未知 git subcommand を deny する（allowlist 方式）

既知の読み取り系 git subcommand（`status` / `diff` / `log` / `show` / `rev-parse` 等）のみを allow とし、
リストに無い subcommand は deny に倒す案。

- **Pros**: 新しい git 変更系コマンドが追加された場合でもデフォルト deny で漏れを防げる。
- **Cons**: 読み取り系 git の subcommand 列挙が収束しない（`ls-files` / `describe` / `cat-file` / `symbolic-ref` 等、無数に存在する）。新しい git バージョンで追加された読み取り系コマンドが誤 deny される可用性リスクが高い。
- **Why not**: permission 層は多重防御であり回避不能性を主張しない。壁は commit 層の合成 + egress のまま。可用性への影響が大きい allowlist 方式より、denylist（変更系のみ明示）+ 残余は commit 層という分業の方が設計意図に合致する。

### A5: shell を厳密にパースし変数展開・リダイレクトも解析する

シェルを完全に解析して変数展開（`$CMD commit`）・コマンド置換（`$(...)` / backtick）・パイプ・
リダイレクト経由の git 書込も検出対象に含める案。

- **Pros**: 字句分類では素通りする shell の高度な回避手法（変数展開・コマンド置換・`xargs`・`sh -c`）も検出できる。
- **Cons**: shell の完全なパーサは複雑度が高く、エッジケースでの誤判定を招く。コマンド置換・エイリアス・関数定義などを追跡しきれないため完全性も保証できない。実装コストと誤判定リスクが大きい。
- **Why not**: permission 層は回避不能性を主張しない方針（inspection モデルの轍を踏まない）。保守的な字句判定で「攻撃・事故の大半を tool call 時点で止める」という目的は達成でき、残余は commit 層が担当する。複雑なパーサを導入する費用対効果がない。

### A6: adapter 内で `step.writes` を再計算し AgentRunContext への field 追加を回避する

`buildStepContext` 経由でなく、adapter の `agent-runner.ts` 内で直接 `step.writes?.(state, deps)` と
`stagingModeFor(step.name)` を計算して guard に渡す案。

- **Pros**: `AgentRunContext` への field 追加が不要。port 型への変更が最小で済む。
- **Cons**: adapter が step scope の意味論（`write-scope.ts` の知識）を知ることになり、許可規則の単一ソースが崩れる。計算ロジックが core（`commit-push.ts` 等）と adapter に重複して現れる。
- **Why not**: 許可規則の計算を `write-scope.ts` leaf に集約するアーキテクチャ原則と矛盾する。`buildStepContext` は step/state/deps が揃う唯一の組み立て点であり、ここで計算するのが自然な seam。

### A7: `writeScope` を required field に変更し型で本番配線を強制する

`AgentRunContext.writeScope` を optional ではなく required とし、`writeScope` が設定されていないコンパクトのコンパイルエラーで本番配線の緩みを防ぐ案。

- **Pros**: 型システムが本番配線の正しさを強制する。strictly-weaker fallback への依存が不要になる。
- **Cons**: `AgentRunContext` を literal 構築するサイト（adapter / test）が 30+ 箇所あり、広範な churn を伴う。機能変更の本質とは無関係な定型変更が多数発生する。
- **Why not**: 本番保証を「本番唯一の組み立て点（`buildStepContext`）でのテスト固定」+ strictly-weaker fallback + Bash git 分類の常時適用で確保する。churn コストが便益を上回ると判断した。

## 参照

- Request: `specrunner/changes/permission-layer-git-write-denial/request.md`
- Design: `specrunner/changes/permission-layer-git-write-denial/design.md`
- Spec: `specrunner/changes/permission-layer-git-write-denial/spec.md`
- Related: [ADR-20260722-pipeline-sole-committer](2026-07-22-pipeline-sole-committer.md) — 合成モデルの確立。本 ADR はその多重防御の第 2 層（同 ADR の A2「SDK permission 層は別 request」として予告された変更）
- Related: [ADR-20260710-step-agent-permission-mode-default](2026-07-10-step-agent-permission-mode-default.md) — canUseTool 基盤の確立。本 ADR は Bash 分岐と Write/Edit スコープ拡張を追加
- Related: [ADR-20260709-claude-adapter-workspace-write-scope](2026-07-09-claude-adapter-workspace-write-scope.md) — Write/Edit の cwd 境界 deny の初期実装。本 ADR はスコープ拡張
- Related: [ADR-20260721-step-write-scope-enforcement](2026-07-21-step-write-scope-enforcement.md) — commit 層での write-scope 強制。本 ADR は permission 層の多重防御として独立して追加
