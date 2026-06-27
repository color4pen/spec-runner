# Design: cancel 時にジョブを canceled/<slug>-<jobId8>/ へ退避する

## Context

`specrunner job cancel` は現在、キャンセルした事実すら残さない破壊的操作になっている。
根本原因は `src/core/cancel/runner.ts` の処理順序にある。

- `cleanupJobResources(...)`（runner.ts:283）が worktree prune+remove（:167,:177）と
  local/remote branch 削除（:187,:193）を **先に** 実行する。
- その **後** に `transitionJob(..., "canceled", { patch: { error.code=USER_CANCELED, canceledAt, worktreePath:null } })`
  し、`resolveStateStoreByJobId(...)` で書き込み先を解決して persist する（:289-304）。
- worktree-only state の local job では、state.json が worktree 内 `specrunner/changes/<slug>/`
  にしか存在しない。worktree を撤去した後では `resolveStateStoreByJobId` の
  worktreePath 経路（fs.access 失敗）も canonical 経路（`changes/<slug>/` 不在）も解決できず
  `null` を返し、persist が **skip** される → `USER_CANCELED` / `canceledAt` の記録が消える。

加えて:

- request.md は既定で消える（`--restore-draft` opt-in 時のみ drafts へ戻すが、同名 slug で skip）。
- canceled ディレクトリの概念が存在せず、キャンセル済みジョブの記録・成果物が一切残らない。
- `--no-worktree` モードでは state が main の canonical `changes/<slug>/` に存在し、cancel しても
  ここが残るため `job ls` に active として重複表示される（前回実装で実際に発生した gap）。

完走 job は `src/core/finish/archive-change-folder.ts` が change-folder を
`archive/<YYYY-MM-DD>-<slug>/` へ `git mv` で退避する。本変更は cancel 側に類似の「退避」を導入する。

**cancel の語義** = 止めて片付ける（終わり）。worktree 撤去も branch 削除も維持する。
ただし「何をいつなぜキャンセルしたか」の記録と成果物は残す。再開は canceled を参考に
**新しい jobId の新規 job** を起こす運用とし、in-place resume はしない。

## Goals / Non-Goals

**Goals**:

- cancel 時、worktree 撤去の **前に** change-folder を main space の
  `specrunner/changes/canceled/<slug>-<jobId8>/` へ **move（退避後に元を削除）** する。
- 退避先 state に `error.code=USER_CANCELED` / `canceledAt` / reason を記録し、worktree 撤去後も残す
  （記録喪失バグの解消）。
- `<jobId8>` で一意化し、同名 slug を同日に複数回 cancel しても衝突しない。
- 片付け（worktree 撤去 + local/remote branch 削除）を維持する。
- 退避先 `canceled/` を `job ls` 等の active スキャンが拾わないことを保証する。
- `--restore-draft`（opt-in で drafts へ request 復元）を存置する。

**Non-Goals**:

- canceled からの直接 resume / pause・suspend（別概念・別 request）。
- archive/ の同種の衝突（`<date>-<slug>` に jobId 無し）の修正（別 request）。
- managed runtime での変更ファイル導出など他の confirmed findings。

## Decisions

architect 評価済みの判断（request.md 記載）は確定事項として D1–D5 に取り込む。
spec-review で再審議しないこと。

### D1: 退避を worktree 撤去の前に行い、退避先へ persist する（順序の反転で記録喪失を解消）

cancel の処理順を以下に再構成する:

1. status 事前チェック（archived 拒否 / awaiting-archive は --force 要求）
2. running の process kill
3. `--restore-draft` 時の draft 復元（worktree 内 request.md を読む — 退避・撤去の前）
4. **change-folder 退避（D2）+ canceled state 構築 + 退避先へ persist（D5）**
5. cleanup（worktree 撤去 + local/remote branch 削除 — D3）
6. managed marker unlink（best-effort）
7. `--purge` 時の machine-local sidecar 削除

persist を cleanup の **前** に、かつ退避先（`canceled/<slug>-<jobId8>/`）へ向けて行うことで、
worktree 撤去後も記録が残ることを構造的に保証する。

- **Rationale**: 現バグは「破壊（cleanup）→ 記録（persist）」の順序と、撤去で消えた書き込み先を
  `resolveStateStoreByJobId` が解決できず persist を skip することの複合。順序を反転し、書き込み先を
  「これから作る退避先ディレクトリ」に固定すれば、`resolveStateStoreByJobId` の null 分岐そのものを
  cancel 経路から外せる。
- **Alternatives considered**: cleanup を維持したまま persist 先だけ canonical へ書く案 →
  worktree-only では canonical が存在せず、結局新規ディレクトリ作成が必要になり退避と等価。退避に統合する方が単純。

### D2: 退避は move（copy + 元削除）。copy のみは却下

退避は退避先へコピーした後、元の change-folder を削除する。

- worktree モード: 元は `<worktreePath>/specrunner/changes/<slug>/`。退避後 worktree 撤去で消えるが、
  両モードを揃えるため move を要件とする。
- `--no-worktree` モード: 元は main canonical `<repoRoot>/specrunner/changes/<slug>/`。
  ここを **必ず削除** しないと `job ls` に active として重複表示される。

- **Rationale**: copy のみでは `--no-worktree` の canonical が残り、キャンセル済みなのに active 重複する
  （前回実装の実害）。move で両モードの後始末を統一する。
- **Alternatives considered**: `git mv`（archive と同様）→ D4 参照（main を直接 commit するため却下）。
  実装は cross-device 安全な `fs.cp(recursive)` + `fs.rm(source)` を基線とし、同一 FS の最適化（rename）は任意。

### D3: 片付け（worktree 撤去 + local/remote branch 削除）は維持

`cleanupJobResources` の worktree prune/remove と local/remote branch 削除はそのまま維持する。
branch は残さない。

- **Rationale**: cancel の語義 = 止めて片付ける（終わり）。
- **Alternatives considered（却下）**: branch を残して in-place resume 可能にする案 →
  それは cancel でなく pause/suspend であり語義に反する。再開は新 jobId の新規 job（`canceled/` は参照材料）。

### D4: 退避先は main space に untracked で置く（git mv / commit はしない）

`canceled/<slug>-<jobId8>/` は plain な filesystem move で配置し、`git add` / `git commit` はしない。

- **Rationale**: archive は feature branch worktree 内で `git mv` し、PR → merge 経由で main に入る。
  cancel は branch も worktree も撤去する終端操作で、PR/commit フローを持たない。main checkout で
  `git mv`/commit すると main の index/history を直接汚すことになり、プロジェクト規律
  「main を直接汚さない（取り込みは branch → PR → merge）」に反する。tombstone（墓標）は machine-local
  に近い性質で、untracked のまま参照用に置くのが自然。
- **Alternatives considered（却下）**: archive と同様の `git mv` + main へ commit → 上記の規律違反。
- **帰結**: `canceled/` は `git status` に untracked として現れる。プロジェクト側で commit するか
  `.gitignore` するかは利用者裁量（本変更では強制しない。Open Questions 参照）。

### D5: 一意鍵は `<slug>-<jobId8>`（jobId 先頭8桁）

退避先ディレクトリ名は `<slug>-<jobId8>`（`state.jobId.slice(0, 8)`）。
branch/worktree 命名（`pipeline-run.ts:155`）と同じ規約。

- **Rationale**: 同名 slug を同日に複数回 cancel しても衝突しない。`state.branch` に正確な branch 名が
  残るので、参照時の対応づけにも使える。
- **Alternatives considered（却下）**: `<YYYY-MM-DD>-<slug>`（日付のみ、archive と同形）→
  日単位の粒度では同日複数キャンセルの衝突を防げない。

### D6: 退避先へ persist は changeDir 直指定の JobStateStore で行う

退避先 state の書き込みは `new JobStateStore(jobId, repoRoot, { changeDir: <canceledDir> })` を用いる。

- 退避で `state.json` / `events.jsonl` を一緒に move しているため、`persist(updated)` は既存 `_journal`
  からの delta 追記（canceled 遷移 1 件）として動作する。元 files が見つからなかった degraded ケースでは
  fresh write になる。
- 書き込み先が「いま作った退避先」に固定されるため、`resolveStateStoreByJobId` の null skip を経由しない。
- **Rationale**: 書き込み先解決を撤去後の探索に依存させない。退避と persist を同じ宛先に束ねることで
  記録喪失の構造的余地を消す。

### D7: 退避元 change-folder の解決（worktree / no-worktree 両対応）

退避元（state.json を保持するディレクトリ）を次の順で解決する:

1. `resolveWorktreePathForJob(state, repoRoot)`（既存 helper, runner.ts:77）で worktreePath を解決し、
   `<worktreePath>/specrunner/changes/<slug>/state.json` が存在すれば worktree モードの元とする。
2. なければ canonical `<repoRoot>/specrunner/changes/<slug>/state.json` を no-worktree モードの元とする。
3. どちらも無ければ degraded（元 files 無し）。退避先ディレクトリは作成し、in-memory state から
   tombstone を書く（D6 fresh write）。

- **Rationale**: worktree-only / no-worktree の両モードを単一経路で扱う。slug は `getJobSlug(state)`。

### D8: active スキャンから `canceled/` を除外

`canceled/` を active job として拾わないよう、ディレクトリ走査側を更新する:

- `src/store/job-state-store.ts` `JobStateStore.list()` セクション1（`changes/*` 走査, :223）の
  skip 条件に `entry.name === "canceled"` を追加（既存の `=== "archive"` と並列）。
- 同セクション2（worktree 内 `changes/*` 走査, :278）の skip 条件にも `canceled` を防御的に追加。
- `resolveCanonicalStateDir`（`changes/<slug>` と `archive/*` のみ走査）は `canceled/` を見ないため
  改修不要だが、不可視であることを spec で固定する。

- **Rationale**: `canceled/<slug>-<jobId8>/state.json` は `changes/` 直下に `state.json` を持たないため
  実害なく skip されるが、`canceled` を予約名として明示し、slug 衝突と将来の誤検出を防ぐ。

### D9: 退避・persist は best-effort、ただし正常系で記録残存を保証

退避 + persist のステップは try/catch で囲み、IO 例外時は warning を積んで cancel を継続する
（既存の cleanup best-effort 方針 D3 と整合）。

- **Rationale**: 正常系（worktree / no-worktree とも実ディレクトリが存在）では退避先ディレクトリを
  自前で mkdir → persist するため成功し、記録は必ず残る（worktree-only 回帰テストで固定）。best-effort 化は
  稀な IO 障害でも cancel をクラッシュさせないための保険であり、記録喪失バグの原因（順序・宛先）は D1/D6 で
  既に除去済み。
- **帰結**: `--purge` でも退避先 tombstone は作成する（audit 記録は purge の対象 = machine-local sidecar とは別物）。
  既存の `if (!purge) persist` 条件は撤廃する（記録喪失バグの解消が purge より優先）。

## Risks / Trade-offs

- [Risk] `--no-worktree` で cancel する際、main checkout が feature branch を checkout 中だと
  `git branch -D` が「現在の branch は削除不可」で失敗しうる（既存の best-effort と同じく warning）。
  → Mitigation: 本変更のスコープ外（既存挙動）。退避（move）と記録は branch 削除の成否に依存しない。
  branch 削除は従来どおり best-effort warning とする。
- [Risk] tombstone が untracked のまま蓄積し `git status` を煩雑にする。
  → Mitigation: 利用者が commit/ignore を選択可能（D4）。蓄積整理は別途運用（Open Questions）。
- [Risk] cross-device move（worktree が別 FS）の失敗。
  → Mitigation: 基線を `fs.cp(recursive)` + `fs.rm` とし EXDEV を回避。
- [Risk] 退避元と退避先が同名衝突（`<slug>-<jobId8>` 既存）。
  → Mitigation: jobId8 は job 単位で一意、かつ同一 job の再 cancel は `loadStateByJobId` が
  退避済み（canceled/ は active 不可視）を解決できず「Job not found」になるため、実質衝突しない。

## Open Questions

- `--purge` は machine-local sidecar のみ削除する現挙動を維持する。`--purge` が tombstone（`canceled/`）も
  削除すべきかは本 request のスコープ外（defer）。本変更では「purge でも tombstone は残す」を採用。
- `canceled/` の長期蓄積を整理する `job cancel --all-terminated` 相当の掃除フローは別 request。

## Migration Plan

- データ移行不要（新規ディレクトリ規約の追加のみ）。
- 既存の canceled state（`changes/<slug>/` に残っている legacy）は次回その job を cancel した時に
  退避されるが、`loadStateByJobId` が canceled を不可視化するため通常は到達しない。後方互換の破壊なし。
- `request.adr === true` のため adr-gen step が本決定（特に D4 untracked / D1 順序反転）の ADR を生成する。
