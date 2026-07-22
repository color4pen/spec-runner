# agent の git 状態変更とスコープ外書込を permission 層で遮断する

## Meta

- **type**: new-feature
- **slug**: permission-layer-git-write-denial
- **base-branch**: main
- **adr**: true

## 背景

pipeline-sole-committer(#893)により push される歴史は pipeline 合成 commit のみになったが、遮断は commit/push 層で効く事後の壁であり、agent は実行中は git の全能力と worktree 全域への書込を持ったままである。このため (a) agent の自己 commit → mixed reset → 再合成という無駄なサイクルが常態化し、(b) 改変された正典・state を後段が読む前に止める最速の防御線が存在せず、(c) egress 台帳の正である state.json が agent 可書きのまま残る(#894)。

合成モデルの成立で **agent に git 状態変更の正当用途は存在しなくなった**(commit は pipeline が合成する)。また各 step の書込範囲は宣言済み(writes())である。これらを tool permission 層(canUseTool)で実行時に deny する多重防御を追加する。

位置づけ: これは壁の置き換えではない。壁は #893 の mixed reset + 合成 + egress であり、本変更は攻撃・事故の大半を tool call 時点で止めてサイクルを短縮し、防御を多層化するものである。shell 経由の回避(変数展開・リダイレクトによる file 書込等)は残余として明記し、commit 層が引き続き受け止める。

## 現状コードの前提

- `src/adapter/claude-code/agent-runner.ts:443-446` — allowedTools は `["Read", "Bash", "Grep", "Glob"]` + report MCP tool。**Bash は pre-approve され canUseTool を素通りする**(permission 層に git コマンドの検査は存在しない)
- `src/adapter/claude-code/agent-runner.ts:121-150` — `createWorkspaceToolGuard(cwd)` は Edit / Write のみを対象とし、cwd 境界(worktree 外)だけを deny する。宣言 writes・保護正典・pipeline 管理パスの知識を持たない。それ以外の tool は終端で `{ behavior: "allow", updatedInput: input }`
- `src/adapter/claude-code/agent-runner.ts:94-104` — sandbox は filesystem write を cwd 配下に制限(`allowUnsandboxedCommands: false`)。git 操作・worktree 内のスコープ外書込は制限しない。`failIfUnavailable: false` のため非対応環境では黙って無効化される
- `src/core/port/agent-runner.ts:113-141` — `AgentRunContext` は step / state / slug / cwd 等を運ぶが、**宣言 writes / staging mode を運ぶ field は無い**
- `src/core/step/step-context-builder.ts:130-157` — ctx 組み立て点。`step.writes?.(state, deps)`(commit-push.ts:449-450 と同形)と `stagingModeFor(step.name)` をここで計算できる
- `src/core/step/write-scope.ts` — leaf module(util/paths のみ import)。`stagingModeFor`(:51-53)/ `protectedCanonPaths`(:64-74)/ `forbiddenWritePaths`(:104-112)/ `GUARDED_WRITE_STEPS`(:33-39)が再利用可能
- `src/core/pipeline/round-git-scope.ts:104-106` — `pipelineManagedPaths(slug)` = state.json / events.jsonl / usage.json / bite-evidence-result.md(egress 台帳の正は state.json — #894)
- `scripts/probes/write-scope-guard-probe.ts` — 実 SDK に対する permission 挙動の正本 probe。現行は Write の in/out-of-workspace と report tool pre-approve の 3 シナリオ(Bash / git は未検証)
- 実測済み SDK 挙動(2026-07-10 probe): `default` mode で allowedTools に無い tool は canUseTool が発火し、deny message は agent に届き再試行可能。allow は `{ behavior: "allow", updatedInput }` 必須
- `src/core/runtime/query-one-shot.ts:135-136` / `provider-readiness-probe.ts:228-232` — step 実行以外の utility query は `bypassPermissions`(agent step の経路ではない)
- `src/adapter/managed-agent/agent-runner.ts` — client 側 permission surface を持たない(tool permission は server 側)

## 要件

### R1: Bash を canUseTool 経由に載せ替える

allowedTools から Bash を外し、`default` mode の canUseTool が Bash に発火することを probe で実測確定した上で、guard に Bash 分岐を追加する。SDK 挙動の断定は静的読解でなく probe を正とする。

### R2: git 状態変更コマンドの deny(全 agent step)

Bash 分岐は、コマンドが git の状態変更操作(commit / push / add / reset / checkout / restore / clean / merge / rebase / cherry-pick / stash / rm / mv / am / apply / tag / branch の削除・移動 / update-ref / filter-branch 等)に該当する場合 deny する。読み取り系 git(status / diff / log / show / rev-parse / blame / grep / ls-files 等)と git 以外のコマンドは allow する。

- 対象は**全 agent step**(scoped / guarded とも)。合成モデルでは agent の git 状態変更に正当用途が無い。
- deny message は「commit は pipeline が合成する。git の状態変更は不要」の旨と、読み取り系は許可されていることを agent に伝える(再試行での自己修正を誘導)。
- 分類は保守的な字句判定でよい(単語境界の `git` + 変更系サブコマンド。パイプ・`&&` 等で連結された各セグメントを個別判定)。変数展開等による回避は検出対象外と明記する(R5 の残余)。

### R3: Write / Edit のスコープ deny

`AgentRunContext` に step の書込スコープ(stepName / slug / 宣言 write パス / staging mode)を追加し、`buildStepContext` で計算して guard factory に渡す。guard の Edit / Write 分岐を拡張する:

1. **全 step 共通 deny**: pipeline 管理パス(`pipelineManagedPaths(slug)` — state.json / events.jsonl / usage.json / bite-evidence-result.md)への書込(#894 の permission 層側の閉鎖)。`.specrunner/` 配下への書込。
2. **scoped step**: 宣言 write パス以外への書込は deny(宣言 = 許可の全集合)。
3. **guarded step**: `forbiddenWritePaths(stepName, slug, declaredWritePaths)`(保護正典 − 宣言)への書込は deny。それ以外の worktree 内書込は従来どおり allow。
4. 既存の cwd 境界 deny は維持する。deny message には対象パスと step の許可範囲の要約を含める。

### R4: 挙動不変の保証

- commit 層の write-scope 強制・合成・egress(#893)は一切変更しない(多重防御の独立性)。
- utility query(query-one-shot / readiness probe)と managed adapter は対象外(挙動不変)。
- 正常系の各 step(スコープ内の Write/Edit、読み取り git、テスト実行等の非 git Bash)の許可挙動が変わらないことをテストで固定する。

### R5: probe 拡張と残余の明文化

`write-scope-guard-probe.ts` にシナリオを追加する: (a) Bash が canUseTool に発火する、(b) `git commit` 系 Bash が deny される、(c) 読み取り git Bash が allow される、(d) scoped step の宣言外 Write が deny される、(e) state.json への Write が deny される。design には検出対象外の残余(shell 変数展開・リダイレクト書込・エディタ系コマンド経由の書込)を明記し、それらは commit 層(#893)が受け止めることを記す。

## スコープ外

- managed runtime の tool permission(server 側。client 側 surface が存在しない)
- Git / GitHub credential の権限分離(別 track)
- sandbox の `failIfUnavailable: false`(非対応環境での黙示無効化)の見直し
- Bash 経由の file 書込(リダイレクト・sed -i 等)の分類・遮断(残余として明記、commit 層が担当)
- state.json の正本を agent 非可視領域へ移す構造変更(#894 の対応方向 2。本 request は permission 層の遮断のみ)

## 受け入れ基準

- [ ] classifier 単体テスト: 状態変更 git(commit/push/add/reset/checkout/clean/merge/rebase/stash 等)を含むコマンドが deny、読み取り git(status/diff/log/show/rev-parse 等)と非 git コマンドが allow になることを固定する(パイプ・`&&` 連結の複合コマンドを含む)
- [ ] guard 単体テスト: scoped step の宣言外 Write/Edit deny・宣言内 allow、guarded step の保護正典 deny・その他 allow、pipeline 管理パス deny(全 step)、cwd 境界 deny(既存挙動保存)を固定する
- [ ] allow 経路が `updatedInput` パススルーを維持することをテストで固定する(SDK Zod 制約)
- [ ] probe 実行記録: R5 の 5 シナリオが期待どおりであることを design または PR に記録する(実 SDK 検証)
- [ ] 既存の write-scope / 合成 / egress テストが無改変で green(commit 層不変の証明)
- [ ] 修正前の挙動(Bash pre-approve / guard の cwd 境界のみ)に戻すと該当テストが fail することを破壊確認として記録する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: 全 agent step で git 状態変更 deny**。合成モデル(#893)成立により agent の git 書込に正当用途が無くなったことが前提。step 別の許可表は不要になり、分類は「変更系 or 読み取り系」の 1 軸で済む。
- **採用: 保守的字句分類 + 残余の明文化**。permission 層は多重防御であり、回避不能性を主張しない(inspection モデルの轍を踏まない)。壁は commit 層の合成 + egress のまま。
- **採用: スコープ情報は buildStepContext で計算して AgentRunContext に threading**。guard を write-scope leaf module の既存関数の再利用で構成し、許可規則の単一ソース(write-scope.ts)を保つ。
- **却下: Bash 全面 deny** — 判定系 step はテスト実行(bun test 等)・読み取り git に Bash を正当利用する。
- **却下: allowedTools に Bash を残したまま SDK 側 hooks で検査** — 実測済みの SDK 挙動(allowedTools は canUseTool を素通り)と矛盾する。発火経路は probe で確定済みの canUseTool 一本に揃える。
- **却下: scoped step の Write/Edit 全面 deny** — 宣言 writes(result md 等)への書込は step の本務。宣言集合を許可の全集合とする。
