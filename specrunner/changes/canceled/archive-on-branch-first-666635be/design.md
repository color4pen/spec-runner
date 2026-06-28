# Design: archive をブランチ上で先に実行し、base への直接影響を merge のみに限定する

## Context

`job archive` は archive 記帳（change folder の `changes/<slug>` → `changes/archive/<YYYY-MM-DD>-<slug>` への git mv + job status → `archived` 遷移 + `chore: archive <slug>` commit）を **base ブランチへ直接 commit + push** する（`src/core/archive/orchestrator.ts` の Phase 1: `git checkout baseBranch` → mv → commit → `git push origin baseBranch`）。

`--with-merge` は「PR を squash merge する」処理を前段に足すだけで、merge 有無にかかわらず archive 記帳は同じ orchestrator が base を直に叩く。`runMergeThenArchive` は merge 成功後（または既 merge 検出時）に `runArchiveOrchestrator` を呼ぶ構造になっている。

この設計には非対称性がある:

- merge は CI green を待ち PR フロー（branch protection）を通って base に入るが、archive 記帳だけは PR を通らず base へ直 push される。base へ直接影響を与える経路が merge 以外に存在する（branch 規律違反）。
- base が protected で直 push が reject される環境では archive 記帳が完了できない。`--with-merge` では「PR は merged だが記帳が base に乗らない」中途半端な状態になる（ADR-20260603 が Known Debt として明記）。

状態モデルの前提:

- job 状態（state.json / events.jsonl）は change folder 配下に置かれる **branch-borne state**。pipeline 完了後の change folder は **feature branch（worktree 内）** に存在し、base には merge されるまで現れない。
- 機械ローカルメタデータ（liveness / managed marker）は `.specrunner/local/<slug>/` に sidecar として置かれる。
- status lifecycle は `running → awaiting-archive`（pipeline 完了, PR open）→ `archived`（terminal）。`archived` / `canceled` のみ terminal。
- `archive-change-folder.ts` / `commit-archive.ts` / `derive-usage.ts` は `cwd` 引数で動作ディレクトリを受け取り、相対パスで git を実行する（動作ディレクトリを worktree に向ければ feature branch 上で記帳できる）。

## Goals / Non-Goals

**Goals**:

- merge なしの `job archive` が base に対する `git checkout` / `git commit` / `git push` を一切行わず、archive 記帳を **feature branch 上で commit し remote feature branch へ push** する。記帳は既存 feature PR に相乗りする。
- `--with-merge` が「feature branch に記帳を乗せる → CI green を待つ → PR を squash merge する → cleanup」の順で動作し、base への到達経路を PR merge のみに限定する。
- worktree / feature branch の cleanup を **merge 完了後にのみ** 実行する。
- status lifecycle に「記帳済み・未 merge」段階を新設し、`archived`（terminal）には merge が事実になった後にのみ到達する不変を保つ。
- 冪等性: 記帳済みなら再実行 no-op、merged 済みなら cleanup のみ、中断後の再実行で回復可能。

**Non-Goals**:

- dated-archive 命名規則 `<YYYY-MM-DD>-<slug>`（ADR-20260521）は変更しない。
- archive 専用 PR（2-PR モデル）には戻さない（ADR-20260502 の逆行）。
- merge 方式（squash）は変更しない。
- archive 記帳を git commit にせず status フラグのみで表現する案（物理移動の廃止）は扱わない。
- protected-paths merge guard / merge-wait timeout 等の既存 merge gate ロジックの仕様変更は行わない（実行順序の中での位置のみ調整する）。

## Decisions

### D1: archive 記帳を feature branch（worktree）上で実行する `recordArchiveOnBranch` を新設する

orchestrator の Phase 1 を `recordArchiveOnBranch` として再定義する。動作ディレクトリ `workdir` を **feature branch がチェックアウトされた場所**（worktree mode: 解決した worktreePath、`--no-worktree` mode: cwd）に向け、その上で記帳する:

1. `git checkout <featureBranch>`（worktree mode では worktree が既に feature branch のため no-op 相当 / no-worktree mode では cwd を feature branch へ。**base へは checkout しない**）
2. `deriveAndWriteUsage`（usage.json を change folder に書く。mv 前）
3. `archiveChangeFolder`（`changes/<slug>` → `changes/archive/<date>-<slug>` の git mv、`workdir` 上）
4. `markJobArchiveRecorded`（status → `archive-recorded`、`workdir` を stateRoot として解決）
5. draft 削除の stage + `git add specrunner/changes/`
6. `commitArchive`（`chore: archive <slug>`）
7. `git push origin <featureBranch>`

base に対する `git checkout` / `git commit` / `git push` は一切行わない。GitHubClient port にも依存しない（client-closed を維持）。

**no-worktree mode のブランチ切り替えシーケンス**: step 1 の `git checkout <featureBranch>` を実行する前に `git status --porcelain` で uncommitted changes がないことを確認する。uncommitted changes が残る場合は escalation で停止する（cwd の working tree を壊さないための前提）。recordArchiveOnBranch が完了した時点（commit + push 後）で cwd は feature branch 上の clean state になる。`--with-merge` の場合、続く `cleanupAfterMerge` が cwd で `git checkout <base>` を行う（feature branch → base という 2 回のブランチ切り替えが cwd 上で発生する）。

**Rationale**: 既存 step（`archiveChangeFolder` / `commitArchive` / `deriveAndWriteUsage`）は `cwd` 引数で動作ディレクトリを受けるため、向き先を worktree へ替えるだけで feature branch 上の記帳に転用できる。記帳コミットを feature branch に乗せれば、base への到達は PR merge 1 経路に収束する。

**Alternatives considered**:
- base 上で記帳して直 push（現状維持・却下A）: branch 規律違反、protected base で完了不能。
- cwd で feature branch を checkout して記帳し base に戻す: cwd の working tree state を破壊するリスクがあり、worktree という既存の隔離機構を無視する。worktree（feature branch がチェックアウト済み）上で動かす方が自然。

### D2: cleanup（worktree 撤去 + branch 削除 + terminal 遷移）を `cleanupAfterMerge` に分離し、merge 確定後にのみ実行する

orchestrator の Phase 2 を `cleanupAfterMerge` として独立させ、merge が事実になった経路からのみ呼ぶ:

1. `git checkout <base>` + `git pull --ff-only`（merge 済みの archived folder を cwd の base checkout に materialize する）。pull 失敗（ネットワーク断等）は非致命的エラーとして扱い、処理を continue して step 2 の状態書き込みを試みる（base checkout が古くても `changes/archive/<date>-<slug>/` が既に存在していれば `markJobArchived` の書き先を解決できる）。pull 失敗は警告ログを出力し、再実行で回復可能な旨をユーザーに伝える。
2. `markJobArchived`（status `archive-recorded` → `archived`。cwd を stateRoot として解決。**local 編集のみ。base への commit/push は行わない**）
3. worktree remove + prune（worktree mode のみ）
4. liveness / managed marker / sidecar dir の削除（best-effort）
5. feature branch 削除（local `git branch -D` + remote `git push origin --delete`、best-effort）

**Rationale**: 要件4「cleanup は merge 完了後にのみ」を構造で保証する。merge を伴わない `job archive` では PR が生きているため worktree も feature branch も残す（記帳の再 push / 追加修正の余地を残す）。terminal `archived` の状態書き込みは local working tree への編集に留め、base への mutation（commit/push）を発生させない。

**Alternatives considered**:
- cleanup を no-merge 経路でも実行: 要件4違反。PR がまだ open なのに branch を消すと PR が壊れる。
- terminal `archived` を base に commit/push: 要件3違反（base への直接影響を再導入）。

### D3: status lifecycle に `archive-recorded`（記帳済み・未 merge）を新設する

`JobStatus` に `archive-recorded` を追加し、VALID_TRANSITIONS を以下に変更する:

```
awaiting-archive → { archive-recorded, archived, canceled }
archive-recorded → { archived, canceled }
```

- `awaiting-archive → archive-recorded`: `recordArchiveOnBranch` が記帳を feature branch に乗せた段階。
- `archive-recorded → archived`: merge が確定した段階（`cleanupAfterMerge`）。
- `awaiting-archive → archived` のエッジは **残す**（外部 merge を検出した `reconcilePrState` 等、merge が既に事実である経路のみが使う）。**ただし、この遷移は status 整合のみを行い change folder の移動を伴わない**。`reconcilePrState` が `awaiting-archive → archived` を適用した場合、change folder は `changes/<slug>/` に残ったまま（`changes/archive/` に移動されない既知の不整合）。この folder 後追い移動は base 直編集を要するためスコープ外（[Q2]）。

TERMINAL_STATUSES は `{ archived, canceled }` のまま（`archive-recorded` は非 terminal）。`markJobArchived` を 2 関数に分割する:
- `markJobArchiveRecorded(slug, stateRoot)` → `archive-recorded` 遷移（idempotent: 既に `archive-recorded` なら no-op）。
- `markJobArchived(slug, stateRoot)` → `archived` 遷移（idempotent: 既に `archived` なら no-op）。merge 確定経路のみが呼ぶ。

`assertJobFinishable` は `canTransition(status, "archived")` のまま変更不要（`awaiting-archive` / `archive-recorded` の双方が archived へ遷移可能なため finishable 判定が成立する）。

**Rationale**: 要件5の不変「`archived` には merge が事実になった後にのみ到達する（archived かつ未 merge を作らない）」を、(a) `archive-recorded` という中間状態と、(b) `archived` への遷移を merge 確定経路に限定する制御フローの二重で保証する。`awaiting-archive → archived` エッジを残すのは、外部 merge 検出という「merge が既に事実」の経路の互換のため（エッジ削除ではなく呼び出し側のゲートで不変を担保する）。

**`archived` の永続化先**: terminal `archived` は `cleanupAfterMerge` が cwd の base checkout（merge を pull 済み）の `changes/archive/<date>-<slug>/state.json` へ書く（案A 採用・[Q1] 解決済み）。これは local working tree の編集であり、base への commit/push を伴わない。branch-borne state（merge で base に入った値）は `archive-recorded` のまま残り、terminal `archived` は記帳を行った機械の local 観測として上書きされる。`ps --all`（includeArchived）は local の `archived` を読む。

**Alternatives considered**:
- 既存 `awaiting-merge` 名を再利用: schema.ts の load 時 remap `awaiting-merge → awaiting-archive` に飲み込まれるため不可。
- 中間状態を設けず status は `awaiting-archive` のまま git facts で冪等性を表現: 要件5が明示的に lifecycle 上での区別を要求しており、不変を型で表現できない。
- `archived` を `.specrunner/local/<slug>/` の専用 marker に書き list() を拡張: list() への波及が大きい。base checkout への local 編集の方が変更面が小さい（[Q1] で案A 採用として確定済み）。

### D4: `JobStatus` を消費する全箇所に `archive-recorded` を反映する（動的列挙）

enum 追加に伴い、`JobStatus` を switch / Set で分岐する箇所を静的集合でなく網羅的に列挙して更新する:

- `src/state/schema.ts`: union 型 + `VALID_STATUSES` 配列。
- `src/state/lifecycle.ts`: `VALID_TRANSITIONS`（`archive-recorded` 行追加 + `awaiting-archive` 行更新）。`TERMINAL_STATUSES` は不変。
- `src/cli/command-registry.ts`: `--status` フィルタの values。
- `src/cli/ps.ts`: PR open 扱いの表示（`awaiting-archive` と同様に `archive-recorded` も PR open hint 対象）。
- `src/core/cancel/runner.ts`: 「PR open のため --force 必要」ガードに `archive-recorded` を含める。
- `src/core/doctor/checks/storage/orphan-sidecars.ts`: `ACTIVE_STATUSES`（PR 生存中は sidecar を orphan 扱いしない）に `archive-recorded` を含める。
- `src/state/reconcile.ts`: `reconcilePrState` を `awaiting-archive` に加え `archive-recorded` でも merged 検出時に `archived` へ遷移できるよう拡張する。

**Rationale**: enum 追加は静的に追える分岐以外に Set / 配列ベースの動的判定が散在する。漏れると `ps` に出ない・cancel が誤動作する等の silent な不整合を生むため、消費箇所を網羅列挙して同時更新する。

### D5: `runMergeThenArchive` の実行順序を「記帳 → wait → merge → cleanup」へ再構成する

`--with-merge` フローを以下に変更する:

1. job state load → PR number 解決。
2. `getPullRequest` + `state.status` 確認。PR が既に `MERGED` の場合:
   - `state.status === "archive-recorded"`（記帳済み）→ `cleanupAfterMerge` のみ実行して終了（冪等再実行）。
   - `state.status === "awaiting-archive"`（記帳未実施）→ 早期 return せず、以降のステップを継続する:
     - (a) feature branch が remote に存在するなら `recordArchiveOnBranch` を実行してから `cleanupAfterMerge` に進む（すでに merge 済みの branch への push は失敗しうるため、push 失敗は escalation で扱い手動対応ガイダンスを提示する）。
     - (b) feature branch が remote に存在しない（PR merge 後に削除済み）なら escalation を返し、ユーザーに手動での folder 移動と状態更新を促す。
3. `recordArchiveOnBranch`（記帳を feature branch へ commit + push。idempotent: 記帳済みなら no-op）。
4. protected-paths merge guard（既存ロジック。記帳 commit 後の changed files を評価）。
5. CI green の wait loop（記帳 push で head SHA が変わるため、新 head の checks を待つ。既存ループは毎回 head SHA を再取得するため自然に追従）。
6. `checkMergeableForMerge` + squash merge。
7. merge 成功 → `cleanupAfterMerge`。

**no-worktree mode のブランチ切り替えシーケンス（step 3 → step 7）**: no-worktree mode では step 3（`recordArchiveOnBranch`）が cwd を feature branch へ切り替え（`git checkout <featureBranch>`）、commit・push が完了した時点で cwd は feature branch 上の clean state になる。step 7（`cleanupAfterMerge`）が続いて cwd を `git checkout <base>` で base に戻す。この feature branch → base の 2 回切り替えが cwd 上で連続して発生する。uncommitted changes が存在する場合は step 3 の入口で検出して escalation する（D1 参照）。

**Rationale**: 記帳を merge 前に push することで、feature 変更と archive 記帳が 1 回の squash merge で同時に base へ入る（要件2）。記帳 push が PR head を更新するため CI は再走し、新 head の green を待ってから merge する。cleanup を merge 成功後に置くことで要件4を満たす。`state.status` を確認することで、「PR が外部 merge 済みかつ記帳未実施」のケースで cleanupAfterMerge のみに落ちて folder 移動がスキップされる不整合を防ぐ（旧実装の動作を維持）。

**Alternatives considered**:
- 記帳を wait/merge の後に置く（現状の呼び出し位置）: 記帳が merge に乗らず base へ別経路で入る必要が生じ、要件1/3に反する。

### D6: ADR-20260603 を supersede する新 ADR を生成する

本変更は ADR-20260603 が確立した「archive を GitHub merge から切り離し client-closed・offline・決定的に完走させる」性質を一部後退させる（記帳の remote feature branch push、`--with-merge` の merge 待ち結合）。この後退を「base への直接影響を merge のみに限定する branch 規律」を上位要件に置く判断として明文化し、ADR-20260603 を supersede する新 ADR を adr-gen step で生成する。

**Rationale**: 振る舞い契約（archive の到達経路・client-closed 性質）を変えるため ADR が必要（`request.adr === true`）。後退の受容根拠と status lifecycle 再設計を記録に残す。

## Risks / Trade-offs

- [client-closed 性質の後退] no-merge `job archive` も remote feature branch への push を要するため、完全 offline では完走できなくなる。→ push 失敗は escalation（再実行ガイダンス付き）で扱い、記帳 commit は local には残るため再実行で回復する。ADR で受容根拠を明記。
- [terminal `archived` が base に commit されない（local 編集のみ）] merge 後の cleanup が cwd の base checkout に未 commit の状態編集を残す。→ branch-borne の `archive-recorded` は整合を保ち、`archived` は機械 local の terminal 観測。dirty tree は既知のトレードオフとして受容（[Q1] 解決済み・案A 採用）。
- [protected-paths guard の対象拡大] 記帳 commit で changed files に `specrunner/changes/...` の move が加わる。`specrunner/**` を protectedPaths に含む設定では新たに merge がブロックされ得る。→ 通常 protectedPaths は `src/` 等を対象とするため低リスク。spec-review で確認。
- [外部 merge × 未記帳の不整合] feature PR を `job archive` 前に外部 merge すると、change folder が base に active（`changes/<slug>/`）のまま入る。`reconcilePrState` の status flip だけでは folder が archive/ に移動しない。→ 既存からの corner case。本 request では status 整合（merged → archived 遷移）のみ扱い、未記帳 PR の folder 後追い移動は base 直編集を要するためスコープ外（[Q2]）。
- [no-worktree mode の動作ディレクトリ] no-worktree では cwd 自体が feature branch。記帳は cwd（feature branch）で、cleanup の base checkout も cwd で行う。merge 経路の base checkout は許容（要件1の禁止は no-merge 経路のみ）。

## Open Questions

- **Q1 [解決済み]**: terminal `archived` の永続化先。案A = merge 後 cwd の base checkout（pull 済み）の `changes/archive/<date>-<slug>/state.json` を local 編集。案B = `.specrunner/local/<slug>/` の terminal marker + `JobStateStore.list()` 拡張。**→ 案A を採用**（理由: 変更面最小、`list()` 拡張不要、`ps --all` は既に local ファイルシステムを直読みしているため動作モデルが一貫する、terminal `archived` は「このマシンが merge を確認した」というローカル観測であり git commit 不要）。dirty tree（base checkout に未 commit の state 編集が残る）は既知のトレードオフとして受容する。案B は採用しない。
- **Q2**: `job archive` 未実行のまま外部 merge された PR の reconcile 挙動。本 request は status 整合のみ扱い、folder 後追い移動はスコープ外とする方針でよいか。
- **Q3**: no-merge `job archive` の push 先 remote feature branch が削除済み（PR は open のままだが branch だけ消えた）等の異常系で、push 失敗をどこまで自動回復するか（現状は escalation 提示で十分か）。

## Migration Plan

- 既存の永続化済み state（`awaiting-archive` / `archived`）はそのまま有効。新 status `archive-recorded` は本変更後に `job archive` を実行した job から発生する。schema の load 時 remap 追加は不要。
- 進行中（`awaiting-archive`）の job が本変更後に `job archive` されると新フロー（feature branch 記帳）で処理される。base に旧来の直 push で記帳済みの job は terminal `archived` のため no-op で互換。
- rollback: 本変更を revert すれば旧 orchestrator（base 直 push）に戻る。`archive-recorded` 状態の job が残っている場合は revert 後の `job archive` 再実行で base 直 push 経路により完了する（status remap は不要だが、未知 status 弾きを避けるため revert 時は `archive-recorded → awaiting-archive` の load 時 remap を一時的に足すことを検討）。
