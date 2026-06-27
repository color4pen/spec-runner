# Design: cancel-canceled-dir

## Context

`specrunner job cancel`（`src/core/cancel/runner.ts` の `cancelSingleJob`）は現在、片付けと記録の順序が逆転しており、キャンセルの事実そのものが消える破壊的挙動を持つ。

- `cancelSingleJob` の処理順は **kill → restore-draft → cleanup（worktree 撤去 + branch 削除）→ canceled state persist**（runner.ts:283-305）。
- canceled state の保存先は `resolveStateStoreByJobId(...)`（runner.ts:302）で解決する。local 実行のジョブは state が worktree 内（`<worktreePath>/specrunner/changes/<slug>/state.json`、branch-borne）にしか存在しないため、cleanup で worktree を撤去した**後**には書き込み先が消えている。`resolveStateStoreByJobId` は step 1a（worktree slug dir）に失敗し、step 1b（`resolveCanonicalStateDir` = main checkout の `changes/<slug>/` または `archive/`）も該当なしで `null` を返す → persist が skip され、`USER_CANCELED` / `canceledAt` の記録が**喪失**する。
- request.md も既定では保全されない（`--restore-draft` 時のみ drafts へ戻すが、同名で skip すると消える / runner.ts:135-146）。
- `canceled` ディレクトリの概念は存在しない（完走 job は `src/core/finish/archive-change-folder.ts` で `archive/<date>-<slug>/` へ退避するが、キャンセル job には対応物が無い）。

cancel の語義は「止めて片付ける（終わり）」で正しい。worktree 撤去も branch 削除も維持する。ただし「何をいつなぜキャンセルしたか」の記録と成果物は残すべきである。本 change は、片付けを維持したまま、ジョブの change-folder を main space の `specrunner/changes/canceled/<slug>-<jobId8>/` へ退避し、キャンセル記録を確実に残す。

関連する既存実装:

- branch / worktree 命名は `<slug>-<jobId8>`（`buildWorktreePath` / `src/core/worktree/manager.ts:47-50`、`jobId.slice(0, 8)`）。`state.branch` に正確な branch 名が残る。
- change-folder の物理位置の解決順は load 系（`src/core/job-access/load-by-job-id.ts`）と同じく **worktree slug dir → canonical（active / archive）→ managed sidecar（`.specrunner/local/<slug>/`）**。
- state 永続化は `JobStateStore`（`src/store/job-state-store.ts`）。`changeDir` seam を渡すと slug 規約を介さず任意ディレクトリの `state.json` / `events.jsonl` を読み書きできる（runner.ts での退避先書き込みに利用する）。

## Goals / Non-Goals

**Goals**:

- cancel 時、worktree を撤去する**前に**ジョブの change-folder（request.md / state.json / events.jsonl / design・spec・tasks・test-cases・各 result アーティファクト）を main space の `specrunner/changes/canceled/<slug>-<jobId8>/` へ退避する。
- 退避先の state にキャンセル記録（`error.code=USER_CANCELED` / `canceledAt` / reason）を残し、worktree 撤去後も確実に残ることを保証する（記録喪失バグの解消）。
- `<slug>-<jobId8>` を一意鍵とし、同名 slug を同日に複数回 cancel しても退避先が衝突しないようにする。
- 片付けを維持する：worktree 撤去 + local/remote branch 削除（branch は残さない）。
- `--restore-draft`（opt-in で drafts へ request 復元）を存置する。

**Non-Goals**:

- `canceled/` からの直接 resume / in-place resume。再開は `canceled/` を参照材料に**新 jobId の新規 job** を起こす運用（本 change のスコープ外）。
- pause / suspend（途中状態を保つ機能。cancel とは別概念）。
- `archive/` の同種の衝突（`<date>-<slug>` に jobId 無し）の修正（別 change）。
- managed runtime での変更ファイル導出など他の confirmed findings。
- `canceled/` の `specrunner ps` / `job show` / `--all-terminated` 連携（退避済みジョブを一覧・一括操作の対象に含める機能）。現状でも cancel 後の worktree-only ジョブは `list` / jobId 解決から外れる（worktree 撤去 + marker unlink）ため、退避によって可視性が悪化することはない。一覧連携は将来の別 change とする。

## Decisions

### D1: change-folder を `specrunner/changes/canceled/<slug>-<jobId8>/` へ退避する

cleanup（worktree 撤去）の**前**に、ジョブの change-folder を main space の `specrunner/changes/canceled/<slug>-<jobId8>/` へ再帰コピーする。退避先ディレクトリ名・パスは純粋関数として `src/util/paths.ts` に追加する（`canceledChangesDirRel()` / `canceledChangeFolderPath(dirName)` / `canceledDirName(slug, jobId)`）。`archive/` と対になる「墓標 + 参照」用ディレクトリとして `changes/` 配下に位置づける。

**Rationale**: `archive/`（完走 job の退避先）と対称な命名・配置にすることで、`changes/` 配下の予約サブディレクトリ（`archive/` / `canceled/`）という一貫したメンタルモデルになる。退避先が main checkout（repoRoot）であることで、worktree 撤去後も独立に残る。

**却下案**: 何も残さず完全破棄（現挙動）。→ キャンセル記録すら消えるのは監査上不可（本 change が解消する現バグそのもの）。

### D2: 一意鍵は `<slug>-<jobId8>`（jobId 先頭 8 桁）

退避先ディレクトリ名に `jobId.slice(0, 8)` を含めて一意化する。`buildWorktreePath` / branch 命名（`src/core/worktree/manager.ts:47-50`）と同一の粒度を採用する。

**Rationale**: 同名 slug を**同日に複数回**キャンセルしても衝突しない。`state.branch`（`change/<slug>-<jobId8>`）と同じ jobId8 を含むため、退避物と元 branch の対応づけが目視で可能。

**却下案**: `<date>-<slug>`（日付のみ、`archive/` と同形式）。→ 同名 slug を同日に複数キャンセルすると衝突する（日単位の粒度では防げない）。

### D3: canceled state を退避先ディレクトリへ直接 persist する（root-cause fix）

canceled への遷移後の state を、`resolveStateStoreByJobId` ではなく **退避先ディレクトリを `changeDir` seam に指定した `JobStateStore`** で直接 persist する。書き込み先は `repoRoot/specrunner/changes/canceled/<slug>-<jobId8>/` で決定的であり、worktree の存否に依存しない。`cancelSingleJob` 内の `resolveStateStoreByJobId` 経由の persist は廃止し、未使用 import を削除する。

退避コピー（D1）で `state.json`（`_journal` カウンタ）と `events.jsonl` を持ち込んでいるため、`persist` の delta-append（runner 内 store の差分追記）は整合する。コピー元が解決できず退避先が空の場合は、`persist` が fresh write 経路で in-memory state（遷移済み）から `state.json` / `events.jsonl` を新規生成する。

**Rationale**: バグの根本原因は「書き込み先を worktree 撤去後に解決しようとする」点。書き込み先を退避先に固定することで、worktree-only ジョブでも記録喪失が起きない。`resolveStateStoreByJobId` の探索ロジックに依存しないため堅牢。

**却下案**: `resolveStateStoreByJobId` を残し persist 順序だけ cleanup の前へ移す。→ worktree-only でも persist 自体は通るが、記録が worktree 内（撤去直前）に残るだけで「main space に残す」要件を満たさない。退避と二重管理になる。

### D4: 退避元の解決は load 系と同じ順序、再帰コピーで成果物ごと退避

退避元 change-folder の物理ディレクトリは、`load-by-job-id.ts` と同じ順序で解決する。

1. worktree slug dir（`resolveWorktreePathForJob` で解決した `<worktreePath>/specrunner/changes/<slug>/`）
2. canonical（`resolveCanonicalStateDir` = active `changes/<slug>/` または `archive/<dated>/`）
3. managed sidecar（`.specrunner/local/<slug>/`）

解決できたディレクトリを退避先へ**再帰コピー**（`fs.cp`、`src/core/artifact/copy-artifacts.ts` 等で既出のパターン）する。これにより request.md / design.md / spec.md / tasks.md / test-cases / `*-result-*.md` / `events.jsonl` / `state.json` がまとめて退避される。退避はベストエフォート：コピーに失敗しても warning を積み、D3 の persist で in-memory state による記録は最低限残す。

**Rationale**: load と同じ解決順にすることで、cancel 対象になりうる全ランタイム（local / canonical / managed）で退避元を一貫して特定できる。再帰コピーは成果物の取りこぼしを防ぐ。

**却下案**: ファイル種別を列挙して個別コピー。→ 将来 result アーティファクトが増えるたびに列挙漏れのリスク。ディレクトリ単位の再帰コピーの方がロバスト。

### D5: 退避先は untracked + gitignore（main へ commit しない）

退避は純粋なファイルシステムコピーのみで行い、`git add` / commit は行わない。`.gitignore` に `specrunner/changes/canceled/` を追加し、退避物が git の追跡対象に入らないようにする（`specrunner init` が管理する `.specrunner/*` ブロックとは独立した行として追加し、当該ブロックを壊さない）。

**Rationale**: cancel は main checkout 上で branch を削除する片付けコマンドであり、PR / merge サイクルの外にある。`archive/`（finish が job branch 上で `git mv` + commit し、merge で main に入る）とは文脈が異なる。cancel から main を直接 commit すると "main を直接汚さない" 原則に反する。退避物は人間向けの「墓標 + 参照」であり、working tree 上に物理的に残れば要件（main space に退避）を満たす。machine-local なキャンセル行為であり `.specrunner/local`（gitignore 済）と同じ philosophy で扱う。

**却下案**: `archive/` と同様に `git mv` + commit。→ cancel に PR / merge の文脈が無く、main を直接汚す。

### D6: 退避と canceled persist は `status !== "canceled" && !purge` のときのみ実行

- `status === "canceled"`（冪等ケース）: 既にキャンセル済みで cleanup 済みのため、新たに退避すべき change-folder は無い。退避・persist をスキップ（cleanup と marker unlink の冪等処理のみ実行、現挙動を踏襲）。
- `--purge` 指定時: ユーザーが痕跡を残さない意図を表明している。退避（墓標生成）をスキップし、machine-local sidecar 削除のみ行う。

処理順は **kill → restore-draft（opt-in）→ 退避（コピー、cleanup 前）→ cleanup（worktree + branch 削除）→ canceled persist（退避先へ）→ marker unlink → purge** とする。退避コピーは worktree 撤去前（退避元がまだ存在する間）に行い、persist は退避先（worktree 非依存）へ行うため cleanup 後でも安全。

**Rationale**: 冪等性と `--purge` の既存セマンティクス（痕跡を残さない discard）を維持しつつ、退避をそれらと矛盾しない位置に挿入する。

### D7: `JobStateStore.list` の `changes/` スキャンで `canceled/` を予約名として skip する

`JobStateStore.list`（`src/store/job-state-store.ts`）の section 1（`specrunner/changes/*` を slug dir として走査）は現在 `archive` のみを skip する（job-state-store.ts:224 `entry.name === "archive"`）。ここに `canceled` を加え、`changes/canceled/` を slug dir として誤って走査しないようにする。

**Rationale**: `canceled/` は `archive/` と同じく `changes/` 配下の予約サブディレクトリになる。skip しないと name="canceled" を slug と誤認し（`changes/canceled/state.json` の ENOENT で実害は無いが）、`canceled` という名の幻ジョブ走査を試みる。`archive/` と対称に予約扱いするのが正しい。

## Risks / Trade-offs

**[Risk] 退避物（untracked + gitignored）がディスク上に蓄積する** → Mitigation: gitignore 済みで git status / 誤 commit を汚さない。蓄積分はユーザーが `rm -rf specrunner/changes/canceled/<dir>` で掃除できる。`canceled/` を対象にした掃除コマンド（`--purge` / `job rm` 連携）は将来の別 change。

**[Risk] 退避済み canceled ジョブが `specrunner ps` / `job show` に出ない** → Mitigation: `resolveCanonicalStateDir` / `JobStateStore.list` は `canceled/` を走査しない（D7 は誤認 skip のためで、収集はしない）。ただし現状でも cancel 後の worktree-only ジョブは worktree 撤去 + marker unlink で list / jobId 解決から外れており、可視性の後退は無い。一覧連携は Non-Goals。

**[Risk] 退避元コピーが部分的に失敗する** → Mitigation: 退避はベストエフォートで warning を積む。D3 の persist が in-memory state からキャンセル記録（`USER_CANCELED` / `canceledAt`）を最低限保証する（成果物の一部欠落は許容、記録は喪失させない）。

**[Risk] コピーした `state.json`（`_journal` カウンタ）に対し persist が delta を誤追記する** → Mitigation: `events.jsonl` も同時にコピーするためカウンタと journal が整合する。`JobStateStore.persist` は fold ベースの crash recovery / fast-path を備えており、コピー由来の整合状態でも正しく 1 件（canceled 遷移）だけ追記する。退避元未解決時は fresh write 経路で新規生成する。

**[Risk] managed ジョブの canceled state が sidecar（`.specrunner/local/<slug>/state.json`）ではなく `canceled/` に書かれる挙動変更** → Mitigation: managed も cancel 後は marker unlink で list / jobId 解決から外れる（現状でも sidecar の canceled state は到達不能）。退避により `canceled/` に墓標が残る分、むしろ記録性は向上する。記録喪失バグは無い領域のため受け入れ可能。

## Open Questions

なし。すべての設計判断は request の「architect 評価済みの設計判断」セクションで解決済み（語義 = 止めて片付ける / branch は残さない / 一意鍵 = jobId / 再開は新規 job / 外部制約なし）。
