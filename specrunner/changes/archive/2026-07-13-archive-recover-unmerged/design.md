# Design: `--with-merge` の archive-record 後・merge 失敗時に job を再解決可能に保つ

## Context

`job archive --with-merge <slug>` は 2 つの独立した終端操作 — change folder の archive 記帳（feature branch 上）と PR の base への merge — を、記帳を先行させて合成する。現状フロー（`src/core/archive/merge-then-archive.ts`）:

1. Step 1: `JobStateStore.list(cwd, { includeArchived: true })` を slug filter して job を解決（`:149-150`）。
2. Step 2: 初回 `getPullRequest`。MERGED かつ `jobStatus === "archived"` → merge 済 crash resume（cleanup）、それ以外の MERGED → 順序エラー escalation（`:202-222`）。
3. Step 3: `runArchiveOrchestrator`（idempotent）。change folder を `git mv <slug> → archive/<YYYY-MM-DD>-<slug>` し、`markJobArchived` が `awaiting-archive → archived` を遷移させ、feature branch へ commit・push（`src/core/archive/orchestrator.ts:245-355`）。
4. Step 4: CI green 待ち（記帳 headSha 基準）。
5. Step 5: squash merge。失敗は escalation。
6. Step 6: `runPostMergeCleanup`（worktree 撤去 + branch 削除）。

### 不具合

worktree モード（通常運用）で Step 3 の記帳が完了した後に Step 5 の merge が失敗すると、job が再解決不能になる。原因は状態の所在と走査範囲の不整合である:

- 記帳は worktree の working tree 上で行われる。`git mv` により state.json を含む change folder は `<worktree>/specrunner/changes/archive/<dated>-<slug>/` へ移動し、`markJobArchived` が status を `archived` に確定させる。この記帳 commit は未 merged の feature branch 上にのみ存在する。
- 再実行時の Step 1 `JobStateStore.list`（実体は `listWithSourceDirs`, `src/store/job-state-store.ts:231-384`）の走査:
  - section 1（main checkout active）/ 1b（main checkout archive）: 記帳 commit は未 merged のため local main には現れず、いずれも空。
  - section 2（worktree active 走査）: `slugEntry.name === "archive"` を **skip** する（`:301`）ため、worktree の archive/ 配下は走査されない。active `<slug>/` は移動済で不在。
  - section 3（sidecar supplement）: worktree の active `<slug>/state.json`（移動済で不在）を試みるため失敗。
  - → `matching.length === 0` → 「No job found」。手動 `gh` merge + worktree 撤去でしか回復できない。

つまり「archived 状態の所在」が未 merged branch 上の worktree archive/ に閉じ込められ、どの走査 section もそこを見ない。加えて status が terminal の `archived` に確定しているため、仮に解決できても `runArchiveOrchestrator` の Phase 0 terminal 短絡（`orchestrator.ts:142-145`）が no-op を返し、idempotent な再記帳と headSha 再捕捉が走らない。

### 制約

- Step 2 の crash-resume 判定（現状 `jobStatus === "archived"`）は「archive 記録済み → merge 後 cleanup resume」と「merge 先行 → 順序エラー escalation」を区別する。この区別を壊してはならない。
- 記帳（folder-move commit）は merge に含める必要があり、merge 前に feature branch へ commit する順序は不可欠（変更しない）。
- `--with-merge` を伴わない `job archive` 単体の挙動は変えない。

## Goals / Non-Goals

**Goals**:

- `--with-merge` の merge が記帳後に失敗しても、`archive --with-merge` の再実行で job を解決し、idempotent な再記帳を経て merge を retry できる。
- 記帳後・merge 前は job を再解決可能な非 terminal 状態（`awaiting-archive`）に保つ。
- 「archived 状態」と「archive 記録済みシグナル」を分離し、status 遷移 timing を merge 後へ遅らせても Step 2 の crash-resume / 順序エラーの区別を維持する。
- merge 成功後に status を `archived` へ遷移させ、post-merge cleanup を走らせる。
- `--with-merge` なしの `job archive` の挙動を不変に保つ。

**Non-Goals**:

- merge-wait の grace（H-1 `merge-wait-blocked-grace` で対応済）は変更しない。
- config / verification 系は変更しない。
- 記帳（folder-move）自体のロジック（`archiveChangeFolder` の mv 規則・dated 命名）は変更しない。
- 中間 status（`archive-recorded` 等）は新設しない。
- Step 1 の解決を git ref 走査（local checkout に無い branch object の `git ls-tree` 等）まで広げない。

## Decisions

### D1: `--with-merge` 経路では記帳時の `archived` 遷移を遅延する

`runArchiveOrchestrator` に `deferArchivedTransition?: boolean`（default `false`）option を追加する。`true` のとき、記帳フェーズは `git mv` / commit / push / headSha 捕捉をこれまで通り実行するが、`markJobArchived`（`awaiting-archive → archived`）の呼び出しを **skip** する。`merge-then-archive` の Step 3 のみ `true` を渡す。plain `job archive`（CLI 直呼び）は option 未指定＝`false` で従来通り記帳時に `archived` を確定する。

**Rationale**: 記帳後・merge 前の status を非 terminal（`awaiting-archive`）に保つことで (1) 再解決時に terminal 短絡が発生せず idempotent 再記帳と headSha 再捕捉が走り、(2) 「archived は merge 後にのみ到達」という意味論を表現できる。plain 経路を default で不変に保つことで R3 を型・default で担保する。

**Alternatives considered**:
- 記帳時に `archived` を確定したまま（現状維持）、再解決だけ直す案: status が terminal のため再記帳が no-op 短絡し headSha を再捕捉できず、CI-wait の headSha 安全ゲートが失われる（archiveSha undefined で headSha 照合を skip）。また「archived だが PR 未 merged」という誤解を招く表示が残る。受け入れ基準 1（記帳後・merge 前は `awaiting-archive` 相当）にも反する。
- `markJobArchived` を orchestrator から完全に外し全 caller へ移譲する案: plain 経路の構造を不必要に変える。option 分岐の方が surface が小さい。

### D2: 「archive 記録済み」シグナルを status から change folder の位置へ移す

Step 2 の「記録済みか否か」の判定を `jobStatus === "archived"` から **change folder が archive/ 配下にあるか** へ置き換える。`merge-then-archive` の Step 1 を `JobStateStore.list` から `JobStateStore.listWithSourceDirs` へ変更し、解決した最新 state の `sourceChangeDir` を取得する。記録済みシグナルは `path.basename(path.dirname(sourceChangeDir)) === "archive"` で判定する（archive エントリは `.../changes/archive/<dated-slug>` なので dirname の basename が `archive`、active は `.../changes/<slug>` なので `changes`）。

これにより Step 2 の 2 分岐は次のように区別される（区別の意味は不変）:
- MERGED かつ 記録済み（archive/ 配下）→ merge 後 resume（`markJobArchived` を idempotent に実行 → cleanup）。
- MERGED かつ 未記録（active `<slug>/`）→ 順序エラー escalation（merge が記帳より先行）。

**Rationale**: D1 で status を遅延させると `archived` は記録済みの信号として使えない。request が例示する「branch 上の archive folder 存在」を採用する。これは D1（status 遅延）と独立で、記帳の副作用そのもの（folder が archive/ へ移動した事実）を直接観測するため、遅延した status に依存しない robust なシグナルになる。schema 追加（専用フラグ）を避けられ surface が小さい。

**Alternatives considered**:
- 専用フラグ（`archiveRecordedAt` 等）を state に追加: schema・validation・persist・test の surface が増える。folder 位置で同じ情報が得られるため不要。
- `jobStatus === "archived"` を維持: D1 と両立しない（status は merge 後まで `awaiting-archive`）。

### D3: `archived` への遷移を post-merge cleanup の直前へ移す

`markJobArchived(slug, recordDir)` を、merge 成功後 cleanup を呼ぶ直前に best-effort で実行する。`recordDir = noWorktree ? cwd : (worktreePath ?? cwd)`（記帳が行われた working tree）。対象は post-merge cleanup を呼ぶ全経路:

1. Step 2 の MERGED かつ記録済み resume 経路。
2. Step 4 wait loop 内の merge-during-wait（他プロセスが merge）経路。
3. Step 5 の fresh merge 成功経路（`postMergeVerify` 設定時は integrity check pass 後）。

`markJobArchived` は idempotent（既 `archived` なら no-op）。best-effort とし、失敗しても escalation にせず warning を出して cleanup を継続する（merge は既に成立しており base を変更済みのため、遷移失敗で command 全体を失敗させない）。

**Rationale**: 遅延した遷移を「cleanup 直前」の一点に集約することで、merge が成立した全経路で確実に `awaiting-archive → archived` を行い、受け入れ基準 3 を満たす。best-effort にするのは、merge 成立後に遷移失敗で失敗を返すと利用者が「merge されたのか」を判別できなくなるため。

**Alternatives considered**:
- 遷移を hard-fail にする案: merge 成立後の失敗が command 全体を落とし、再実行時に Step 2 の MERGED+記録済みで再度 cleanup へ進むため実害は少ないが、成立済 merge を隠す escalation は誤解を招く。best-effort + warning が穏当。
- 遷移を merge 直後（integrity check 前）に置く案: integrity check 失敗時に status を `archived` にしてしまうと「merge したが検証未了」の状態が terminal 表示になる。integrity pass 後・cleanup 直前へ集約する。

### D4: `listWithSourceDirs` に worktree archive 走査（section 2b）を追加する

`JobStateStore.listWithSourceDirs` の worktree 走査（section 2）に、`opts.includeArchived === true` を条件とする worktree archive 走査を追加する。各 worktree の `specrunner/changes/archive/*/state.json` を走査し、main checkout archive を走査する section 1b と対称に、`parseArchiveDirName` で slug を抽出し `sourceChangeDir` を worktree archive dated dir として compose する。dedup（jobId・newest updatedAt 勝ち）は既存 `tryMerge` に委ねる。

**Rationale**: D1 で status を `awaiting-archive` に保っても、記帳で folder は worktree の archive/ 配下へ移動している。section 2 は archive/ を skip するため、この走査追加なしには記帳後の job を list() が発見できず「再解決可能」が成立しない。section 1b と対称な追加は原理的に自然で、`includeArchived` gate により影響範囲を section 1b と同じ caller 集合（`resolveId` / archive 経路 / `ps --all` / `job show`）に限定する。`includeArchived: false` の caller（default `ps` / `cancel` / `inbox` / `exit-guard`）は不変。

**Alternatives considered**:
- archive 経路専用の fallback resolver を新設: 共有 `listWithSourceDirs` を触らず blast radius を下げられるが、走査ロジックと `sourceChangeDir` 導出を二重化する。`listWithSourceDirs` は既に `sourceChangeDir` を返し `includeArchived` gate を持つため、対称拡張が自然。
- git ref 走査（`git ls-tree <branch>`）で archived-on-branch を探す案: local checkout に無い branch object を走査する複雑さと状態の所在分散を招くため却下（request architect 判断）。worktree は local checkout であり本走査はこれに該当しない。

### D5: 中間 status を新設せず既存の遷移を使う

status の集合と遷移表（`src/state/lifecycle.ts` の `VALID_TRANSITIONS`）は不変。`awaiting-archive → archived` の既存遷移をそのまま使い、遷移の **timing** のみ merge 後へ移す。

**Rationale**: 中間 status は型・遷移表・doctor・reconcile・cancel・ps 等の全消費者へ波及する。timing 変更で目的を達せるため導入しない。

**Alternatives considered**: `archive-recorded` 中間 status の新設 — 波及コスト大。却下。

### D6: CLI 配線は不変

`src/cli/archive.ts` は変更しない。`deferArchivedTransition: true` は `merge-then-archive` が `runArchiveOrchestrator` を呼ぶ内部で設定する。plain 経路の CLI 呼び出しは option 未指定のままで従来挙動を保つ。

**Rationale**: 分岐点を merge-then-archive 内に閉じ込め、CLI の surface を増やさない。R3（plain archive 不変）を配線レベルでも保つ。

## Risks / Trade-offs

- [Risk] `--with-merge` 成功後、merged main の archive folder の state.json が `awaiting-archive` を保持する。記帳 commit に乗る status は D1 で `awaiting-archive` であり、D3 の post-merge 遷移は worktree（撤去予定）へのローカル書き込みで merged main へは到達しない（base への直接書き込みは merge のみ、という不変を守るため post-merge に main へ commit しない）。→ Mitigation: change folder が `archive/` 配下にある事実が archival の主シグナル（D2 と同一原理）。default `ps` は archive を走査しないため通常表示に影響なし。`ps --all` の status 表示のみ cosmetic に `awaiting-archive` となる。merged 済 slug に対する `job archive` の稀な再実行は、worktree 撤去済のため no-op ではなく missing-worktree escalation になり得るが、merge は既に完了しており実害は限定的。merged main の archived 表現を厳密化する必要が生じた場合は folder 位置を権威とする別変更で対応する（本 request のスコープ外）。
- [Risk] `listWithSourceDirs`（D4）は多数の caller に共有される。→ Mitigation: `includeArchived` gate で section 1b と同一の caller 集合に限定。`includeArchived: false` 経路（cancel / inbox / exit-guard / default ps）は走査対象が増えず不変。追加走査で `resolveId` / `ps --all` / `job show` に worktree-archive state が現れるのは望ましい方向（archived-in-worktree の可視化）。
- [Risk] post-merge の `markJobArchived`（D3）を best-effort にするため、遷移失敗時は status が `awaiting-archive` のまま cleanup が進む。→ Mitigation: 再実行時に Step 2 の MERGED+記録済みで再び遷移を試みる。merge は既に成立しているため状態の正しさは folder 位置で担保される。

## Open Questions

- merged main の archive folder に対し `archived` status を durable に反映するか。D1/D3 の構造上、post-merge に base へ書き込まない限り merged main は `awaiting-archive` を保持する。本 request のスコープ（`--with-merge` の回復性）では folder 位置を archival シグナルとして扱い許容する。厳密化が必要なら folder 位置を status 表示の権威とする、あるいは merge 後 reconcile を別 request で検討する。

## Migration Plan

- データ migration なし。status 集合・遷移表は不変（D5）。
- 記帳 commit に乗る status が plain 経路は `archived`、`--with-merge` 経路は `awaiting-archive` に分岐する点を ADR に記録する。本変更は ADR-20260628（archive-on-branch-first）D3「status は記帳時点で `archived` に確定させ merge の有無に依存させない」を `--with-merge` 経路について改訂する（plain `job archive` については D3 を維持）。adr-gen step は当該 ADR を参照して amend/supersede 関係を明記する。
- ロールバックは本変更の revert で可能（永続フォーマットの変更を伴わない）。
