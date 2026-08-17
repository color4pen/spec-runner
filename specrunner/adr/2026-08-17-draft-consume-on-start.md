# ADR-20260817: draft は job start 時に消費し、`changes/<slug>/request.md` を唯一の正本とする

**Date**: 2026-08-17
**Status**: accepted

Follows: [ADR-20260723-operator-canon-apply-on-resume](2026-07-23-operator-canon-apply-on-resume.md)

## Context

`request.md` が 2 箇所に存在し、両方が正本の顔をしていた:

1. **draft**: `specrunner/drafts/<slug>.md`（flat）/ `specrunner/drafts/<slug>/request.md`（directory）
2. **materialized copy**: `specrunner/changes/<slug>/request.md`

この二重正本が 2 つの障害経路を生んでいた（#1011）。

**経路 1: operator 編集の無言巻き戻し**  
`recopyDraftToChangeFolder` が resume のたびに draft（directory 形式のみ）を
change folder へ無条件コピー・ステージしていた（4 呼び出し箇所:
`workspace-materializer.ts:93,119` / `local.ts:448` / `managed.ts:167`）。
そのため ADR-20260723 の `--apply-canon` で operator が worktree の `request.md` を
取り込んでも、次の resume で draft 内容に無言で巻き戻る。`protectedCanonPaths` が
`request.md` を含む（`write-scope.ts:62-70`）ため `--apply-canon` は正しく機能するが、
直後の recopy がその commit を上書きする。

**経路 2: 同一 run 内の split-brain**  
`resume.ts:273-282` の prepare が gate 群より前に `request.md` を parse して
`PrepareResult.request` として pipeline に渡す。recopy はその後に走るため、
「parse 済みの新 request を見る消費者」と「ディスクの旧 request を見る消費者」が
同一 run 内に併存する状態が成立しうる。

**既に半身が別の世界を生きていた**  
- `resolveRequestPath`（`resume/resolve-request-path.ts:38`）は draft が削除済みの
  state を既に想定し、change-folder の `request.md` へ fallback する設計になっていた。
- `cancel --restore-draft` は worktree の `changes/<slug>/request.md` を復元元とする
  （`cancel/runner.ts:145`）。draft が生存していると `skipping restore` で no-op に
  なるため、むしろ draft が消えている状態の方が正しく動作する。
- resume-recreated 経路は feature branch の checkout で `request.md` を復元する（recopy 非依存）。

draft が archive 時に削除される（`orchestrator.ts:261-270`）以外は、システムの実装の
多くが「draft は開始時点で役割を終えた」という世界観で書かれていた。

## Decision

### D1: draft は「開始前の下書き」と定義し、job start が change folder への実体化 commit を成立させた時点で消費（削除）する

**採用理由**: lifecycle が `draft → start 消費 → changes/<slug>/request.md 単一正本` と
自然に一本化される。実装上すでにこの設計を前提とするコードが多数存在しており、
draft の生存が障害の根本原因だった。

**却下案 (i) — draft を真正本として維持し changes/ 側を materialized copy と明示**:
走行中の二重正本を維持し続ける割に、restore 用途は実装上とっくに worktree 起点であり、
draft を生かす実利的理由が残らない。さらに `--apply-canon` が changes/ 側を正典として
動作している事実と矛盾する。却下。

### D2: 消費の順序契約 — 削除は実体化 commit 成立後のみ

`consumeDraft(repoRoot, slug, spawn)` を 3 つの run-path 実体化ブロックそれぞれで
commit（managed は push も）が成功した後に呼ぶ。

- `workspace-materializer.ts` new-run: `appendSynthesizedCommit` の後
- `local.ts` no-worktree run path: bootstrap OID 記録の後
- `managed.ts` run path: `git push` 成功の後

commit / rev-parse / push はいずれも失敗時に throw する。`consumeDraft` 呼び出しを
commit より**テキスト上後に**置くことで、commit 前失敗時は制御が消費に到達せず
「draft が残る」が構造的に保証される。追加の状態フラグは不要。

managed では push 失敗時も消費に到達しないため、push-before-consume の順序が
両方の失敗モードをカバーする。

### D3: 消費対象は slug の canonical draft 位置から導出し、start に渡した requestFilePath からは導出しない

`consumeDraft` は slug から `specrunner/drafts/<slug>.md`（flat）と
`specrunner/drafts/<slug>/`（directory）を組み立てて対象とする。

**採用理由**: 「canonical 位置以外のファイルパスで起動した場合そのファイルを消費しない」
を無条件に満たす。非 canonical path で起動したら canonical draft 位置は空 → 消費は
no-op → ユーザーのファイルは無傷。canonical draft から起動した場合は既に change folder
へ cp 済みなので source draft の削除は安全。

**却下案**: `requestFilePath` が `drafts/` 配下を指すとき消費 → ユーザーが渡した
非 canonical file を削除しうる。path 判定ロジックも増える。却下。

### D4: git-tracked な draft は削除せず警告する（archive と同一ポリシー）

`consumeDraft` は `git ls-files -- <relPath>`（cwd=repoRoot）で tracked 判定し、
tracked なら削除せず `stderr` に警告、untracked なら `fs.rm(recursive, force)` で削除する。
`orchestrator.ts:263-279` と同一ポリシー。

**採用理由**: tracked な draft は operator が意図して commit したもので、silent 削除は禁止。
archive backstop との一貫性を保つ。

### D5: archive の draft cleanup は backstop として挙動無変更で残す

`src/core/archive/orchestrator.ts` の draft 削除ループは変更しない。
start 時に消費済みの場合は no-op（flat / directory とも存在しないため skip）。
まだ消費されていない draft が archive 時点まで残っていた場合のセーフネットとして機能する。

**採用理由**: 要件が「backstop 挙動無変更」を明示しており、働いている backstop を
DRY のために編集すると blast radius が広がる。ポリシーループは `consumeDraft` と
archive の 2 箇所に重複するが、archive が backstop として独立していることの方が重要。
3 番目の消費者が出たら共通 helper に統合する。

### D6: `recopyDraftToChangeFolder` と全 4 呼び出しを削除する

resume path（workspace-materializer / local / managed）に存在した
`recopyDraftToChangeFolder` の呼び出しを全件削除し、関数本体も削除する。
attach-from-checkpoint 経路は元々 recopy しない（branch-borne truth 保護）ため変更なし。

**採用理由**: draft 消費後は worktree の `request.md` が唯一の正本であり、
draft からの recopy は定義上不正な上書き。削除することで split-brain が構造的に
成立しなくなる。

### D7: 実装配置は `src/core/artifact/copy-artifacts.ts`

`consumeDraft` を `copy-artifacts.ts` に置く（`draftPath` 系 import・`fs`・`stderrWrite`・
`SpawnFn` が既に揃っており、削除する `recopyDraftToChangeFolder` と同じ draft/change-folder
artifact ドメイン）。新規ファイルは増やさない。

## Alternatives Considered

### A1: 案 (i) — draft を真正本として維持し、`changes/<slug>/request.md` を materialized copy と明示・編集禁止にする

draft を lifecycle 終了まで正本として保持し、change folder 側を「draft の写し」と
位置付ける案。走行中の `request.md` 変更は draft 側のみで行う。

- **Pros**: draft が常に正本であり lifecycle が単純に見える。`cancel --restore-draft` の
  「draft から復元」というセマンティクスが語義通りになる。
- **Cons**: 走行中の二重正本が継続する。`cancel --restore-draft` は実装上すでに
  worktree の `changes/<slug>/request.md` を復元元としており（`cancel/runner.ts:145`）、
  draft が生存しているとむしろ `skipping restore` で no-op になる。`resolveRequestPath` も
  draft 削除済み state を想定した設計になっている。changes/ 側「編集禁止」にするには
  write-scope に追加 gate が必要で、`--apply-canon` フローとも衝突する。
- **Why not**: restore 用途は実装上とっくに worktree 起点であり、draft を生かす実利的
  理由が残らない。changes/ 側を編集禁止にすることは ADR-20260723 の `--apply-canon`
  設計と正面から衝突し、退行になる。#1011 裁定で明示的に却下された。

### A2: 案 B — request.md への `--apply-canon` 拒否 gate を設ける

走行中の `request.md` 変更を `--apply-canon` で取り込む際に拒否 gate を設け、
変更の二重正本問題を「変更禁止」で解消する案。

- **Pros**: 走行中の request 変更を機械的にブロックできる。
- **Cons**: operator が走行中に request を裁定で修正したい正当なユースケースがある
  （spec 修正フローと同様）。`--apply-canon` は既に機能しており、gate は退行。
- **Why not**: #1011 裁定 (ii) により不採用。request.md を他の保護正典と同じ扱いにし、
  `--apply-canon` による operator 裁定を維持する方が正しい。

### A3: start / resume の 3 つの実体化ブロックを共通 materialize helper に統合し、そこで消費する

3 箇所の `fs.cp → git add → git commit → rev-parse` 重複を統合し、
そこで `consumeDraft` を一回呼ぶ案。

- **Pros**: 消費呼び出しが 1 箇所になる。
- **Cons**: 統合自体が別リファクタリング（workspace-materializer / local / managed の
  3 runtime の実体化ブロックには、それぞれの経路固有の処理が絡んでいる）。
  本変更のスコープを大幅に超える。
- **Why not**: 本変更は「消費の追加」と「recopy の削除」の最小 diff で完結すべき。
  統合リファクタリングは別 request として行う。

## Consequences

### Positive

- resume を跨いだ operator 裁定（`--apply-canon`）が正しく機能するようになった。
  recopy が消滅したため、構造的に split-brain が成立しなくなった。
- `request.md` のライフサイクルが `draft → start 消費 → changes/<slug>/request.md
  単一正本` と自然に一本化された。
- `cancel --restore-draft` が通常経路で `skipping restore` に陥らなくなった
  （draft は start 時点で消費済みのため、restore が正しく working する）。
- `resolveRequestPath` の「draft 削除済み想定」と `cancel --restore-draft` の
  「worktree 起点 restore」が、仕様として明示的に正当化された。

### Negative

- draft が start 後に存在しなくなるため、start 後に draft path を直接参照する外部
  スクリプトは壊れる。ただし canonical draft path は slug から一意に導出されており、
  実際の利用は start 前（template → validate → start フロー）に限られる。
- archive の draft 削除ループと `consumeDraft` にポリシーコードが重複する
  （flat/directory + tracked 警告の 2 箇所）。3 番目の消費者が出るまでは意図的重複。

### Known Debt

- `consumeDraft` のポリシーループが `orchestrator.ts:263-279` と 2 箇所に重複する。
  3 番目の消費者が現れたら共通 helper に抽出する（`ponytail:` コメントで明示済み）。
- managed runtime の `commit 成功後 push 失敗` 経路は draft 残存が正しい挙動だが、
  push 失敗後に operator が start をリトライする際の挙動（change folder に既に
  `request.md` が存在する場合）は別途検討が必要。
- inbox 経路（`writeDraft → start`、directory 形式）は TC-011 で integration test が
  `should` 扱い。本 ADR の要件（要件 5: inbox 経路の整合）は unit レベルで検証済みだが、
  end-to-end の inbox パス確認は別途行う。

## References

- Request: `specrunner/changes/draft-consume-on-start/request.md`
- Design: `specrunner/changes/draft-consume-on-start/design.md`
- Spec: `specrunner/changes/draft-consume-on-start/spec.md`
- Implementation: `src/core/artifact/copy-artifacts.ts`（`consumeDraft`）/
  `src/core/runtime/workspace-materializer.ts` / `src/core/runtime/local.ts` /
  `src/core/runtime/managed.ts`
- Related: [ADR-20260723-operator-canon-apply-on-resume](2026-07-23-operator-canon-apply-on-resume.md)
  — `--apply-canon` が resume 入口で正しく機能するようになった前提（本 ADR が recopy 削除で完結させる）
- Issue: #1011（二重正本・split-brain の根本原因分析と裁定）
