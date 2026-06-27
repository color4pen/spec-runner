# ADR: cancel 時に change-folder を `canceled/<slug>-<jobId8>/` へ退避し、キャンセル記録喪失バグを解消する

- **date**: 2026-06-27
- **slug**: cancel-canceled-dir
- **status**: accepted

## Context

`specrunner job cancel` は "止めて片付ける（終わり）" という語義で worktree 撤去と branch 削除を行う。しかし実装には 2 つの破壊的バグがあった。

1. **キャンセル記録の喪失**（local 実行）: `cancelSingleJob` は cleanup（worktree 撤去）の **後** に `transitionJob(...)` + `resolveStateStoreByJobId(...)` で canceled state を persist する。worktree-only state の local ジョブでは保存先が worktree 内の `state.json` のみであり、cleanup 後には書き込み先が存在しない。`resolveStateStoreByJobId` が `null` を返し、persist が skip → `USER_CANCELED` / `canceledAt` の記録が喪失する。

2. **request.md の消失**: `--restore-draft` を付けた時のみ `drafts/<slug>/` へ request を戻すが、同名 slug で既にある場合は skip して捨てる。既定では request そのものが消える。

また、完走 job には `archive/<date>-<slug>/` という退避先があるのに対し、キャンセル job には対応する退避先が存在しなかった。

先行 ADR `2026-05-21-job-cancel-audit-trail-over-delete.md` は「cancel は audit trail を残す」という semantic を確立したが、実装レベルでは local 実行時の audit trail が喪失していた。本 ADR はその実装上の欠陥を根本修正する。

## Decisions

### D1: `changes/canceled/<slug>-<jobId8>/` を新設し、cancel 退避先とする

cleanup（worktree 撤去）の **前** に、ジョブの change-folder（request.md / state.json / events.jsonl / design・spec・tasks・test-cases・各 result アーティファクト）を main space の `specrunner/changes/canceled/<slug>-<jobId8>/` へ再帰コピーする。`archive/` と対になる「墓標 + 参照」用の予約サブディレクトリとして `changes/` 配下に位置づける。

**`archive/`（完走）vs `canceled/`（破棄）の対称モデル**:

| 状態 | 退避先 | 命名 | 手段 |
|------|--------|------|------|
| 完走（finish） | `changes/archive/<date>-<slug>/` | 日付 + slug | `git mv` + commit（PR 経由で main へ） |
| キャンセル | `changes/canceled/<slug>-<jobId8>/` | slug + jobId8 | ファイルシステムコピー（untracked） |

**却下**: 何も残さず完全破棄（現挙動）→ キャンセル記録すら消えるのは監査上不可（本 ADR が解消する現バグそのもの）。

### D2: 退避先ディレクトリ名の一意鍵は `<slug>-<jobId8>`

`archive/` の `<date>-<slug>`（日付のみ）ではなく、jobId 先頭 8 桁を含む `<slug>-<jobId8>` を採用する。これは branch / worktree 命名（`buildWorktreePath`、`change/<slug>-<jobId8>`）と同じ粒度。

**理由**: 同名 slug を同日に複数回キャンセルしても衝突しない。`state.branch`（`change/<slug>-<jobId8>`）と同じ jobId8 を含むため、退避物と元 branch の対応づけが目視で可能。

**却下**: `<date>-<slug>` → 同日に同じ slug を複数キャンセルすると衝突する。

### D3: canceled state を退避先ディレクトリへ直接 persist する（root-cause fix）

canceled 遷移後の state を `resolveStateStoreByJobId` 経由でなく、**退避先ディレクトリを `changeDir` seam に指定した `JobStateStore`** で直接 persist する。書き込み先は `repoRoot/specrunner/changes/canceled/<slug>-<jobId8>/` であり、worktree の存否に依存しない。`cancelSingleJob` 内の `resolveStateStoreByJobId` 経由の persist は廃止。

**バグの根本原因**: "書き込み先を worktree 撤去後に解決しようとする" 設計。書き込み先を退避先に固定することで、worktree-only ジョブでも記録喪失が起きない。

**却下**: `resolveStateStoreByJobId` を残し persist 順序だけ cleanup の前へ移す → worktree-only では main space に記録が残らず「墓標」要件を満たさない。退避と二重管理になる。

### D4: 退避元の解決は load 系と同じ順序、再帰コピーで成果物ごと退避

1. worktree slug dir（`<worktreePath>/specrunner/changes/<slug>/`）
2. canonical（`changes/<slug>/` または `archive/<dated>/`）
3. managed sidecar（`.specrunner/local/<slug>/`）

退避はベストエフォート：コピーに失敗しても warning を積み、D3 の persist で in-memory state のキャンセル記録は最低限残す。

**却下**: ファイル種別を列挙して個別コピー → 将来 result アーティファクトが増えるたびに列挙漏れのリスク。

### D5: 退避先は untracked + gitignore（main へ commit しない）

`.gitignore` に `specrunner/changes/canceled/` を追加。`git add` / commit は行わない。

**理由**: cancel は PR / merge サイクルの外にある main checkout 上の操作であり、main を直接 commit することは "main を直接汚さない" 原則に反する。退避物は human-readable な墓標であり、working tree 上に物理的に残れば要件を満たす。`.specrunner/local`（gitignored）と同じ philosophy。

**却下**: `archive/` と同様に `git mv` + commit → cancel に PR / merge の文脈が無く main を直接汚す。

### D6: 退避と canceled persist は `status !== "canceled" && !purge` のときのみ実行

- `status === "canceled"`（冪等ケース）: 既にキャンセル済みで cleanup 済みのため退避スキップ。
- `--purge` 指定時: "痕跡を残さない" 意図を尊重し退避スキップ。machine-local sidecar 削除のみ。

処理順: **kill → restore-draft（opt-in）→ 退避（cleanup 前）→ cleanup（worktree + branch 削除）→ canceled persist（退避先へ）→ marker unlink → purge**。

### D7: `JobStateStore.list` の `changes/` スキャンで `canceled/` を予約名として skip

`job-state-store.ts` の section 1（`changes/*` を slug dir として走査）は `archive` のみ skip していた（`:224`）。ここに `canceled` を加え、`changes/canceled/` を slug dir として誤走査しないようにする（`archive` と対称な予約扱い）。

## Alternatives Considered

### Alternative 1: branch を残して in-place resume を可能にする（pause/suspend モデル）

cancel 実行後も branch と worktree を保持し、後から同じ jobId で再開できるようにする。

**Pros**:
- やり直し時に同じ jobId・branch で継続でき、新規 job を起こす手間がない。

**Cons**:
- cancel の語義（止めて片付ける・終わり）に反する。branch を残すことは pause/suspend の概念であり、CLI の semantic が曖昧になる。
- branch を残すと worktree・branch のライフサイクル管理が複雑化し、`job ls` / `ps` での表示分類が不明確になる。

**Why not**: cancel は「終わり」を意味し、片付け（worktree 撤去 + branch 削除）はその本質。再開を前提とした中間状態の保持は cancel とは別の概念（pause/suspend）であり、別 request のスコープとする。

### Alternative 2: 何も残さず完全破棄（現挙動の継続）

cancel 後は change-folder も state も完全に削除し、痕跡を残さない。

**Pros**:
- 実装変更がゼロ。disk 使用量が増えない。

**Cons**:
- キャンセルした事実すら記録されない（監査上不可）。worktree-only job では `USER_CANCELED` / `canceledAt` が喪失する（現バグそのもの）。
- request.md も消え、やり直し時に内容を再入力する必要がある。

**Why not**: 「cancel は audit trail を保持する」という先行 ADR（2026-05-21-job-cancel-audit-trail-over-delete）の決定と矛盾する。現挙動はバグであり、継続は許容できない。

### Alternative 3: `<date>-<slug>` 命名で退避先ディレクトリを作る（archive と同形式）

`archive/<date>-<slug>/` と同様に `canceled/<date>-<slug>/` とし、日付を一意鍵に使う。

**Pros**:
- `archive/` との命名が完全に対称になり、既存の `parseArchiveDirName` 等を流用しやすい。
- ディレクトリ一覧を ls したとき時系列が分かる。

**Cons**:
- 同名 slug を同日に複数回キャンセルすると衝突する。jobId は一意だが日付は一意ではなく、日単位の粒度では衝突を防げない。

**Why not**: cancel は branch 命名（`change/<slug>-<jobId8>`）と同じ一意鍵（jobId）を持つため、jobId8 を含める方が自然であり、かつ衝突を確実に回避できる。

### Alternative 4: `resolveStateStoreByJobId` を残し persist 順序だけ cleanup の前へ移す

worktree 撤去前に canceled state を persist し、cleanup 後の書き込み先消失を回避する。退避ディレクトリは作らない。

**Pros**:
- `cancelSingleJob` の構造的変更が最小。`resolveStateStoreByJobId` の既存ロジックを維持できる。

**Cons**:
- canceled state が worktree 内（`<worktreePath>/specrunner/changes/<slug>/state.json`）に書かれるだけで、worktree 撤去後は消える。main space に記録が残らず「墓標 + 参照」要件を満たせない。
- 退避（別パスへのコピー）と現 store への persist が二重管理になる。

**Why not**: バグの根本原因（"書き込み先を worktree 撤去後に解決しようとする"）を解消しない上、main space に記録を残す要件も満たせない。退避先を固定して direct persist する D3 が根本修正として優れている。

### Alternative 5: 退避先を `git mv` + commit で main に取り込む（archive と同手段）

`archive/` と同様に、退避した `canceled/<slug>-<jobId8>/` を `git add` + commit で main に取り込む。

**Pros**:
- git 履歴に記録が残り、他のマシンやチームメンバーがキャンセル記録を参照できる。
- `archive/` との一貫性が高まる。

**Cons**:
- cancel は PR / merge サイクルの外にある操作であり、main を直接 commit することは "main を直接汚さない" 原則に反する。
- cancel は machine-local な行為であり、チーム共有の必要性が低い（`.specrunner/local` と同じ philosophy）。

**Why not**: cancel の文脈で main への直接 commit は設計原則違反。退避物は working tree 上に物理的に残れば要件（main space の `changes/canceled/` への退避）を満たす。gitignore により誤 commit も防止できる。

## Consequences

### Positive

- local 実行（worktree-only state）のジョブを cancel しても `USER_CANCELED` / `canceledAt` の記録が喪失しない（root-cause fix）。
- request.md を含む成果物が `canceled/<slug>-<jobId8>/` に残り、cancel した事実と内容を後から参照できる。
- 同名 slug を同日に複数回キャンセルしても `canceled/` で衝突しない。
- `archive/`（完走）と `canceled/`（破棄）という対称な directory モデルが `changes/` 配下に確立する。
- 再開時は `canceled/` を参照材料として**新 jobId の新規 job** を起こせる（in-place resume は cancel の語義外）。

### Negative / Trade-offs

- 退避物（untracked + gitignored）がディスク上に蓄積する。ユーザーが `rm -rf specrunner/changes/canceled/<dir>` で掃除するか、将来の `--purge` 連携コマンドで対応する。
- `specrunner ps` / `job show` は `canceled/` を走査しない（D7 は誤認防止のみ）。退避済みジョブの一覧連携は将来の別 change。
- managed ジョブの canceled state が sidecar ではなく `canceled/` に書かれる挙動変更。ただし cancel 後は marker unlink で到達不能になるため実害なし（記録性は向上）。

## Files Changed

| File | Change |
|------|--------|
| `src/core/cancel/runner.ts` | `evacuateChangeFolder` / `resolveSourceChangeFolder` 追加。canceled persist を退避先 direct write に変更。`resolveStateStoreByJobId` 経由の persist を廃止 |
| `src/util/paths.ts` | `canceledChangesDirRel` / `canceledChangeFolderPath` / `canceledDirName` 追加 |
| `src/store/job-state-store.ts` | `list()` の skip set に `canceled` 追加 |
| `.gitignore` | `specrunner/changes/canceled/` 追加 |
| `tests/unit/core/cancel/runner.test.ts` | worktree-only state での記録保全・request.md 保全・slug 衝突なし・片付け維持・purge・冪等 等のテストを追加 |
| `tests/unit/util/paths.test.ts` | canceled path ユーティリティのテストを追加 |
