# request lifecycle の一本化: job start で draft を消費し、resume の draft recopy を廃止する

## Meta

- **type**: spec-change
- **slug**: draft-consume-on-start
- **base-branch**: main
- **adr**: true

## 背景

request.md が 2 箇所（repo root の `specrunner/drafts/` と worktree の `specrunner/changes/<slug>/request.md`）に存在し、どちらも正本の顔をしている。draft は走行中も生存し、resume のたびに worktree 側へ再コピーされるため、operator が worktree 側の request.md を `--apply-canon` で裁定反映しても次の resume で draft の内容に無言で巻き戻る（#1011）。さらに resume の prepare が gate より前に request.md を parse して持ち回るため、同一 run 内で「parse 済みの新 request を見る消費者」と「ディスクの旧 request を見る消費者」が併存する split-brain も成立する。

#1011 の裁定に基づき、lifecycle を一本化する: **draft は「開始前の下書き」であり、job start が change folder への実体化を完了した時点で消費（削除）する。以降 `changes/<slug>/request.md` が唯一の正本**となり、resume の再コピーは廃止する。走行中の request 裁定は他の保護正典と同じく worktree 編集 + `--apply-canon` に統一される。

## 現状コードの前提

- `recopyDraftToChangeFolder`（`src/core/artifact/copy-artifacts.ts:146-173`）が resume のたびに `draftPath(slug)` = `specrunner/drafts/<slug>/request.md`（**directory 形式のみ**。flat 形式 `drafts/<slug>.md` は `fs.access` 失敗で no-op）を worktree の `changes/<slug>/request.md` へ無条件コピーして stage する。呼び出しは 4 箇所: `src/core/runtime/workspace-materializer.ts:93,119` / `src/core/runtime/local.ts:448` / `src/core/runtime/managed.ts:167`
- attach-from-checkpoint 経路は recopy しない（`workspace-materializer.ts:123-126` に「branch-borne truth を上書きしない」と明記）
- draft は job start では消費されず、**archive 時に削除**される（`src/core/archive/orchestrator.ts:261-270`。flat / directory 両形式対応、git tracked な draft は削除せず警告）
- job start は指定された request file を change folder へ実体化して stage し（`workspace-materializer.ts:179-197`）、pipeline の初回 commit「add request.md for <slug>」で feature branch に載る
- `protectedCanonPaths` は request.md を含む（`src/core/step/write-scope.ts:62-70`）— `--apply-canon` は request.md の dirty を受理して operator-apply commit を作るが、次の resume の recopy に上書きされる
- resume の prepare は gate 群より前に request.md を parse し（`src/core/command/resume.ts:273-282`、`resolveRequestPath` は worktree 優先 = `src/core/resume/resolve-request-path.ts:38`）、`PrepareResult.request` として pipeline に渡す。design step はディスクを再読する（`src/core/step/design.ts:111`）
- `cancel --restore-draft` の復元元は worktree の `changes/<slug>/request.md`（`src/core/cancel/runner.ts:145`）。draft が生存している場合は「draft already exists; skipping restore」で no-op（`cancel/runner.ts:158`）
- `resolveRequestPath` は「draft が削除済み」の state を既に想定している（`resume.ts:273` 付近のコメント）
- inbox は `specrunner/drafts/<slug>/request.md`（directory 形式）へ writeDraft してから start する（`src/core/inbox/run-inbox.ts:397-400`）
- resume-recreated 経路の worktree 再作成は feature branch の checkout で request.md を branch から復元する（recopy に依存しない）
- recopy の挙動を pin する既存テスト: `tests/unit/util/copy-artifacts.test.ts` の TC-RECOPY-001〜005（5 本）

## 要件

1. **job start での draft 消費** — change folder への request.md 実体化とそれを含む commit の成立**後**に、canonical draft 位置（flat `specrunner/drafts/<slug>.md` / directory `specrunner/drafts/<slug>/` の両形式）の draft を削除する。順序契約（原子性）: 削除は commit 成立後のみ。start がそれ以前に失敗した場合は draft を残す。git tracked な draft は archive の現行ポリシーと同様に削除せず警告する。canonical 位置以外のファイルパスで起動した場合、そのファイルは消費しない
2. **resume の draft recopy 廃止** — `recopyDraftToChangeFolder` と全 4 呼び出しを削除する
3. **走行中の request 裁定の一本化** — worktree の request.md 編集 → `resume --apply-canon` → operator-apply commit → 後続の resume・step でその内容が保持され、prepare の parse 結果とディスクの request.md が一致する（recopy 消滅により構造的に成立することをテストで固定する）
4. **cancel --restore-draft の意味の成立** — draft 消費後の cancel で worktree の request.md から draft が復元される（既存実装の pin。draft 生存による skipping-restore 警告は通常経路でなくなる）
5. **inbox 経路の整合** — inbox の writeDraft → start 経路でも消費が働く（directory 形式）
6. **archive の draft cleanup は backstop として残す** — 消費済みなら no-op（挙動無変更）

## スコープ外

- 案 B（request.md に対する `--apply-canon` の拒否 gate）— #1011 の裁定 (ii) により不要・不採用
- guide 本文の変更 — 現行の「保護正典は worktree 編集 + `--apply-canon`」の案内は本変更後 request.md に対しても正しくなるため変更不要
- fact-check attestation の stale 検出（requestHash 不一致 → design が再検証を強制）の挙動変更 — 既存の歯をそのまま request 変更の再検証 gate として使う
- drafts-first の起票フロー自体（template → validate → start）の変更

## 受け入れ基準

- [ ] job start 成功後、canonical draft（flat / directory 両形式それぞれ）が削除されていることをテストで固定する
- [ ] start が実体化 commit の成立前に失敗した場合、draft が残ることをテストで固定する
- [ ] git tracked な draft は削除せず警告することをテストで固定する（archive と同じポリシー）
- [ ] `recopyDraftToChangeFolder` が存在せず、resume 経路（workspace-materializer / local / managed）に draft からのコピーが無いことをテストまたは機械検証で固定する
- [ ] operator が worktree の request.md を編集して `--apply-canon` で取り込んだ後、後続 resume で内容が draft に巻き戻らないことをテストで固定する
- [ ] `cancel --restore-draft` が worktree の request.md から draft を復元することをテストで固定する
- [ ] 旧挙動の pin テスト TC-RECOPY-001〜005（`tests/unit/util/copy-artifacts.test.ts`）は関数削除と同時に削除してよい。それ以外の既存テストは無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **(ii) start 消費を採用**（#1011 裁定）: cancel --restore-draft は現行実装でも worktree 側から復元しており（draft 生存時はむしろ skipping-restore で no-op）、`resolveRequestPath` は draft 削除済み state を既に想定している — システムの半身は既にこの世界を生きている。lifecycle も `draft → request.md → spec → …` と自然になる
- **案 (i)（draft 真正本 + changes 側を materialized copy と明示・編集禁止）は却下**: 走行中の二重正本を維持し続ける割に、restore 用途は実装上とっくに worktree 起点であり、draft を生かす理由が残らない
- **operator 所有の保全**: 走行後の request.md 変更は `--apply-canon` という operator 明示操作でのみ入り、内容が変われば attestation の requestHash 不一致で design が再検証を強制する。所有権は保たれ、変わるのは置き場所だけ
- **消費の hook 点は「実体化 commit 成立後」の契約のみ規定**し、実装 seam の選定は design に委ねる（start 失敗時に draft が残ることが検証可能であればよい）
