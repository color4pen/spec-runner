# Design: job 終端処理を slug 正本に一本化する

## Context

job state の正本（truth）は branch 同伴の slug ディレクトリ `specrunner/changes/<slug>/`（`state.json` + `events.jsonl`）にある（minimal-state-slug-dir / event-journal 段2）。`.specrunner/jobs/<jobId>/` の jobId ストアは machine-local cache であり、run 中の step 遷移は slug 正本（worktree 配下）へ書かれる。

しかし job 終端（pipeline 完走 → archive）まわりの一部が依然 jobId ストアまたは未コミットの worktree state に依存しており、正本と乖離する。run 中の主要 writer の挙動を確認した結果、次の構造が問題を生んでいる。

- **pipeline 終端遷移が未コミット**: 最後の step（pr-create）の commit/push（`StepExecutor.runAgentStep` → `finalizeStepArtifacts` → `commitAndPush`）は `finalizeStep` の前に走るため、push 済み state は `status=running`（verdict / pullRequest / 終端遷移を含まない）。その後 `finalizeStep`（verdict / pullRequest 記録）と pipeline の `running → awaiting-archive` 遷移（`pipeline.ts` の `nextStep === "end"` 分岐）が disk に書かれるが、これらは **どの step commit にも乗らない**。結果、PR が merge された main の `changes/<slug>/state.json` は `running` のまま取り込まれる。
- **archive の最終遷移が jobId ストアを読む**: `markJobArchived(jobId, repoRoot)`（`src/core/finish/job-state-update.ts`）が `new JobStateStore(jobId, repoRoot)`（slug opts 無し）で jobId ストアを load する。jobId ストアは job 作成時（`status=running` / `step=init`）以降 step 遷移で更新されないため、`running → archived` という不正遷移になり `transitionJob` が throw する。
- **finishable gate と最終遷移の state ソース不一致**: archive Phase 0 の gate（`assertJobFinishable`）は `JobStateStore.list()` 経由で slug 正本／worktree（`awaiting-archive`）を読んで通過するのに、Phase 3 の最終遷移は jobId ストア（`running`）を読む。gate 通過後に遷移が失敗する。
- **status が archived に切り替わらない**: 最終遷移失敗により終端済み job が `awaiting-archive` のまま残り、`job ls`（既定）から消えない。

これらは独立した bug ではなく、「終端時点の正本が branch に乗らない」→「archive が正本でない別ソースを読む」という一連の乖離である。

### 触れる主な seam

- `src/core/pipeline/pipeline.ts` — `runInternal` の `nextStep === "end"` 終端分岐（`running → awaiting-archive`）。
- `src/core/port/runtime-strategy.ts` / `src/core/runtime/local.ts` / `src/core/runtime/managed.ts` — step artifact lifecycle seam（`finalizeStepArtifacts` と同列）。
- `src/core/step/commit-push.ts` — `commitAndPush` / `pushOnly`。
- `src/core/finish/job-state-update.ts` — `assertJobFinishable` / `markJobArchived`。
- `src/core/archive/orchestrator.ts` — Phase 0〜3。
- `src/store/job-state-store.ts` — `JobStateStore`（slug-mode の path 解決）。
- `src/util/paths.ts` — `changeFolderPath` / `archivedChangeFolderPath` / `parseArchiveDirName` / `slugStateJsonPath` / `slugEventsPath`。
- `src/cli/ps.ts` — 既定 `job ls` フィルタ（`!isTerminal`）。
- tests: `tests/unit/core/archive/orchestrator.test.ts` / `tests/finish-job-state.test.ts`。

## Goals / Non-Goals

**Goals**:

- archive の最終遷移を slug 正本の read → transition → persist に一本化し、jobId-only legacy ストアへの依存を断つ。
- finishable gate と最終遷移を同一の state ソース（slug 正本）に揃え、gate 通過後の遷移失敗を消す。
- pipeline 終端 phase 完了後、slug 正本（`state.json` / `events.jsonl` / 終端成果物）を feature branch にコミットし、merge された main が `awaiting-archive` を持つようにする。
- archived（終端）に切り替わった job を既存の `job ls` 既定フィルタで除外する（新規フィルタ・新規コマンドを足さない）。
- archive 済み（folder 移動済み）で `awaiting-archive` のまま取り残された job を、既存 `job archive` の冪等な再実行で `archived` まで完了できるようにする。

**Non-Goals**:

- jobId ストア（`.specrunner/jobs/`）の machine-local cache としての役割の是非・完全廃止。本変更は終端の **read/transition/persist** を slug 正本へ移すだけで、jobId ストアの存続自体は変えない。
- 取り残し job 整理のための新規コマンド（`job reconcile` 等）の追加。既存 `job archive` の冪等再実行で代替する。
- managed runtime の終端 commit。managed は worktree を持たず branch 反映は cloud agent 側の責務であり、本変更の終端 commit seam は managed では no-op とする。
- daemon 化 / CI ネイティブ実行。
- pr-create / verification 等 step 単位 commit の挙動変更。

## Decisions

### D1: archive の最終遷移を slug 正本の read/transition/persist に一本化する

`markJobArchived` を `markJobArchived(jobId, repoRoot)` から「slug 正本を読み、`awaiting-archive → archived` に遷移し、同じ location へ persist する」責務へ作り替える。jobId ストアの `new JobStateStore(jobId, repoRoot)` 直読みを廃止し、slug 正本の `state.json` + `events.jsonl` を `load()`（fold）してから `transitionJob` し、`persist()`（delta-append）で同 location に書き戻す。

`transitionJob` は same-status を noop 返しするため、既に `archived` なら no-op（冪等）。

**Rationale**: 正本（branch 同伴 slug state）を読み書きすれば、gate が見る state と最終遷移が見る state が一致し、不正遷移（`running → archived`）が原理的に発生しなくなる。jobId ストアは run 中に step 遷移を受けない cache であり、終端遷移の根拠に使うのが誤りだった。`load()`/`persist()` を経由することで `events.jsonl` に transition record が正しく append され、crash recovery（fold 件数カウンタ）も従来どおり効く。

**Alternatives considered**:
- *jobId ストアを終端遷移の直前に slug 正本で同期してから読む*: 二重正本を維持する糊付けで、minimal-deps / location=identity の方針に反する。却下。
- *jobId ストアの状態を `running` のまま許容し、`markJobArchived` で `running → archived` を valid 遷移に追加する*: lifecycle FSM の不変条件を緩めて終端の整合性が崩れる。却下。

### D2: slug 正本の物理 location を解決する resolver を置く

archive Phase 1 で change folder は `git mv` により `changes/<slug>/` から `changes/archive/<YYYY-MM-DD>-<slug>/` へ移動する。よって最終遷移時点の slug 正本は active ではなく archive 側にある。`markJobArchived` が location 非依存に正本を掴めるよう、resolver を導入する。

`resolveCanonicalStateDir(slug, repoRoot)`:
1. `repoRoot/specrunner/changes/<slug>/state.json` が存在すれば active dir。
2. なければ `repoRoot/specrunner/changes/archive/*` を走査し、`parseArchiveDirName(name).slug === slug` かつ `state.json` を持つ dir を archive dir として返す。
3. どちらも無ければ `null`。

`parseArchiveDirName` が date prefix を剥がすため、archive dir の日付に依存せず（再実行で日付が変わっても）既存 archive を解決できる。

**Rationale**: 「location = identity」を保ちつつ、正本が active→archive へ移動した後も同一の論理 state を一意に指せる。archive のどの順序（mv 前後・冪等再実行）でも resolver は現在地を返すため、`markJobArchived` の呼び出し位置に依らず堅牢になる。

**Alternatives considered**:
- *`archiveChangeFolder` が移動先 path を返し、それを `markJobArchived` に渡す*: 正常系は解けるが、冪等再実行（既に archive 済みで mv skip）で path が手に入らず破綻する。resolver の方が再実行に強い。却下。

### D3: `JobStateStore` に明示 changeDir seam を足し、archive 後の location を fold+delta で読み書きする

slug-mode の path 解決（`slugStateJsonPath(slug)` = `changes/<slug>/...`）は archive dir（`changes/archive/<dated>/...`）を指せない。`JobStateStore` の slug-mode opts に「state ディレクトリの絶対パス」を明示注入する seam を足し、与えられた時は `state.json` / `events.jsonl` の path をその dir 直下に解決する（slug 規約を上書き）。`load()`（fold）/ `persist()`（delta-append）/ crash recovery はそのまま再利用する。

**Rationale**: 終端遷移を `state.json` だけの read-modify-write で済ませると、`events.jsonl` に transition record が append されず（`persist` の delta 判定が件数カウンタ基準のため）来歴が欠落する。正本の読み書きは必ず `load()`/`persist()` を経由する必要があり、そのためには store がその dir を指せる最小 seam が要る。

**Alternatives considered**:
- *`loadSplitLayout` 等の module-level 関数を export して `markJobArchived` から直接叩く*: delta-append ロジックが instance method 側にあるため、persist 経路を再実装する羽目になり二重化する。store seam の方が小さい。却下。

### D4: archive orchestrator を「mv → 最終遷移&persist → stage → commit → push」に並べ替え、Phase 3 を Phase 1 に統合する

現状の Phase 1（mv → commit → push）→ Phase 2（worktree teardown）→ Phase 3（`markJobArchived`）では、status 遷移が commit/push の **後** に来るため archived が branch に乗らない（乗る前に throw もする）。順序を次に変える。

1. `git checkout <base>` → `git pull --ff-only`（best-effort）
2. derive usage（best-effort）
3. `archiveChangeFolder`（`git mv`。既に archive 済みなら skip）
4. **`markJobArchived(slug, cwd)`**（D1/D2/D3。正本 location を解決し `awaiting-archive → archived` を persist）
5. `git add specrunner/changes/`（mv と status 変更・`events.jsonl` 追記をまとめて stage）
6. `commitArchive`（staged 変更があれば commit）
7. `git push origin <base>`

旧 Phase 2（worktree teardown + branch 削除）はこの後（best-effort）に置く。これにより archived 化が archive commit に同梱され、merge 不要の archive（main 直 commit）で main の `changes/archive/<dated>/state.json` が `archived` を持つ。

**Rationale**: gate（Phase 0）が読む正本と、最終遷移が書く正本を同一にし、かつ archived を **commit 前** に確定させることで、`job ls` が読む archive-location の state.json が `archived` になる。再 stage を mv と status 変更の後に 1 回置けば、正常系・冪等再実行の双方で commit に正しい差分が乗る。

**Alternatives considered**:
- *Phase 3 を残し、commit 後に archived を別 commit で push する*: archive commit が 2 つに割れ、片方だけ push 成功時の中間状態が増える。1 commit に畳む方が単純。却下。

### D5: pipeline 終端 phase の commit を RuntimeStrategy seam に委譲する

pipeline の `running → awaiting-archive` 終端遷移 persist の直後に、slug 正本（`state.json` / `events.jsonl` / `usage.json` と終端成果物）を feature branch へ commit/push する seam を追加する。step 単位 commit が `finalizeStepArtifacts` で runtime に委譲されているのと同列に、`RuntimeStrategy.commitFinalState(deps, state)` を足す。

- **LocalRuntime**: worktree cwd で `git add -A` → staged 変更（または HEAD 進行）があれば `commit -m "finalize: <slug>"` → branch へ push（1 回 retry）。実体は `src/core/step/commit-push.ts` に終端用 helper を足して共有する。
- **ManagedRuntime**: no-op（worktree 無し）。

呼び出しは `pipeline.ts` の終端分岐で `await deps.runtimeStrategy?.commitFinalState(deps, state)`。step commit と同じく runtime 非依存に保つ。

**Rationale**: 終端遷移の結果（最終 state.json / events.jsonl）を branch に乗せて初めて、merge 後の main が `awaiting-archive` を持ち、archive の `git mv` が `awaiting-archive` を archive でき、`markJobArchived` が `awaiting-archive → archived` を遷移できる。終端 commit は D1〜D4 を成立させる前提であり、欠けると archive-location の content が `running` のままになって最終遷移が不正になる。step commit の委譲構造（runtime seam）を踏襲することで managed を no-op に保てる。

**Alternatives considered**:
- *CommandRunner（pipeline.run 後）で commit する*: pipeline を git 非依存に保てるが、終端遷移と commit が別レイヤに割れて凝集が下がる。終端遷移は pipeline 内にあるため、その直後に置く方が「終端 phase 完了 → 同梱 commit」が一体化する。本線として pipeline 内呼び出しを採る。
- *pr-create step の commit を `finalizeStep` の後ろに動かす*: 終端遷移は step より後の pipeline レイヤで起きるため、step 内 commit の移動では終端遷移分を拾えない。却下。

### D6: archived = terminal を既存 `job ls` フィルタで除外する（新規フィルタ不要）

`job ls`（既定）は既に `allJobs.filter((j) => !isTerminal(j.status))` で終端（`archived` / `canceled`）を除外している（`src/cli/ps.ts`）。`JobStateStore.list()` は active `changes/*` と archived `changes/archive/*` の双方を走査し jobId で dedup（newest `updatedAt` 勝ち）する。D1〜D5 により archive-location の state.json が `archived`（最新 `updatedAt`）になるため、legacy jobId ストアの `running`（古い `updatedAt`）は dedup で負けて既定 ls から消える。よって新規フィルタは要らない。本決定は「archived を list が読む location に確実に着地させる」ことに帰着する。

**Rationale**: 表示要件は既存フィルタで満たせるため、追加ロジックを入れない（minimal-deps）。要件 4 の本質は status が `archived` になること（D1〜D5）であり、表示層は不変。

**Alternatives considered**:
- *`job ls` 側で archive folder を別扱いして隠す*: 表示層に状態判定を持ち込み二重管理になる。status=terminal を唯一の根拠に保つ。却下。

### D7: 冪等性 — terminal no-op と awaiting-archive 取り残しの再実行安全

`job archive` の再実行は次のとおり冪等になる。

- 正本が `archived`（終端）: Phase 0 の `TERMINAL_STATUSES` チェックで no-op exit 0（既存挙動）。
- 正本が `awaiting-archive` で folder 移動済み: Phase 0 gate 通過 → Phase 1 で `archiveChangeFolder` は source 不在で skip → `markJobArchived` が archive-location を解決し `awaiting-archive → archived` を persist → stage/commit/push。新規コマンド不要。

**Rationale**: 要件 5（取り残し job の再実行完了）を、専用コマンドを足さずに既存 archive の冪等性として吸収する。`transitionJob` の same-status noop と resolver の location 解決が、再実行の安全性を担保する。

**Alternatives considered**:
- *`job reconcile` 等の新規コマンド*: スコープ外指定どおり却下。

## Risks / Trade-offs

- [Risk] 終端 commit/push が transient 失敗すると merge 後 main が `running` のままになり、後続 archive の最終遷移が `running → archived` 不正になる → **Mitigation**: D5 の終端 commit は 1 回 retry を入れ、失敗時は明示警告を stderr に出す。push 恒久失敗時は worktree から手動 push で復旧でき、その後の `job archive` 再実行で完了する。
- [Risk] resolver（D2）が同一 slug を active と archive の両方で見つける（移行途中の二重存在）→ **Mitigation**: active を優先し、active が無い時のみ archive を返す。archive 走査は `state.json` を持つ dir のみ対象にする。
- [Risk] changeDir seam（D3）で slug 規約 path と archive path が混線する → **Mitigation**: changeDir 明示時のみ path を上書きし、未指定時は従来の slug 規約に完全一致させる。slug-mode の他経路（run 中の worktree 書き込み）は changeDir を渡さないため不変。
- [Risk] archive 順序変更（D4）で再 stage 漏れにより status 変更が commit されない → **Mitigation**: `markJobArchived` の後に `git add specrunner/changes/` を 1 回置き、mv と status 変更を 1 commit に揃える。正常系・冪等再実行の双方を test で固定する。
- [Trade-off] 終端 commit が 1 つ増える（pipeline 完走ごとに `finalize:` commit）。step commit 群に 1 件足すだけで、branch 同伴 state の完全性（CI 再 checkout / archive 整合）に必要なコストと判断する。

## Open Questions

- 旧コード（終端 commit 無し）で既に merge 済み・main content が `running` の job は、archive-location も `running` になり要件 5（`awaiting-archive` 前提の再実行）では救えない。これらは手動 state 修正が要る一過性の移行対象とするか、別 change で reconcile を設けるか。
- archive Phase 2 の jobId ストア worktreePath クリア（`new JobStateStore(jobId, cwd)` で `worktreePath: null` 永続化）は slug モデルでは vestige（worktreePath は machine-local sidecar 管理）。dedup で archived が勝つため害は無いが、撤去するかは別途。
- 終端 commit を `awaiting-resume`（escalate / exhaustion）終端にも広げて CI 再 checkout resume の完全性を高めるか。本変更は要件どおり `awaiting-archive`（終端）に限定する。

## Migration Plan

- 新規 job: 本変更適用後に run した job は、終端 commit（D5）で merge 後 main が `awaiting-archive` を持ち、`job archive` が D1〜D4 で `archived` まで一気に完了する。
- 取り残し job（archive-location が `awaiting-archive`）: 既存 `job archive` の冪等再実行で `archived` 化（D7）。新規コマンド不要。
- rollback: D5 の終端 commit と D1〜D4 の archive 改修は独立した seam 追加・順序変更であり、revert すれば従来挙動（終端 commit 無し / jobId ストア読み）に戻る。slug 正本のファイル形式は不変のため state 互換性は保たれる。
