# ADR: cancel 時に change-folder を `canceled/<slug>-<jobId8>/` へ退避し、キャンセル記録を保全する

- **date**: 2026-06-27
- **slug**: cancel-canceled-dir
- **status**: accepted

## Context

`specrunner job cancel` は cancel した事実すら残らない破壊的操作になっていた。根本原因は二つ：

1. **処理順序のバグ**: `cleanupJobResources`（worktree prune + branch 削除）を **先に** 実行した後に
   `transitionJob(..., "canceled", ...)` + `resolveStateStoreByJobId` で persist を試みていた。
   worktree-only state の local job では state.json が worktree 内の `changes/<slug>/` にのみ存在するため、
   worktree 撤去後は `resolveStateStoreByJobId` が null を返し persist が skip された
   → `USER_CANCELED` / `canceledAt` の記録が消える。

2. **`canceled/` ディレクトリ概念の不在**: 完走 job は `archive/<YYYY-MM-DD>-<slug>/` へ退避されるのに対し、
   cancel 済み job の change-folder（request.md / design・spec・tasks / 各 result アーティファクト）は
   残す仕組みが存在しなかった。

加えて、`--no-worktree` モードでは元の `changes/<slug>/` が cancel 後も残り、
`job ls` に active として重複表示されるという実害も発生していた（copy のみ退避の場合）。

## Decisions

### D1: 処理順を反転し、退避先へ persist することで記録喪失を構造的に解消する

cancel の処理順を以下に再構成する:

1. status 事前チェック
2. running process の kill
3. `--restore-draft` 時の draft 復元（worktree 内 request.md を読む — 退避前）
4. **change-folder 退避 + canceled state 構築 + 退避先へ persist**
5. cleanup（worktree 撤去 + local/remote branch 削除）
6. managed marker unlink（best-effort）
7. `--purge` 時の machine-local sidecar 削除

persist を cleanup の **前に**、かつ退避先（`canceled/<slug>-<jobId8>/`）へ向けて行うことで、
worktree 撤去後も記録が残ることを構造的に保証する。
`resolveStateStoreByJobId` の null skip 経路を cancel から排除する。

**却下**: cleanup を維持したまま canonical へ書く案 → worktree-only では canonical が存在せず、
新規ディレクトリ作成が必要になり退避と等価。退避に統合する方が単純。

### D2: 退避は move（copy + 元 change-folder 削除）とする

退避先へ `fs.cp(recursive)` した後、元の change-folder を `fs.rm` で削除する（cross-device safe）。

- `--no-worktree` モードでは元が main canonical `changes/<slug>/` に残るため、
  **必ず削除** しないと `job ls` に active として重複表示される（前回実装の実害）。
- worktree モードでは元は worktree 内なので worktree 撤去で消えるが、両モードを move で統一する。

**却下**: copy のみ → `--no-worktree` で canonical が残り、キャンセル済みなのに active 重複。

### D3: 片付け（worktree 撤去 + local/remote branch 削除）は維持する

cancel の語義 = 止めて片付ける（終わり）。branch は削除し保全しない。

**却下**: branch を残して in-place resume 可能にする案 → それは cancel でなく pause/suspend であり語義に反する。
再開は `canceled/` を参考に新しい jobId の新規 job を起こす運用とする。

### D4: 退避先は main space に untracked で置く（git mv / commit はしない）

`canceled/<slug>-<jobId8>/` は plain な filesystem move（`fs.cp` + `fs.rm`）で配置し、
`git add` / `git commit` はしない。

- archive は feature branch worktree 内で `git mv` し、PR → merge 経由で main に入る。
- cancel は branch も worktree も撤去する終端操作で、PR/commit フローを持たない。
  main checkout で `git mv`/commit すると main の index/history を直接汚すことになり、
  プロジェクト規律「main を直接汚さない（取り込みは branch → PR → merge）」に反する。
- tombstone（墓標）は machine-local に近い性質で、untracked のまま参照用に置くのが自然。

**却下**: archive と同様の `git mv` + main へ commit → 上記規律違反。

帰結: `canceled/` は `git status` に untracked として現れる。
プロジェクト側で commit するか `.gitignore` するかは利用者裁量。

### D5: 一意鍵は `<slug>-<jobId8>`（jobId 先頭 8 桁）

退避先ディレクトリ名は `canceled/<slug>-<jobId8>`（`state.jobId.slice(0, 8)`）。
branch/worktree 命名（`pipeline-run.ts`）と同じ規約。

**却下**: `<YYYY-MM-DD>-<slug>`（archive と同形）→ 日単位の粒度では同日複数 cancel で衝突する。

### D6: 退避先へ persist は changeDir 直指定の JobStateStore で行う

退避先 state の書き込みは `new JobStateStore(jobId, repoRoot, { changeDir: canceledDir })` を用いる。
書き込み先が「いま作った退避先」に固定されるため、`resolveStateStoreByJobId` の null 分岐を経由しない。

### D7: 退避元 change-folder の解決（worktree / no-worktree 両対応）

1. `resolveWorktreePathForJob` で worktreePath を解決し、`<worktreePath>/specrunner/changes/<slug>/` が存在すれば worktree モードの元とする。
2. なければ canonical `<repoRoot>/specrunner/changes/<slug>/` を no-worktree モードの元とする。
3. どちらも無ければ degraded（元 files 無し）。退避先ディレクトリを作成し in-memory state から tombstone を書く（fresh write）。

### D8: `canceled` は予約ディレクトリ名として active スキャンから除外する

`JobStateStore.list()` の `changes/*` 走査（Section 1・Section 2）の skip 条件に
`|| entry.name === "canceled"` を追加（既存の `=== "archive"` と並列）。

`canceled/<slug>-<jobId8>/state.json` は `changes/` 直下に存在しないため実害なく skip されるが、
slug 衝突と将来の誤検出を防ぐために予約名として明示する。

### D9: 退避・persist は best-effort、正常系で記録残存を保証する

退避 + persist を try/catch で囲み、IO 例外時は warning を積んで cancel を継続する。
正常系（ディレクトリが実在）では退避先に自前で persist するため必ず成功する。

既存の `if (!purge) persist` 条件は撤廃する。
`--purge` でも tombstone（`canceled/`）は残す（audit 記録は purge 対象の machine-local sidecar とは別物）。

## Alternatives Considered

### Alternative 1: cleanup-before-persist（処理順を維持したまま canonical に書く）

現状の `cleanupJobResources → transitionJob → resolveStateStoreByJobId → persist` の順序を維持し、
canonical `changes/<slug>/` への新規書き込みで記録喪失を回避する案。

- **Pros**: 既存 cleanup 関数の変更が最小。
- **Cons**: worktree-only job では canonical ディレクトリが存在せず、結局新規ディレクトリ作成が必要になり
  退避と等価の実装コストが生じる。cleanup 後に書き込み先を解決する構造的な脆弱性（`resolveStateStoreByJobId` の null skip）が残る。
- **Why not**: 根本解（順序反転 + 退避先固定）と実装コストが変わらず、脆弱性を残す方を選ぶ理由がない。退避に統合する方が単純で堅牢（→ D1 採用）。

### Alternative 2: copy のみ（元 change-folder を残す）

退避先へコピーするが、元の change-folder（`changes/<slug>/`）を削除しない案。

- **Pros**: worktree モードでは worktree 撤去により元が自然に消えるため、worktree モード単体では実害が出ない。実装が単純（削除処理が不要）。
- **Cons**: `--no-worktree` モードでは main canonical `changes/<slug>/` が cancel 後も残り、
  `job ls` にキャンセル済みジョブが active として重複表示される（前回実装で実際に発生した実害）。
- **Why not**: `--no-worktree` モードを壊す実害が確認済み。両モードを move で統一することで挙動を揃える（→ D2 採用）。

### Alternative 3: branch を残して in-place resume を可能にする

cancel 時に worktree と branch を削除せず、`paused` / `suspended` 相当の中断状態として保持する案。

- **Pros**: 途中成果物（コード変更・各ステップ出力）をそのまま引き継いで再開できる。
- **Cons**: cancel の語義（止めて片付ける・終わり）に反する。resume は同一 jobId での in-place 継続を前提とし、cancel → resume の状態遷移設計が別途必要になる。
- **Why not**: それは cancel でなく pause/suspend であり別概念・別 request。cancel は終わりの操作として設計する。再開は `canceled/` を参考に新 jobId の新規 job を起こす運用とする（→ D3 採用）。

### Alternative 4: 完全破棄（change-folder も tombstone も残さない）

cancel 時に change-folder を削除し、記録を一切残さない案（現状バグの「正式採用」）。

- **Pros**: 実装が最もシンプル（残す処理が不要）。disk 消費ゼロ。
- **Cons**: キャンセルした事実・時刻・理由が消える（監査不可）。request.md / design / spec / アーティファクトが消滅する。現在のバグ（`USER_CANCELED` 消失）を意図的に維持することになる。
- **Why not**: キャンセル記録の喪失は監査上の問題であり、現バグの解消が本 request の目的。却下（→ `canceled/` 退避採用）。

### Alternative 5: `<YYYY-MM-DD>-<slug>` を一意鍵にする（archive と同形）

退避先ディレクトリ名を `canceled/<YYYY-MM-DD>-<slug>` とし、archive と命名規約を統一する案。

- **Pros**: archive フォルダ（`archive/<YYYY-MM-DD>-<slug>/`）と同じ規約で一貫性が高い。ls で日付順ソートが自然にできる。
- **Cons**: 同名 slug を同日に複数回 cancel すると衝突する（日単位の粒度では防げない）。`state.branch` との対応づけに branch 名（`<slug>-<jobId8>`）が使えない。
- **Why not**: 同日複数 cancel の衝突は実運用上ありうる（retry など）。jobId8 は既存の branch/worktree 命名規約と一致しており、一意性が構造的に保証される（→ D5 採用）。

### Alternative 6: `git mv` + main へ直接 commit（archive と同様のフロー）

`canceled/` への退避を `git mv` で行い、main checkout 上でコミットする案。

- **Pros**: `canceled/` が git 管理に入り、チーム間でキャンセル履歴を共有できる。
- **Cons**: cancel は branch も worktree も撤去する終端操作であり、PR/commit フローを持たない。
  main checkout で直接 `git mv`/commit すると main の index/history を直接汚すことになり、
  プロジェクト規律「main を直接汚さない（取り込みは branch → PR → merge）」に反する。
- **Why not**: tombstone は machine-local に近い性質で、untracked のまま参照用に置くのが自然。
  チーム共有が必要な場合は利用者が自分で commit/ignore を選択できる（→ D4 採用）。

## Consequences

### Positive

- worktree-only state の local job でも `USER_CANCELED` / `canceledAt` が `canceled/<slug>-<jobId8>/state.json` に必ず残る（記録喪失バグの解消）。
- request.md / design / spec / tasks / アーティファクトが tombstone として `canceled/` に保全される。
- 同名 slug を同日に複数回 cancel しても jobId8 で衝突しない。
- `--no-worktree` モードで cancel 後に canonical `changes/<slug>/` が残らず `job ls` への重複表示がなくなる。
- `canceled/` が `archive/` と並ぶ明示的な予約ディレクトリとして確立され、将来の pause/suspend 系機能が混入しない。

### Negative / Neutral

- `canceled/` は untracked のまま蓄積し `git status` が煩雑になりうる。利用者が commit/ignore を選択可能。
- `--purge` では tombstone が削除されない（purge は machine-local sidecar のみ対象）。
- `canceled/` の蓄積整理（bulk cleanup）は別 request。

## Files Changed

| File | Change |
|------|--------|
| `src/core/cancel/runner.ts` | `evacuateChangeFolder` 追加、処理順反転（D1）、if(!purge) guard 撤廃（D9） |
| `src/store/job-state-store.ts` | `list()` Section 1/2 に `canceled` skip 追加（D8） |
| `src/util/paths.ts` | `canceledChangesDirRel()` / `canceledChangeFolderPath()` 追加（D5） |
| `tests/unit/core/cancel/runner.test.ts` | worktree-only 回帰、move 保証、衝突なし、片付け維持テスト追加 |
