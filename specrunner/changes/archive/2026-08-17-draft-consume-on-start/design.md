# Design: request lifecycle 一本化 — job start で draft を消費し resume の recopy を廃止する

## Context

request.md が 2 箇所に存在する: repo root の draft（`specrunner/drafts/<slug>.md` flat / `specrunner/drafts/<slug>/request.md` directory）と、worktree の `specrunner/changes/<slug>/request.md`。両方が正本の顔をしている。

現状の分裂点:
- `recopyDraftToChangeFolder`（`src/core/artifact/copy-artifacts.ts:146-173`）が resume のたびに draft（directory 形式のみ）を change folder へ無条件コピーして stage する。呼び出しは **4 箇所すべて resume arm**: `workspace-materializer.ts:93`（resume-existing）/ `:119`（resume-recreated & resume-without-recorded-worktree）/ `local.ts:448`（no-worktree resume, `if(!isRunPath)`）/ `managed.ts:167`（managed resume, `if(!branchName)`）。
- そのため operator が worktree の request.md を編集し `resume --apply-canon` で取り込んでも、次の resume で draft 内容に無言で巻き戻る（#1011）。
- job start（new-run / run path）は 3 箇所で request.md を change folder へ実体化する: `fs.cp` → `git add` → `git commit "add request.md for <slug>"` → `git rev-parse HEAD`（bootstrap OID を synthesizedCommits ledger に記録）。3 箇所: `workspace-materializer.ts:179-243`（local worktree）/ `local.ts:391-444`（no-worktree）/ `managed.ts:203-271`（managed, commit 後に push あり）。
- draft は start では消費されず、**archive 時に削除**される（`orchestrator.ts:261-279`。flat / directory 両形式、`git ls-files` で tracked なら削除せず警告）。
- `resolveRequestPath`（`resume/resolve-request-path.ts`）は「draft が削除済み」state を既に想定し、change-folder request.md へ fallback する。
- `cancel --restore-draft` の復元元は worktree の `changes/<slug>/request.md`（`cancel/runner.ts:145`）。draft が生存していると `skipping restore` で no-op（`:158`）。

#1011 裁定 (ii): draft は「開始前の下書き」であり、start が change folder への実体化 commit を成立させた時点で消費（削除）する。以降 `changes/<slug>/request.md` が唯一の正本、resume の recopy は廃止。走行中の request 裁定は他の保護正典と同じく worktree 編集 + `--apply-canon` に統一される。

制約:
- 消費は「実体化 commit 成立後」のみ（原子性）。commit 成立前に start が失敗したら draft を残す。
- git tracked な draft は削除せず警告（archive と同一ポリシー）。
- canonical 位置以外のファイルパスで起動した場合、そのファイルは消費しない。
- archive の draft cleanup は backstop として**挙動無変更**で残す（消費済みなら no-op）。

## Goals / Non-Goals

**Goals**:
- job start（3 runtime 経路）で実体化 commit 成立後に canonical draft（flat / directory 両形式）を消費する。
- `recopyDraftToChangeFolder` と全 4 呼び出しを削除する。
- 走行中の request 裁定を worktree 編集 + `--apply-canon` に一本化し、recopy 消滅により resume を跨いで内容が保持されることをテストで固定する。

**Non-Goals**:
- 案 B（request.md への `--apply-canon` 拒否 gate）: 不採用。
- guide 本文・fact-check attestation の stale 検出・drafts-first 起票フロー: 変更なし。
- archive の draft 削除ロジック本体の変更: しない（backstop を挙動無変更で残す）。
- 3 つの実体化ブロック（cp+add+commit+rev-parse）の共通化: 既存の重複であり本変更のスコープ外。

## Decisions

### D1: 消費 seam は各 run-path 実体化ブロックの末尾（commit 成立後）に置く

`consumeDraft(repoRoot, slug, spawn)` を、3 つの run-path 実体化ブロックそれぞれで **commit（managed は push も）が成功した後**に呼ぶ。

- `workspace-materializer.ts` new-run: bootstrap OID 記録の後（`opts?.requestFilePath` ブロック末尾）。target = `host.cwd`（repo root / main worktree）。
- `local.ts` no-worktree run path: bootstrap OID 記録の後（`if (isRunPath && opts?.requestFilePath)` ブロック末尾）。target = `this.cwd`。
- `managed.ts` run path: `git push` 成功の後（`if (opts?.requestFilePath)` ブロック末尾）。target = `this.cwd`。

**Rationale**: 契約は「削除は実体化 commit 成立後のみ」。実体化ブロック内の commit / rev-parse / push はいずれも失敗時に throw する（exitCode !== 0 → throw、worktree 経路は cleanup 後 throw）。消費呼び出しを commit より**テキスト上あとに**置けば、commit 前失敗時は制御が消費に到達せず「draft が残る」が構造的に保証される。追加の状態フラグ不要。target を repo root（worktree ではなく main working tree）にするのは、untracked な draft が main tree にのみ存在するため（archive と同じ理由）。

**Alternatives considered**:
- setupWorkspace 完了後に単一 seam で消費: run と resume を外側で再判別する必要があり結合が増える。却下。
- 3 ブロックを共通 materialize helper に統合してそこで消費: 統合自体が別リファクタ（本変更スコープ外）。却下。

### D2: 消費対象 path は slug の canonical draft 位置から導出し、`requestFilePath` からは導出しない

`consumeDraft` は slug から `specrunner/drafts/<slug>.md`（flat）と `specrunner/drafts/<slug>/`（directory）を組み立てて対象とする。start に渡された request file path は参照しない。

**Rationale**: 「canonical 位置以外のファイルパスで起動した場合そのファイルを消費しない」を無条件に満たす。非 canonical path で起動したら canonical draft 位置は空 → 消費は no-op → ユーザーのファイルは無傷。canonical draft path（flat/directory）から起動した場合は既に change folder へ cp 済みなので、source draft の削除は安全。

**Alternatives considered**:
- `requestFilePath` が drafts/ 配下を指すとき消費: ユーザーが渡した非 canonical file を削除しうる。path 判定ロジックも増える。却下。

### D3: git-tracked 判定は archive のポリシーをミラーする。archive 本体は変更しない

`consumeDraft` は flat / directory それぞれについて、存在すれば `git ls-files -- <relPath>`（cwd=repoRoot）を実行し、tracked なら削除せず警告、untracked なら `fs.rm(recursive, force)`。これは `orchestrator.ts:263-279` と同一ポリシー。archive 側のインラインループは**触らない**。

**Rationale**: tracked な draft は operator が意図して commit したもので、silent 削除は禁止。backstop（archive）は「挙動無変更」が要件であり、DRY のために working な backstop を編集すると blast radius が広がる。~15 行のポリシーループが archive と helper の 2 箇所に重複するが、要件が archive 不変を明示している以上これが最小リスク。重複は `ponytail:` コメントで明示し、3 番目の消費者が出たら統合する。

**Alternatives considered**:
- archive のループを共通 helper に抽出し archive と start で共有: backstop の挙動無変更要件と衝突するリスク。却下。

### D4: 実装配置は copy-artifacts.ts。`recopyDraftToChangeFolder` を `consumeDraft` で置換する

`consumeDraft` を `src/core/artifact/copy-artifacts.ts` に置く（`draftPath` 系 import・`fs`・`stderrWrite`・`SpawnFn` が既に揃っており、削除する `recopyDraftToChangeFolder` と同じ draft/change-folder artifact ドメイン）。`draftsDir` を追加 import する。

**Rationale**: 新規ファイルを増やさず、消える関数と同じ場所に置く（ファイル数最小）。

### 消費 hook が ADR-worthy か

lifecycle の正本を「draft → start 消費 → changes/<slug>/request.md 単一正本」へ移す判断は ADR-worthy。ADR の生成・配置は adr-gen step に委ねる（design/tasks に ADR path は書かない）。

## Risks / Trade-offs

- [Risk] managed で commit 成功後 push が失敗した場合の扱い → Mitigation: 消費を push 成功の後に置く。push 失敗時は throw して消費に到達しない = draft 残存。start 全体が成功したときのみ消費される。
- [Risk] 消費ポリシーが archive と 2 箇所に重複し将来乖離しうる → Mitigation: `ponytail:` コメントで重複と統合トリガ（3 番目の消費者）を明示。両者を同一の受け入れ挙動（flat/directory + tracked 警告）でテスト固定。
- [Risk] resume-recreated 経路は worktree 再作成時に feature branch checkout で request.md を branch から復元する（recopy 非依存）。recopy 削除で欠落しないか → Mitigation: 実体化 commit で request.md は feature branch に載っているため checkout で復元される。recopy はもともと冗長。
- [Risk] attach-from-checkpoint は元々 recopy しない（branch-borne truth）。影響なし → Mitigation: 当該 arm は変更しない。

## Open Questions

なし（#1011 裁定で設計判断は確定済み）。
