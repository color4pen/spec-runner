# Spec: agent の git 状態変更とスコープ外書込を permission 層で遮断する

対象は local runtime（Claude Agent SDK）の agent step の tool permission 層（`canUseTool`）である。
commit 層・utility query・managed adapter の挙動は本 spec の対象外（不変）。

## Requirements

### Requirement: Bash を canUseTool 経路に載せる

local runtime の agent step は Bash tool を pre-approve せず、`permissionMode:"default"` の下で Bash tool call が
tool permission guard（`canUseTool`）を経由するようにしなければならない（MUST）。すなわち `allowedTools` から
Bash を除外し、Bash の実行是非を guard の判定に委ねる。

#### Scenario: Bash が allowedTools に含まれない

**Given** local runtime の agent step の query options を組み立てる
**When** `allowedTools` を解決する
**Then** `allowedTools` に `"Bash"` は含まれず、`permissionMode` は `"default"` である

#### Scenario: Bash tool call が guard を経由する

**Given** allowedTools から Bash を除外し `permissionMode:"default"` で SDK query を実行する
**When** agent が Bash tool を呼ぶ
**Then** guard（`canUseTool`）が Bash に対して発火し、その判定結果が Bash の実行是非を決める

### Requirement: git 状態変更コマンドを全 agent step で deny する

guard は Bash コマンドを保守的な字句分類にかけ、git の状態変更操作を含むと判定した場合、対象 step の種別
（scoped / guarded）に関わらず deny しなければならない（MUST）。読み取り系 git と git 以外のコマンドは
allow しなければならない（MUST）。deny message は、commit は pipeline が合成するため git の状態変更は不要である
こと、および読み取り系 git は許可されていることを agent に伝えなければならない（MUST）。

分類は保守的な字句判定でよい（単語境界の `git` + 変更系サブコマンド）。パイプ・`&&` 等で連結された各セグメントを
個別に判定しなければならない（MUST）。変数展開・コマンド置換・リダイレクト等による回避は検出対象外である。

#### Scenario: 状態変更 git を deny する

**Given** guard が有効な agent step
**When** agent が `git commit` / `git push` / `git add` / `git reset` / `git checkout` / `git clean` /
`git merge` / `git rebase` / `git stash` 等の状態変更 git を含む Bash コマンドを呼ぶ
**Then** guard は deny を返し、deny message は git の状態変更が不要であることと読み取り系が許可されていることを伝える

#### Scenario: 読み取り git と非 git を allow する

**Given** guard が有効な agent step
**When** agent が `git status` / `git diff` / `git log` / `git show` / `git rev-parse` 等の読み取り git、
または git 以外のコマンド（テスト実行等）を Bash で呼ぶ
**Then** guard は allow を返し、allow 結果は `updatedInput` に元の input を持つ

#### Scenario: 複合コマンドを個別セグメントで判定する

**Given** guard が有効な agent step
**When** agent が `git status && git commit -m x` や `echo ok | git add -A` のようにパイプ・`&&` で連結した
コマンドを呼ぶ
**Then** guard は状態変更 git を含むセグメントを検出して全体を deny する

### Requirement: pipeline 管理パスと .specrunner への書込を全 step で deny する

guard は、Write / Edit の対象が pipeline 管理パス（`state.json` / `events.jsonl` / `usage.json` /
`bite-evidence-result.md`）または `.specrunner/` 配下である場合、step 種別に関わらず deny しなければならない（MUST）。

#### Scenario: state.json への Write を deny する

**Given** 任意の agent step（scoped / guarded）で guard が書込スコープ情報を持つ
**When** agent が `specrunner/changes/<slug>/state.json` への Write / Edit を試みる
**Then** guard は deny を返す

#### Scenario: .specrunner 配下への Write を deny する

**Given** 任意の agent step で guard が書込スコープ情報を持つ
**When** agent が `.specrunner/` 配下のパスへの Write / Edit を試みる
**Then** guard は deny を返す

### Requirement: scoped step は宣言外の書込を deny する

staging mode が scoped の step において、guard は step が `writes()` で宣言したパス以外への Write / Edit を
deny しなければならない（MUST）。宣言パスへの書込は allow しなければならない（MUST）。宣言集合が許可の全集合である。

#### Scenario: 宣言外 Write を deny する

**Given** staging mode が scoped で、宣言 write パス集合を持つ step
**When** agent が宣言集合に含まれない worktree 内パスへ Write / Edit する
**Then** guard は deny を返し、deny message は許可された宣言パスの要約を含む

#### Scenario: 宣言内 Write を allow する

**Given** staging mode が scoped で、宣言 write パス集合を持つ step
**When** agent が宣言集合に含まれるパス（自 result / 出力ファイル等）へ Write / Edit する
**Then** guard は allow を返し、allow 結果は `updatedInput` に元の input を持つ

### Requirement: guarded step は保護正典への書込を deny する

staging mode が guarded の step において、guard は保護正典から宣言分を除いた集合
（`forbiddenWritePaths(stepName, slug, declaredWritePaths)`）に属するパスへの Write / Edit を deny しなければ
ならない（MUST）。それ以外の worktree 内書込は allow しなければならない（MUST）。

#### Scenario: 宣言していない保護正典への Write を deny する

**Given** staging mode が guarded の step（例: implementer）で、保護正典を宣言していない
**When** agent が `design.md` / `spec.md` / `tasks.md` / `test-cases.md` / `request.md` / attestation の
いずれかへ Write / Edit する
**Then** guard は deny を返す

#### Scenario: 保護正典以外の worktree 書込を allow する

**Given** staging mode が guarded の step
**When** agent が保護正典・pipeline 管理パス・`.specrunner/` 以外の worktree 内パス（`src/` 等）へ Write / Edit する
**Then** guard は allow を返す

### Requirement: cwd 境界の deny を維持する

guard は、Write / Edit の解決先が agent の worktree（cwd）の外にある場合、従来どおり deny しなければならない
（MUST）。この既存挙動は本変更で変わってはならない。

#### Scenario: worktree 外への Write を deny する

**Given** guard が有効な agent step
**When** agent が cwd の外（絶対パスまたは `../` エスケープ）へ Write / Edit する
**Then** guard は deny を返し、deny message は worktree 名を含む

### Requirement: 書込スコープを buildStepContext で計算し文脈に載せる

`buildStepContext` は各 agent step について、宣言 write パス（`writes()` の `gitState` 以外の path）と
staging mode（`stagingModeFor(step.name)`）、step 名、slug を計算し、`AgentRunContext` の書込スコープ field に
設定しなければならない（MUST）。許可規則の計算は `write-scope.ts` の既存関数を単一ソースとして再利用しなければ
ならない（MUST）。

#### Scenario: scoped step のスコープを設定する

**Given** scoped step（例: spec-review）
**When** `buildStepContext` が `AgentRunContext` を組み立てる
**Then** 書込スコープの stagingMode は `"scoped"`、declaredWritePaths は `writes()` の宣言パス、
stepName / slug が設定される

#### Scenario: guarded step のスコープを設定する

**Given** guarded step（例: implementer）
**When** `buildStepContext` が `AgentRunContext` を組み立てる
**Then** 書込スコープの stagingMode は `"guarded"`、declaredWritePaths は `writes()` の宣言パスが設定される

### Requirement: commit 層・utility query・managed adapter を不変に保つ

本変更は commit 層の write-scope 強制・合成・egress、utility query（`bypassPermissions`）、および managed
adapter の挙動を変更してはならない（MUST NOT）。

#### Scenario: commit 層テストが無改変で green

**Given** commit 層の write-scope / 合成 / egress を検証する既存テスト
**When** 本変更を適用してテストを実行する
**Then** それらのテストは無改変で green である
