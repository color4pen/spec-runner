# Spec: pipeline を唯一の committer にする（検査モデル → 合成モデル）

このファイルは本変更の自己完結仕様である。push される歴史を **pipeline が構成した commit のみ**に限定する
合成モデルの Layer-1 挙動を規定する。対象は `src/core/step/commit-push.ts`
（`commitAndPush` / `commitAndPushTail` / `commitFinalState` / `commitScopedPaths` / `pushOnly`）、
`src/core/pipeline/parallel-review-round.ts`、`src/core/pipeline/round-git-scope.ts`、
`src/core/step/commit-orchestrator.ts`、`src/core/verification/propagate.ts`、および
`state.synthesizedCommits`（新規 state field）。

用語:
- **合成 commit**: pipeline が明示パス列挙で作成した commit。作成直後にその OID を state の合成 commit 台帳
  （`synthesizedCommits`）に記録する。
- **agent 自己 commit**: step 実行中に agent が自ら作成した commit（HEAD が step 開始点から前進した痕跡）。
- **公開範囲**: ある push が remote に新規到達させる commit 集合（`HEAD --not --remotes=origin`）。

## Requirements

### Requirement: sequential step の commit は合成で構成する

sequential step 完了時、pipeline は step 開始点（`headBeforeStep`）を起点に commit を合成 SHALL する。
step 実行中に HEAD が起点から前進していた場合（agent 自己 commit）、`git reset --mixed <headBeforeStep>`
で起点へ戻し（作業内容は worktree に保持、歴史からは除外）てから合成する MUST。合成後に push される歴史に、
agent が作成した commit オブジェクトが存在してはならない（MUST NOT）。push-as-is（agent 著 commit を検査後
そのまま push する）経路は廃止する MUST。

#### Scenario: agent 自己 commit を mixed reset で歴史から除外し合成し直す

**Given** guarded step（例: implementer）が自ら `git commit` して HEAD を `headBeforeStep` から前進させた
**When** `commitAndPush` が commit 合成を行う
**Then** `git reset --mixed <headBeforeStep>` で HEAD を起点へ戻し、worktree の実変更を明示パス列挙で
commit し直し、push される歴史に agent 著 commit オブジェクトは含まれない

#### Scenario: agent 自己 commit の正当な作業内容が無損失で合成 commit に入る

**Given** agent が正当な source 変更を worktree に加えて自己 commit した
**When** `commitAndPush` が mixed reset 後に合成する
**Then** その作業内容と同一の内容が pipeline 合成 commit として記録され（作業内容の無損失）、その OID が
`synthesizedCommits` 台帳に記録される

#### Scenario: agent 自己 commit が無くても合成は起点から構成される

**Given** step が自己 commit せず worktree の実変更のみを残した
**When** `commitAndPush` が合成する
**Then** HEAD は起点のまま、worktree の実変更を明示パス列挙で 1 個の合成 commit にする

### Requirement: scoped / guarded 双方の staging は明示パス指定とし裸の `git add -A` を全廃する

すべての commit 経路の staging は pathspec を明示指定 SHALL する。pathspec を持たない裸の `git add -A`
（index 全体 staging）は `src/` から全廃する MUST。

- **scoped step**: 宣言 writes（`artifact: "gitState"` を除く）と pipeline 管理パスの union を pathspec と
  し、その path のみを stage / commit する MUST。
- **guarded step**: step の実変更を列挙（`git status --porcelain -z --no-renames`）し、write-scope
  allowlist で検証した上で、列挙した実変更 path を明示 pathspec として stage / commit する MUST。

#### Scenario: scoped step は宣言 path + 管理 path のみを明示 commit する

**Given** scoped step の実行前に許可外ファイル `src/secret.ts` が index に事前 stage されている
**When** `commitAndPush` が scoped 合成を行う
**Then** 生成 commit は宣言 path + pipeline 管理 path のみを含み、`src/secret.ts` を含まない。裸の
`git add -A`（pathspec なし）は呼ばれない

#### Scenario: guarded step の実変更列挙が正当な変更を 1 個も落とさない

**Given** guarded step が新規 untracked ファイル・tracked ファイルの削除・rename を worktree に生じさせた
**When** `commitAndPush` が実変更を列挙して合成する
**Then** untracked 新規・削除・rename を含むすべての実変更が明示 pathspec で commit に取り込まれ、1 ファイルも
落ちない

#### Scenario: `src/` に裸の `git add -A` が存在しない

**Given** 本変更適用後の `src/` ツリー
**When** 静的解析で `git add -A`（後続 pathspec なし）を検索する
**Then** 該当箇所は 0 件である

### Requirement: guarded の write-scope 違反は退避して fail-closed halt する

guarded step の実変更列挙が write-scope allowlist に違反する path を含む場合、違反内容を machine-local へ
退避（quarantine）した上で `WRITE_SCOPE_VIOLATION` で halt SHALL する。違反 commit を push してはならない
（MUST NOT）。

#### Scenario: guarded step が保護正典を変更 → 退避して halt

**Given** guarded step の実変更列挙に保護正典 path（例: `request.md`）が含まれる
**When** `commitAndPush` が write-scope allowlist で検証する
**Then** 違反内容を `.specrunner/local/<slug>/` へ退避し、`WRITE_SCOPE_VIOLATION` で halt し、push は
実行されない

### Requirement: checkpoint / finalize の commit 対象を pipeline 管理パスに限定する

`commitFinalState`（checkpoint / finalize）は pipeline 管理パスのみを明示指定して commit SHALL する。
agent の未 commit 作業内容を checkpoint / finalize に含めてはならない（MUST NOT）。未 commit 作業内容は
local worktree に残存し、local resume で継続可能とする。

#### Scenario: 事前 stage された許可外ファイルが checkpoint / finalize に混入しない

**Given** scoped step 実行前に `src/secret.ts` が index に事前 stage され、step は自身の result のみを宣言する
**When** step 合成の後に `commitFinalState`（checkpoint / finalize）が実行される
**Then** checkpoint / finalize commit は pipeline 管理パスのみを含み、`src/secret.ts` を含まない

#### Scenario: agent 未 commit 作業内容は checkpoint に残らず worktree に残存する

**Given** agent が未 commit の作業内容を worktree に残した状態で checkpoint（awaiting-resume）に至る
**When** `commitFinalState` が checkpoint を作成する
**Then** checkpoint commit は pipeline 管理パスのみを含み、agent 未 commit 内容は worktree に残存する

### Requirement: parallel round は fan-out 前後の HEAD 前進を違反として halt する

reviewer round は read-only であり、coordinator の合成 commit を除いて HEAD が前進してはならない。
ParallelReviewRound は fan-out 前に HEAD を記録し、fan-out 後（coordinator commit の前）に HEAD が前進して
いれば違反とみなして escalation halt SHALL する（fail-closed）。違反時は `<headBefore>..HEAD` の diff を退避し、
`git reset --mixed <headBefore>` で起点へ復帰する MUST。弱化 commit を push される歴史に残してはならない
（MUST NOT）。

#### Scenario: reviewer が正典を弱化して自己 commit → round halt

**Given** parallel reviewer が実行中に `request.md` を弱化して自己 commit し、worktree を clean にした
**When** ParallelReviewRound が fan-out 後に HEAD を照合する
**Then** HEAD 前進を違反として検出し、commit range の diff を退避して `git reset --mixed` で起点へ復帰し、
escalation halt する。弱化 commit は branch の push 系列に存在しない

#### Scenario: reviewer が何も commit しなければ round は現行どおり進む

**Given** すべての reviewer が commit せず worktree も変更しない（read-only）
**When** ParallelReviewRound が HEAD を照合する
**Then** HEAD 前進なしと判定し、round は現行どおり aggregate verdict を算出する

### Requirement: push 直前に公開範囲を合成 commit 台帳と照合する（egress backstop）

すべての push は、公開範囲（`HEAD --not --remotes=origin`）の全 commit が `synthesizedCommits` 台帳
（現操作で作成した OID を in-memory で union したもの）に含まれることを検証 SHALL する。台帳に無い commit を
公開範囲に含む場合、push してはならず（MUST NOT）halt する MUST。これは agent 偽装への壁ではなく、合成漏れ・
harness 欠陥の backstop である。

#### Scenario: 台帳未記録の commit を公開範囲に含む push は halt する

**Given** 公開範囲に `synthesizedCommits` 台帳に無い commit OID が 1 個存在する
**When** pipeline が egress 照合を行う
**Then** push を実行せず halt する（fail-closed）

#### Scenario: 合成 commit のみの公開範囲は push される

**Given** 公開範囲の全 commit が合成 commit 台帳に含まれる
**When** pipeline が egress 照合を行う
**Then** 照合を通過し `git push` が実行される

### Requirement: 合成・復帰経路の git 操作失敗を fail-closed 化する

合成・復帰経路の git 操作（status / clean / checkout / reset / add / commit）の失敗を黙殺してはならない
（MUST NOT）。いずれの失敗も halt に倒す SHALL。現行の scoped residual における status 失敗の黙殺・restore
失敗の黙殺を解消する。

#### Scenario: mixed reset 失敗は halt する

**Given** agent 自己 commit を除外するための `git reset --mixed` が非 0 exit を返す
**When** `commitAndPush` が合成を試みる
**Then** 黙って続行せず halt する

#### Scenario: 実変更列挙の status 失敗は halt する

**Given** 合成のための `git status` が spawn 失敗または非 0 exit を返す
**When** 合成経路が実変更を列挙しようとする
**Then** 黙って続行せず halt する

### Requirement: bite-evidence-result.md を pipeline 管理パスに含める（#888 の同時解消）

`pipelineManagedPaths(slug)` は `bite-evidence-result.md` を含む SHALL。これにより (a) scoped 合成が
bite-evidence-result.md を commit に取り込み、(b) parallel round の未宣言変更検出（offending）から除外され、
bite-evidence の dirty 残留による round guard 誤発火（#888）が発生しない MUST。

#### Scenario: bite-evidence-result.md が合成 commit に取り込まれる

**Given** bite-evidence（CLI step）が `bite-evidence-result.md` を worktree に書き出し、自 step の commit を
持たずに dirty として残した
**When** 後続 scoped step が合成 commit を行う
**Then** `bite-evidence-result.md` は pipeline 管理パスとして合成 commit に取り込まれる

#### Scenario: bite-evidence-result.md の残留が round guard を誤発火させない

**Given** `bite-evidence-result.md` が worktree に dirty として残った状態で parallel round が走る
**When** round が未宣言変更（offending）を検出する
**Then** `bite-evidence-result.md` は pipeline 管理パスとして offending から除外され、round は halt しない

### Requirement: commitOid の意味論を不変に保つ

本変更は StepRun.commitOid の捕捉タイミング・意味（revision 束縛 / canonHash 束縛の入力）を変更しては
ならない（MUST NOT）。egress 照合の台帳は StepRun.commitOid と独立した `synthesizedCommits` field を
正とする SHALL。

#### Scenario: revision 束縛・canonHash 束縛の既存挙動が保存される

**Given** revision 束縛（commitOid 照合）・canonHash 束縛に依存する既存の承認バインディング
**When** 本変更を適用する
**Then** それらの挙動は不変であり、対応する既存テストは無改変で green のまま通過する
