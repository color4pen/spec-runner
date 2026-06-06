# job 終端処理を slug 正本に一本化する

**Date**: 2026-06-06
**Status**: accepted
**Related**: `specrunner/adr/2026-06-06-event-journal-slug-dir-state-model.md`（slug dir state model・段2 の前提）
**Related**: `specrunner/adr/2026-06-01-runtime-strategy-artifact-lifecycle.md`（RuntimeStrategy step artifact lifecycle seam）

## Context

job state の正本（truth）は branch 同伴の slug ディレクトリ `specrunner/changes/<slug>/`（`state.json` + `events.jsonl`）にある。run 中の step 遷移は worktree 配下の slug 正本へ書かれる。しかし job 終端まわりの一部が依然 jobId ストア（`.specrunner/jobs/<jobId>/`）または未コミットの worktree state に依存しており、正本と乖離していた。

具体的には次の 4 つの乖離が連鎖して問題を起こしていた。

1. **終端遷移が未コミット**: 最後の step の `commitAndPush` は `finalizeStep` / pipeline の `running → awaiting-archive` 遷移より前に走るため、push 済み state は `status=running`。merge 後 main の `changes/<slug>/state.json` が `running` のまま取り込まれる。
2. **archive の最終遷移が jobId ストアを読む**: `markJobArchived(jobId, repoRoot)` が `new JobStateStore(jobId, repoRoot)`（slug opts 無し）で jobId ストアを load する。jobId ストアは job 作成時（`status=running` / `step=init`）以降更新されないため、`running → archived` という不正遷移になり throw する。
3. **finishable gate と最終遷移の state ソース不一致**: archive Phase 0 の gate（`assertJobFinishable`）は slug 正本（`awaiting-archive`）を読んで通過するのに、Phase 3 の最終遷移は jobId ストア（`running`）を読む。gate 通過後に遷移が失敗する。
4. **status が archived に切り替わらない**: 最終遷移失敗により終端済み job が `awaiting-archive` のまま残り、`job ls`（既定）から消えない。

これらは独立した bug ではなく、「終端時点の正本が branch に乗らない」→「archive が正本でない別ソースを読む」という一連の乖離である。

## Decision

### D1: archive の最終遷移を slug 正本の read/transition/persist に一本化する

`markJobArchived` を `markJobArchived(jobId, repoRoot)` から `markJobArchived(slug, cwd)` に変え、slug 正本を読み・`awaiting-archive → archived` に遷移し・同一 location へ persist する責務へ作り替える。jobId ストアの直読みを廃止し、`JobStateStore` の `load()`（fold）→ `transitionJob` → `persist()`（delta-append）を経由して slug 正本に書き戻す。

`transitionJob` は same-status を noop 返しするため、既に `archived` なら no-op（冪等）。

**Rationale**: 正本（branch 同伴 slug state）を読み書きすれば、gate が見る state と最終遷移が見る state が一致し、不正遷移が原理的に発生しなくなる。jobId ストアは run 中に step 遷移を受けない cache であり、終端遷移の根拠に使うのが誤りだった。`load()`/`persist()` を経由することで `events.jsonl` に transition record が正しく append され、crash recovery（fold 件数カウンタ）も従来どおり効く。

**Alternatives considered**:
- *jobId ストアを終端遷移の直前に slug 正本で同期してから読む*: 二重正本を維持する糊付けで、minimal-deps / location=identity の方針に反する。却下。
- *`running → archived` を valid 遷移に追加する*: lifecycle FSM の不変条件を緩めて終端の整合性が崩れる。却下。

### D2: slug 正本の物理 location を解決する resolver を置く

archive Phase 1 で change folder は `git mv` により `changes/<slug>/` から `changes/archive/<YYYY-MM-DD>-<slug>/` へ移動する。`markJobArchived` が location 非依存に正本を掴めるよう、`resolveCanonicalStateDir(slug, repoRoot)` を導入する。

1. `repoRoot/specrunner/changes/<slug>/state.json` が存在すれば active dir を返す。
2. なければ `repoRoot/specrunner/changes/archive/*` を走査し、`parseArchiveDirName(name).slug === slug` かつ `state.json` を持つ dir を返す。
3. どちらも無ければ `null`。

**Rationale**: 「location = identity」を保ちつつ、正本が active→archive へ移動した後も同一の論理 state を一意に指せる。archive のどの順序（mv 前後・冪等再実行）でも resolver は現在地を返すため、呼び出し位置に依らず堅牢になる。

**Alternatives considered**:
- *`archiveChangeFolder` が移動先 path を返し `markJobArchived` に渡す*: 冪等再実行（既に archive 済みで mv skip）で path が手に入らず破綻する。却下。

### D3: `JobStateStore` に明示 changeDir seam を足す

slug-mode の path 解決（`slugStateJsonPath(slug)` = `changes/<slug>/...`）は archive dir（`changes/archive/<dated>/...`）を指せない。`JobStateStore` の slug-mode opts に「state ディレクトリの絶対パス」を明示注入する `changeDir` フィールドを足し、与えられた時は `state.json` / `events.jsonl` の path をその dir 直下に解決する（slug 規約を上書き）。`load()` / `persist()` / crash recovery はそのまま再利用する。

**Rationale**: 終端遷移を `state.json` だけの read-modify-write で済ませると、`events.jsonl` に transition record が append されず来歴が欠落する。正本の読み書きは必ず `load()`/`persist()` を経由する必要があり、そのためには store がその dir を指せる最小 seam が要る。

**Alternatives considered**:
- *`loadSplitLayout` 等の module-level 関数を export して直接叩く*: delta-append ロジックが instance method 側にあるため persist 経路を再実装する羽目になり二重化する。却下。

### D4: archive orchestrator を「mv → 最終遷移&persist → stage → commit → push」に並べ替える

旧 Phase 順序（mv → commit → push → worktree teardown → `markJobArchived`）では、status 遷移が commit/push の後に来るため archived が branch に乗らない。順序を次に変える。

1. `git checkout <base>` → `git pull --ff-only`（best-effort）
2. derive usage（best-effort）
3. `archiveChangeFolder`（`git mv`。既に archive 済みなら skip）
4. `markJobArchived(slug, cwd)`（D1/D2/D3。正本 location を解決し `awaiting-archive → archived` を persist）
5. `git add specrunner/changes/`（mv と status 変更・`events.jsonl` 追記をまとめて stage）
6. `commitArchive`（staged 変更があれば commit）
7. `git push origin <base>`

旧 worktree teardown + branch 削除はこの後（best-effort）に置く。

**Rationale**: archived 化が archive commit に同梱されることで、merge 後の main が archive-location の `state.json` に `archived` を持つ。再 stage を mv と status 変更の後に 1 回置けば、正常系・冪等再実行の双方で commit に正しい差分が乗る。

**Alternatives considered**:
- *Phase 3 を残し、commit 後に archived を別 commit で push する*: archive commit が 2 つに割れ、片方だけ push 成功時の中間状態が増える。1 commit に畳む方が単純。却下。

### D5: pipeline 終端 phase の commit を RuntimeStrategy seam に委譲する

pipeline の `running → awaiting-archive` 終端遷移 persist の直後に、slug 正本（`state.json` / `events.jsonl` / 終端成果物）を feature branch へ commit/push する seam を追加する。step 単位 commit が `finalizeStepArtifacts` で runtime に委譲されているのと同列に、`RuntimeStrategy.commitFinalState(deps, state)` を足す。

- **LocalRuntime**: worktree cwd で `git add -A` → staged 変更があれば `commit -m "finalize: <slug>"` → branch へ push（1 回 retry）。
- **ManagedRuntime**: no-op（worktree 無し）。

呼び出しは `pipeline.ts` の終端分岐で `await deps.runtimeStrategy?.commitFinalState(deps, state)`。

**Rationale**: 終端遷移の結果（最終 state.json / events.jsonl）を branch に乗せて初めて、merge 後の main が `awaiting-archive` を持ち、archive の `git mv` が `awaiting-archive` を archive でき、`markJobArchived` が `awaiting-archive → archived` を遷移できる。終端 commit は D1〜D4 を成立させる前提。

**Alternatives considered**:
- *CommandRunner（pipeline.run 後）で commit する*: 終端遷移と commit が別レイヤに割れて凝集が下がる。終端遷移は pipeline 内にあるため、その直後に置く方が「終端 phase 完了 → 同梱 commit」が一体化する。却下。
- *pr-create step の commit を `finalizeStep` の後ろに動かす*: 終端遷移は step より後の pipeline レイヤで起きるため、step 内 commit の移動では終端遷移分を拾えない。却下。

### D6: archived = terminal を既存 `job ls` フィルタで除外する（新規フィルタ不要）

`job ls`（既定）は既に `allJobs.filter((j) => !isTerminal(j.status))` で終端（`archived` / `canceled`）を除外している。`JobStateStore.list()` は active と archived 双方を走査し jobId で dedup（newest `updatedAt` 勝ち）する。D1〜D5 により archive-location の state.json が `archived`（最新 `updatedAt`）になるため、legacy jobId ストアの `running`（古い `updatedAt`）は dedup で負けて既定 ls から消える。新規フィルタは不要。

**Rationale**: 要件 4 の本質は status が `archived` になること（D1〜D5）であり、表示層は不変。

**Alternatives considered**:
- *`job ls` 側で archive folder を別扱いして隠す*: 表示層に状態判定を持ち込み二重管理になる。status=terminal を唯一の根拠に保つ方が cohesion が高い。却下。

### D7: 冪等性 — terminal no-op と awaiting-archive 取り残しの再実行安全

`job archive` の再実行は次のとおり冪等になる。

- 正本が `archived`（終端）: Phase 0 の `TERMINAL_STATUSES` チェックで no-op exit 0（既存挙動）。
- 正本が `awaiting-archive` で folder 移動済み: Phase 0 gate 通過 → Phase 1 で `archiveChangeFolder` は source 不在で skip → `markJobArchived` が archive-location を解決し `awaiting-archive → archived` を persist → stage/commit/push。新規コマンド不要。

**Rationale**: 取り残し job の再実行完了を、専用コマンドを足さずに既存 archive の冪等性として吸収する。`transitionJob` の same-status noop と resolver の location 解決が再実行の安全性を担保する。

**Alternatives considered**:
- *`job reconcile` 等の新規コマンドを追加する*: request.md のスコープ外指定どおり却下。既存 `job archive` の冪等再実行で同等の結果が得られるため、新規コマンドのコストを払う理由がない。

## Consequences

### Positive

- gate（`assertJobFinishable`）と最終遷移（`markJobArchived`）が同一の state ソース（slug 正本）を参照し、`running → archived` 不正遷移が原理的に発生しない構造になる。
- archive commit に `archived` 化が同梱されることで、merge 後 main の archive-location `state.json` が常に `archived` を持つ。
- `job ls` の既存フィルタがそのまま機能し、archived job が既定一覧から自動的に消える。
- folder 移動済みで `awaiting-archive` のまま取り残された job を `job archive` の冪等再実行で救える。新規コマンド不要。
- 終端 commit（`finalize: <slug>`）が step commit 群に 1 件追加され、branch 同伴 state の完全性が保たれる。

### Negative

- 終端 commit が 1 つ増える（pipeline 完走ごとに `finalize:` commit が branch に乗る）。
- `RuntimeStrategy` interface に `commitFinalState` が追加され、将来の新 runtime 実装で no-op または実装が必要になる。
- `JobStateStore` の `changeDir` seam により、archive-location での `load()` 時に `slugInject` が active location のパスを注入する（`markJobArchived` はこの値を使わないため実害なし）。

### Known Debt

- 旧コード（終端 commit 無し）で既に merge 済みで main content が `running` の job は、archive-location も `running` になり D7 の再実行では救えない。手動 state 修正が要る一過性の移行対象。
- `markJobArchived` は `state.json` を 2 回読む（jobId 取得用の raw `fs.readFile` + `store.load()` 内の `loadSplitLayout`）。`changeDir` seam では `jobId` はパス解決に使われないため実害はないが冗長（review-feedback-001 finding #1）。
- archive Phase 2 の jobId ストア worktreePath クリア（`new JobStateStore(jobId, cwd)` で `worktreePath: null` 永続化）は slug モデルでは vestige。dedup で archived が勝つため害は無いが、撤去は別途。
- 終端 commit を `awaiting-resume`（escalate / exhaustion）終端にも広げて CI 再 checkout resume の完全性を高めるかは別件。

## References

- Request: `specrunner/changes/finalize-job-on-slug-state/request.md`
- Design: `specrunner/changes/finalize-job-on-slug-state/design.md`
- Review feedback: `specrunner/changes/finalize-job-on-slug-state/review-feedback-001.md`
- Related: `specrunner/adr/2026-06-06-event-journal-slug-dir-state-model.md`（slug dir state model の前提、段2）
- Related: `specrunner/adr/2026-06-01-runtime-strategy-artifact-lifecycle.md`（RuntimeStrategy step artifact lifecycle、`commitFinalState` seam の先行設計）
- Related: `specrunner/adr/2026-05-22-job-state-store-di.md`（JobStateStore の DI パターン）
- Related: `specrunner/adr/2026-05-21-dated-archive-folders.md`（archive dir の date-prefix 規約）
- Implementation: `src/core/archive/orchestrator.ts`・`src/core/finish/job-state-update.ts`・`src/core/finish/resolve-canonical-state-dir.ts`・`src/core/pipeline/pipeline.ts`・`src/core/runtime/local.ts`・`src/core/runtime/managed.ts`・`src/core/port/runtime-strategy.ts`・`src/core/step/commit-push.ts`・`src/store/job-state-store.ts`
