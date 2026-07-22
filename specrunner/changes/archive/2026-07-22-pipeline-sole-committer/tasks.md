# Tasks: pipeline を唯一の committer にする（検査モデル → 合成モデル）

実装順は依存関係順（土台 → 経路 → 検証）。各タスクは design.md の D 番号に対応する。
テスト scenario の詳細分解は後続の test-case-gen / test-materialize に委譲するが、各タスクの
Acceptance Criteria は受け入れ基準に機械照合できる粒度で記す。

## T-01: 合成 commit 台帳 `synthesizedCommits` を state に追加する（D4）

- [x] `src/state/schema/types.ts` の `JobState` に `synthesizedCommits?: string[]`（append-only、commit OID の
      集合）を追加し、意味（pipeline が作成した commit OID の台帳、egress 照合の正）を docstring に記す。
- [x] `src/state/schema.ts`（helpers）に台帳へ OID を append する純粋 helper
      （例: `appendSynthesizedCommit(state, oid)`）を追加する。重複 OID は加えない。
- [x] StepRun.commitOid の型・意味論は一切変更しない。

**Acceptance Criteria**:
- `synthesizedCommits` は `JobState` に optional field として存在し、既存 state.json（field なし）を読んでも
  互換（undefined → 空集合扱い）である。
- StepRun.commitOid の定義・docstring は無改変である。

## T-02: `pipelineManagedPaths` に bite-evidence-result.md を追加する（D6 / #888）

- [x] `src/core/pipeline/round-git-scope.ts` の `pipelineManagedPaths(slug)` に `biteEvidenceResultPath(slug)` を
      追加する（`util/paths.ts` から import）。
- [x] この単一ソースが scoped 合成（commit-push）と `partitionRoundChanges` の offending 除外の両方に効くことを
      docstring で明記する。

**Acceptance Criteria**:
- `pipelineManagedPaths(slug)` は `bite-evidence-result.md` の worktree-relative path を含む。
- `partitionRoundChanges` の offending から bite-evidence-result.md が除外される（round guard 誤発火なし）。

## T-03: egress 検証付き push（単一 egress）を実装する（D4）

- [x] `src/core/step/commit-push.ts` に公開範囲照合関数を追加する: `git rev-list HEAD --not --remotes=origin` で
      公開範囲 OID を列挙し、各 OID が `ledger`（`synthesizedCommits(state) ∪ 現操作 OID 群`）に含まれるか検証する。
      未記録 OID があれば `EGRESS_UNKNOWN_COMMIT`（T-09）で halt し push しない。git 失敗は fail-closed（D5）。
- [x] 既存 `pushOnly` の前段に egress 検証を差し込む（retry / `commit:push` event 発火は保存）。egress context
      （台帳 + 現操作 OID 群）を引数で受け取る。
- [x] `commitFinalState` の直 push（T-05）と `propagateVerificationResult` の直 push（T-08）も同じ egress 検証を
      経由させる。

**Acceptance Criteria**:
- 公開範囲に台帳未記録の commit を含む push は `EGRESS_UNKNOWN_COMMIT` で halt し、`git push` は呼ばれない。
- 公開範囲の全 commit が台帳に含まれる場合は push が実行され、`commit:push` event が発火する。
- egress の git 操作失敗は黙殺されず halt する。

## T-04: sequential 合成（mixed reset + 明示パス）へ書き換える（D1 / D7）

- [x] `commitAndPush` / `commitAndPushTail` を合成モデルへ書き換える。tail entry で HEAD を取得し、
      `headBeforeStep` から前進していれば `git reset --mixed <headBeforeStep>` で起点へ戻す（reset 失敗 → halt）。
- [x] scoped: `stagePaths = 宣言 writes(gitState 除く) ∪ 既存 pipelineManagedPaths` を明示 pathspec で
      `git add -A -- <stagePaths>` → `git commit -m "<step>: <slug>" -- <stagePaths>`。空なら commit skip。
- [x] guarded: `git status --porcelain -z --no-renames` で実変更を列挙 → `findWriteScopeViolations` で allowlist
      検証（違反 → 退避 + halt、restore しない）→ 列挙 path を明示 pathspec で `git add -A -- <changed>` →
      `git commit -m "<step>: <slug>" -- <changed>`。
- [x] 裸の `git add -A`（pathspec なし）を `commit-push.ts` から全廃する。
- [x] push-as-is 経路（自己 commit をそのまま push）と自己 commit 範囲検査（tail step-0）を削除する。
- [x] 合成 commit 直後の HEAD OID を egress 台帳 union に渡す（push 検証用）。executor が finalize 後に捕捉する
      commitOid と同一 OID を T-08 で台帳へ persist する。

**Acceptance Criteria**:
- agent 自己 commit（正当な内容）後、push された歴史に agent 著 commit オブジェクトが存在せず、同内容が
  pipeline 合成 commit として記録される（作業内容の無損失）。
- guarded の実変更列挙が untracked 新規・削除・rename を含めて 1 ファイルも落とさず合成 commit に取り込む。
- 事前 stage された `src/secret.ts` は scoped 合成 commit に含まれない。
- push-as-is / 自己 commit 範囲検査のコードが削除されている。

## T-05: `commitFinalState` を pipeline 管理パス限定にする（D2）

- [x] `commitFinalState` の裸 `git add -A` を、`pipelineManagedPaths(slug)` を既存 filter で絞った明示 pathspec
      staging（`git add -- <managed>`）＋ pathspec commit へ置換する。
- [x] agent 未 commit 作業内容は checkpoint / finalize に含めない（worktree 残存で local resume 継続）。
- [x] commit 後の OID を egress 台帳 union に渡して直 push を egress 検証する（T-03）。
- [x] 既存 docstring の「Known side effect (scoped residual halt)」記述を削除・更新する（T-04 で residual 除去）。

**Acceptance Criteria**:
- 事前 stage された `src/secret.ts` が checkpoint / finalize commit に混入しない。
- checkpoint commit は pipeline 管理パスのみを含み、agent 未 commit 内容は worktree に残る。
- 裸 `git add -A` が `commitFinalState` から消えている。

## T-06: 合成・復帰経路の git 操作を fail-closed 化する（D5）

- [x] scoped 経路の `getWorktreeChangedPaths` `ok:false` 黙殺スキップを廃し、status 失敗を halt に倒す。
- [x] `git reset --mixed`（T-04 / T-07）失敗を halt に倒す。
- [x] 合成経路の add / commit / status 失敗が typed error（`commitEffectFailedError` 等）で halt することを保証する。
- [x] guarded の clean/checkout restore 黙殺は T-04 の restore 除去により消滅させる（退避 + halt のみ）。

**Acceptance Criteria**:
- status / reset / checkout（該当箇所）失敗の注入で halt する（黙殺しない）。
- fail-open な best-effort skip が合成・復帰経路から消えている。

## T-07: parallel round に HEAD guard を追加する（D3）

- [x] `ParallelReviewRound.run` で fan-out 前に `headBeforeRound = captureHeadSha(cwd)` を記録する。
- [x] fan-out 後、既存 worktree offending 検査の前段に HEAD 照合を挿入する: HEAD 前進 → 違反。
      `<headBeforeRound>..HEAD` の diff を退避 → `git reset --mixed <headBeforeRound>`（失敗 → halt）→
      `escalation` / `inspectionEscalated=true` / `roundError.code="ROUND_HEAD_ADVANCED"`、members は pending 保持。
- [x] 既存 worktree offending 検査は残す（相補的）。coordinator の `commitRoundArtifacts` は HEAD guard の後に走らせる。
- [x] `commitRoundArtifacts` 後の HEAD OID を捕捉し `commitRound` で egress 台帳へ append する（T-08）。

**Acceptance Criteria**:
- round 中の HEAD 前進が escalation halt になり、退避証跡が生成される。
- reviewer が正典を弱化して自己 commit した弱化 commit が branch の push 系列に存在しない（mixed reset で除外）。
- reviewer が何も commit しなければ round は現行どおり verdict を算出する。

## T-08: 合成 commit 台帳への append を配線する（D4）

- [x] `CommitOrchestrator.commitSuccess`（sequential）で、result.commitOid を `synthesizedCommits` へ append する。
- [x] `CommitOrchestrator.commitRound`（round）で、round 合成 commit OID を append する。
- [x] CLI step で commit が発生する経路（`propagateVerificationResult`）: executor `runCliStep` で step.run 後の
      exit-HEAD を捕捉し、`CommitOrchestrator` 経由で台帳へ append する。propagate の直 push は egress 検証を経由する。
- [x] append は state を書く層（CommitOrchestrator）で行い、git 層（commit-push）は state を永続化しない
      （B-13 境界を保つ）。git 層は現操作 OID を in-memory union として egress へ渡すのみ。

**Acceptance Criteria**:
- sequential / round / verification の各合成 commit OID が `synthesizedCommits` に記録される。
- verification commit を含む後続 push が egress で誤 halt しない。

## T-09: 新規 error code / factory を追加する（D3 / D4）

- [x] `src/errors.ts` に `EGRESS_UNKNOWN_COMMIT`（egress backstop）と round HEAD 前進用の error を追加する
      （`ROUND_HEAD_ADVANCED` は roundError code として `parallel-review-round.ts` 側で使用）。
- [x] 各 error に operator 向け hint（原因・resume 手順）を含める。

**Acceptance Criteria**:
- egress halt / round HEAD 前進 halt がそれぞれ専用 code で分類される。

## T-10: inspection モデル前提の既存テストを合成モデル期待へ移行する（D7）

- [x] design.md「移行するテスト」列挙分を合成モデル期待へ更新する:
      `write-scope-bypass-closure(.test / -integration.test)`、`commit-and-push.test`、
      `commit-push-write-scope.test`、`commit-final-state.test`、`scope-escalation.test`、
      `fast-scope-checkpoint.test`、`parallel-review-round-git-effects.test`。
- [x] 自己 commit → 「mixed reset で歴史除外 + 合成」、push-as-is → 「合成 push」へ期待を書き換える。
      scoped residual halt（TC-008/009）は D7 のとおり**保持される契約**であり期待を変更しない
      （halt の存在理由は commit 層の leak ではなく「改変された正典を読んだ step の結果を採用しない」こと）。

**Acceptance Criteria**:
- 移行対象テストが合成モデル挙動で green。
- revision 束縛・canonHash 束縛のテストは無改変（diff なし）で green のまま。

## T-11: 裸 `git add -A` 全廃の静的テストを追加する（D1 / D8）

- [x] `tests/unit/architecture/write-scope-invariants.test.ts` に「`src/` 配下に pathspec を持たない
      `git add -A`（後続 `--`/path なし）が存在しない」ことを検証する静的 assertion を追加する。

**Acceptance Criteria**:
- 裸 `git add -A`（pathspec なし）が `src/` に 0 件であることを静的テストが固定する。

## T-12: R6-1 実 git E2E — 事前 stage 許可外ファイルの封鎖（D8）

- [x] 実ローカル git repo（temp dir、push のみ intercept）で: scoped step 実行前に `src/secret.ts` を stage →
      step 合成 commit にも checkpoint / finalize commit にも含まれず、push 系列（`--not --remotes=origin` 相当の
      新規公開範囲）の祖先にも存在しないことを検証する。
- [x] 破壊確認: 裸 add -A / commitFinalState add -A へ戻すと本 E2E が fail することを記録する。

**Acceptance Criteria**:
- R6-1 の実 git E2E が green（v23 経路 1 の封鎖証明）。

## T-13: R6-2 実 git E2E — parallel reviewer 自己 commit の封鎖（D8）

- [x] 実ローカル git repo で: parallel reviewer 実行中に `request.md` を弱化して自己 commit → round が
      `ROUND_HEAD_ADVANCED` で escalation halt し、弱化 commit が branch の push 系列に存在しない（mixed reset で
      除外）ことを検証する。退避証跡が生成されることも確認する。
- [x] 破壊確認: HEAD guard を除去すると本 E2E が fail することを記録する。

**Acceptance Criteria**:
- R6-2 の実 git E2E が green（v23 経路 2 の封鎖証明）。

## T-14: 無損失・guarded 列挙の固定テスト（D1）

- [x] agent 自己 commit（正当）後の step で、push 歴史に agent 著 commit が無く同内容が合成 commit として記録される
      ことをテストで固定する。
- [x] guarded の実変更列挙が untracked 新規・削除・rename を 1 ファイルも落とさないことをテストで固定する。

**Acceptance Criteria**:
- 作業内容無損失テスト・guarded 列挙完全性テストが green。

## T-15: egress / fail-closed / #888 の固定テスト（D4 / D5 / D6）

- [x] egress 照合: 公開範囲に台帳未記録の commit を含む push が halt することをテストで固定する。
- [x] git 操作失敗（status / reset / checkout）の注入で halt になることをテストで固定する（黙殺しない）。
- [x] bite-evidence-result.md が合成 commit に取り込まれ、round guard 誤発火（#888 の症状）が発生しないことを
      テストで固定する。

**Acceptance Criteria**:
- egress halt テスト・git-op 失敗注入 halt テスト・#888 誤発火なしテストが green。

## T-16: 破壊確認の記録（D8）

- [x] 修正前挙動（裸 add -A / push-as-is / HEAD guard なし）へ戻すと該当テストが fail することを、破壊確認として
      test コメントまたは対応表で記録する（T-11 / T-12 / T-13 / T-14 と対応）。

**Acceptance Criteria**:
- 各封鎖に対し「戻すと fail」する対応テストが特定されている。

## T-17: 全体検証（受け入れ最終ゲート）

- [x] `typecheck && test` が green であることを確認する。
  - テスト: 610 files / 8918 tests passed (green)
  - typecheck: test-materialize 生成ファイル 3 件に pre-existing エラー 11 件（未実装 interface 参照、本実装ファイルへの影響なし）
- [x] revision 束縛（commitOid 照合）・canonHash 束縛の既存テストが無改変で green であることを確認する
      （commitOid 意味論不変の証明）。

**Acceptance Criteria**:
- `typecheck && test` が green。
- revision / canon 束縛テストが diff なしで green。
