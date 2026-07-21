# Spec: write-scope enforcement 面を step 実行の全効果へ拡張する

このファイルは本変更の自己完結仕様である。commit 境界での write-scope 強制が、worktree 差分だけで
なく **index（事前 stage）と agent 自己 commit** をも検査面に含めるための Layer-1 挙動を規定する。
対象は `src/core/step/commit-push.ts`（`commitAndPush` / `commitAndPushTail`）と
`src/core/step/write-scope.ts`。

## Requirements

### Requirement: scoped mode の commit は宣言 path + pipeline 管理 path のみを記録する

scoped mode の per-step commit は、宣言 writes（`artifact: "gitState"` を除く）と
`pipelineManagedPaths(slug)` の union を pathspec とし、その path のみを記録 SHALL する。step 実行前に
index へ stage されていた許可外エントリを commit に混入させてはならない（MUST NOT）。「staged 変更の
有無」判定も同じ pathspec scope で行う MUST。guarded mode は従来どおり index 全体を記録する。

#### Scenario: 事前 stage された許可外ファイルが commit に含まれない

**Given** scoped step（例: spec-review）の実行前に許可外ファイル `src/secret.ts` が index に stage
されている
**And** step は宣言 write として自身の result ファイルのみを持つ
**When** `commitAndPush` が scoped commit を実行する
**Then** 生成される commit は宣言 path + pipeline 管理 path のみを含み、`src/secret.ts` を含まない

#### Scenario: staged 判定も pathspec scope で行われる

**Given** scoped step の宣言 path に変更が無く、許可外 path のみが事前 stage されている
**When** `commitAndPush` が「staged 変更の有無」を判定する
**Then** 宣言 path + 管理 path scope では staged 変更なしと判定し、許可外 stage を根拠に commit 経路を
起動しない

#### Scenario: scoped で staging 対象が空のとき index 全体へ fallback しない

**Given** scoped step の宣言 writes が空で、既存の pipeline 管理 path も無い（stagePaths が空）
**When** `commitAndPush` が commit 経路を評価する
**Then** index 全体を commit する fallback は起きず、commit 経路をスキップして HEAD 前進検出のみを行う

### Requirement: agent 自己 commit の内容を write-scope 規則で検査する

step 実行後に HEAD が step 開始時（`headBeforeStep`）から前進している場合、`headBeforeStep..HEAD` の
net 変更 path を列挙し、その step の write-scope 規則で検査 SHALL する。違反があれば push してはならず
（MUST NOT）、`WRITE_SCOPE_VIOLATION` で halt する MUST。違反が無い自己 commit は現行どおり push する。
検査規則は mode 別で、scoped は「宣言 writes + pipeline 管理 path 以外の変更を違反」、guarded は
「保護正典 path への変更を違反」とする。

#### Scenario: guarded 自己 commit に保護正典が含まれる → push せず halt

**Given** guarded step（例: implementer）が worktree を clean にしたまま自分で commit し、その commit が
`request.md` を変更している
**When** `commitAndPush` が `headBeforeStep..HEAD` を検査する
**Then** `WRITE_SCOPE_VIOLATION` を throw して halt し、`git push` は実行されない

#### Scenario: scoped 自己 commit に宣言外 path が含まれる → push せず halt

**Given** scoped step が worktree を clean にしたまま自分で commit し、その commit が宣言 writes にも
pipeline 管理 path にも属さない path（例: `request.md`）を変更している
**When** `commitAndPush` が `headBeforeStep..HEAD` を検査する
**Then** `WRITE_SCOPE_VIOLATION` を throw して halt し、`git push` は実行されない

#### Scenario: 違反の無い自己 commit は push される（挙動保存）

**Given** step が worktree を clean にしたまま自分で commit し、その commit が境界内の path のみ
（guarded: source のみ / scoped: 宣言 path のみ）を変更している
**When** `commitAndPush` が `headBeforeStep..HEAD` を検査する
**Then** 違反なしと判定し、現行どおり既存 commit を `git push` する

#### Scenario: 変更 path の列挙に失敗したら fail-closed

**Given** HEAD が前進しているが `headBeforeStep..HEAD` の変更 path 列挙が git error を返す
**When** `commitAndPush` が自己 commit を検査しようとする
**Then** 内容を検査できないため push せず halt する（fail-closed）

### Requirement: scoped mode の保護正典残余違反は halt する

scoped mode の staging 後に保護正典 path の残余違反（`findWriteScopeViolations`）を検出した場合、
quarantine と復元の後に処理を続行せず（MUST NOT continue）、`WRITE_SCOPE_VIOLATION` で halt SHALL する
（guarded と同じ fail-closed）。改変された正典を読んだ可能性のある step の結果を採用してはならない。

#### Scenario: judge step が request.md を改変 → 復元後に halt

**Given** scoped judge step（例: spec-review）が実行中に `request.md` を改変し、scoped staging 後も
worktree に残余 dirty として残っている
**When** `commitAndPush` が residual 検査で `request.md` を違反として検出する
**Then** 違反内容を quarantine し worktree を復元した後、`WRITE_SCOPE_VIOLATION` を throw して halt する

#### Scenario: 結果採用が halt により抑止される

**Given** scoped judge step の residual 違反が検出される
**When** `commitAndPush`（finalize）が halt する
**Then** halt は step の verdict 導出（`deriveStepCompletion`）より前に発生し、改変された正典を読んだ
step の結果は state に採用されない

### Requirement: 3 経路の違反は証跡を退避し halt メッセージに退避先を含める

3 経路（事前 stage 混入・自己 commit・scoped 残余）の違反はいずれも既存 quarantine 機構で違反内容を
`.specrunner/local/<slug>/write-scope-violation-<step>-<ts>.md` に退避 SHALL し、halt メッセージ
（`writeScopeViolationError`）に退避先を含める MUST。自己 commit の違反は該当 commit の diff
（`headBeforeStep..HEAD`）を退避する。

#### Scenario: 自己 commit 違反は commit 差分を退避する

**Given** 自己 commit が保護正典を変更して違反と判定された
**When** quarantine が実行される
**Then** 退避ファイルに `headBeforeStep..HEAD` の該当 path 差分が記録され、halt メッセージに退避先パスが
含まれる

#### Scenario: scoped 残余違反は worktree 差分を退避する

**Given** scoped 残余違反が検出された（worktree に dirty として残存）
**When** quarantine が実行される
**Then** 退避ファイルに worktree 差分が記録され、halt メッセージに退避先パスが含まれる

### Requirement: 境界内のみの変更の挙動と commit 内容を現行と同一に保つ

境界内のみの変更（worktree の宣言内変更 / 境界内の自己 commit とも）について、commit 内容・push 挙動・
commit メッセージ形式（`<step.name>: <slug>`）を現行と同一に SHALL 保つ。guarded mode の index 全体
staging（pathspec なし）と push-only 検出も維持する。

#### Scenario: guarded の境界内 worktree 変更は現行どおり commit + push

**Given** guarded step が source のみを worktree で変更した（保護正典に触れていない）
**When** `commitAndPush` が実行される
**Then** `git add -A`（pathspec なし）→ `git commit -m "<step>: <slug>"` → `git push` が現行どおり実行
される

#### Scenario: scoped の境界内変更は宣言 path + 管理 path を現行どおり commit

**Given** scoped step が宣言 path のみを変更した
**When** `commitAndPush` が実行される
**Then** 宣言 path + pipeline 管理 path を pathspec として commit + push し、commit 内容は現行と同一に
保たれる
