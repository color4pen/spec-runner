# 中断 step の書きかけ canon を resume が自動隔離して再走する

## Meta

- **type**: spec-change
- **slug**: resume-partial-canon-quarantine
- **base-branch**: main
- **adr**: true

## 背景

pipeline の step 走行中に process が落ちると(signal / kill / crash)、design のような canon producer step の書きかけ出力(design.md / spec.md / tasks.md — untracked または modified)が worktree に残る。resume の apply-canon gate はこれを operator の意図的編集と区別せず fail-closed で halt し、operator の選択肢は次の二択になる:

- `--apply-canon` — 書きかけの部分出力が `operator-apply: <slug>` という operator 署名の commit として正典に入る(意味的に誤り。apply-canon の本来の用途は operator が意図して行った canon 手当ての取り込み)
- 手動退避 / `git checkout HEAD -- <path>` — CLI の外での手作業。退避を怠ると成果物が消える

一方、非 canon の中断残渣(result file 等)には reconcile-worktree が「evidence 退避 → 削除 → clean start で再走」という自動復帰経路を既に提供しており、canon path だけがこの経路から除外されて手動対応に落ちている。中断由来であることが state から機械的に裏づけられる場合に限り、canon の部分出力にも同じ自動復帰を与える。

## 現状コードの前提

- resume の gate 順は apply-canon gate(src/core/command/resume.ts:276-332)→ adopt-commits gate(:334-379)→ reconcile-worktree(:381-396)。apply-canon gate が最初に fail-closed で throw するため、dirty canon があると reconcile に到達しない
- `detectCanonDirtyPaths`(src/core/resume/apply-canon.ts:42-89)は staged / worktree-modified に加え完全 untracked(XY='??')も dirty に含める(:75-83)。dirty の由来(provenance)は一切見ない
- 閉塞時の hint は「--apply-canon で commit」か「git checkout HEAD -- <path> で破棄」の二択のみ(resume.ts:326-331)
- protected canon の定義は `protectedCanonPaths`(src/core/step/write-scope.ts:64-74): request.md / spec.md / design.md / tasks.md / test-cases.md / request-review-attestation.json
- reconcile-worktree は中断残渣の隔離機構を実装済み: `.specrunner/local/<slug>/reconcile-<timestamp>/` へ evidence を全件書き出してから削除し、退避失敗は fail-closed で削除しない(src/core/resume/reconcile-worktree.ts:158-261)。ただし rule 2 で protected canon path を明示的に除外している(:66-69)
- design step は design.md / tasks.md / spec.md を writes() で宣言する canon producer(src/core/step/design.ts:135-144)であり、buildMessage は request.md からフル再生成する(:146-160)— 前回の部分出力を入力として読まないため、破棄しても情報損失なく再走できる
- 中断の機械的痕跡: signal 中断は resumePoint.reason と interruption journal event(src/store/event-journal.ts:90-98)に残る。state.step は step 開始前に永続化され(src/core/step/commit-orchestrator.ts:344-346)、完了 StepRun は step 完了 commit 時にのみ記録されるため、中断された step は完了 StepRun を残さない。SIGKILL / hard-crash 経路では resumePoint / interruption event が残らず、stale-running 検出(resume.ts:158-180)+ state.step + 完了 StepRun 不在が残る痕跡になる

## 要件

1. apply-canon gate に部分出力判定(provenance 判定)を導入する: 「dirty canon paths の全部が、中断された step の writes() 宣言に含まれる」かつ「その step の中断が state から機械的に裏づけられる(resumePoint / interruption event / stale-running 検出のいずれか、かつ当該 step の完了 StepRun 不在)」場合に限り、dirty canon を中断 step の部分出力と判定する
2. 部分出力と判定され `--apply-canon` 未指定の場合、halt せず自動隔離して resume を続行する: reconcile-worktree と同じ規律(evidence を全件退避してから削除、退避先は `.specrunner/local/<slug>/` 配下、退避失敗は fail-closed で削除せず halt)で worktree から除去し、step を最初から再走させる。何をどこへ退避したかをログに明示する
3. 部分出力判定が不成立の場合(中断の裏づけが無い / dirty に中断 step の writes() 外の canon が混在する / 前 step が正常完了している)は、現行どおり fail-closed で halt する
4. `--apply-canon` 明示時は現行どおり operator-apply commit を行う(operator の明示指定が自動隔離より優先)
5. SIGKILL / hard-crash 経路(resumePoint 無し、stale-running 検出で awaiting-resume 化されたケース)でも 1 の判定が機能する

## スコープ外

- reconcile-worktree の rule 2(canon 除外)自体の無条件撤廃 — operator 編集の保護は維持する
- 部分出力の「再利用」(中断地点からの続き書き)— canon producer は全再生成契約であり、途中成果の引き継ぎは別問題
- job cancel / archive 経路での canon 取り扱いの変更
- protectedCanonPaths の定義変更

## 受け入れ基準

- [ ] 中断 step(design)の書きかけ canon がある状態の resume で、halt せず退避 + 除去 + 続行することをテストで固定する(untracked / tracked-modified の両方)
- [ ] 退避先に evidence(内容が読める形)が残ることをテストで固定する
- [ ] 中断の裏づけが無い dirty canon(operator 編集相当)では現行どおり fail-closed halt することをテストで固定する
- [ ] dirty canon に中断 step の writes() 外の path が混在する場合は fail-closed halt することをテストで固定する
- [ ] `--apply-canon` 明示時は自動隔離せず operator-apply commit する現行挙動をテストで固定する
- [ ] 退避失敗時は削除せず fail-closed で halt することをテストで固定する
- [ ] stale-running 経路(resumePoint 無し)でも部分出力判定が機能することをテストで固定する
- [ ] 自動隔離後の再 resume が clean な gate 通過になる(隔離の冪等性)ことをテストで固定する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: provenance 判定は apply-canon gate 内(reconcile より前段)に置き、隔離処理は reconcile-worktree の quarantine 規律(evidence-first / fail-closed)を流用する。gate の「canon は排他的に apply-canon gate が扱う」という責務分担は維持する
- **却下**: reconcile-worktree rule 2 の無条件解除 — operator の意図的 canon 編集まで削除対象になり、fail-closed 原則(operator 意図の保護)を壊す
- **却下**: 部分出力の再利用(途中から続きを書かせる)— canon producer step は request.md からのフル再生成が契約で、部分出力を入力とする経路が存在しない。導入するなら別の設計問題
- **却下**: `--apply-canon` の既定動作変更 — operator の明示指定は現行意味論を維持し、自動隔離は「未指定 + 機械的裏づけ完全一致」の場合に限る
- **判定の保守性**: 迷ったら fail-closed(halt)。自動隔離は誤爆すると operator 編集を worktree から消す(evidence は残るが)ため、機械的裏づけが完全に揃った場合のみ発動する
