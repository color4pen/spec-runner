# Design: local runtime の state 書き込みを slug/sidecar に一本化する

## Context

job state は 2 系統で正本を持つ。

- **slug 正本**（`specrunner/changes/<slug>/state.json` + `events.jsonl`, branch 同伴 / worktree 配下）— status / step / journal / pullRequest 等のポータブルな真実。
- **sidecar**（machine-local, `.specrunner/local/<slug>/`）— local は `liveness.json`（`{ pid, session, worktreePath, jobId }`）、managed は `marker.json`。`jobId ↔ slug ↔ worktreePath` の index。

加えて legacy の jobId-keyed ストア `.specrunner/jobs/<jobId>/`（`state.json` + `events.jsonl`）が存在する。R1（`decouple-jobs-dir-reads`）で local runtime の **読み取り**は slug 正本 + sidecar 起点へ移行済みで、jobId ストアは読み取り経路から外れた（`load()` の fallback readFile / managed の marker→jobs-dir のみ温存）。一方 **書き込み**は依然 jobId ストアに残っており、`.specrunner/jobs/` を生かし続ける唯一の理由になっている。

本変更は local runtime の state 書き込みを **slug 正本 + sidecar のみ**へ一本化し、jobId ストアへの書き込みを止める。

### 現状の local 書き込み経路（jobId ストアに書くもの）

| # | 場所 | 内容 | 現状 |
|---|------|------|------|
| W1 | `JobStateStore.create()`（`store/job-state-store.ts`）← `command/pipeline-run.ts` | 初期 state を **jobId ストアへ永続化** | worktree 確立前に走るため slug 正本にまだ書けない |
| W2 | `LocalRuntime.updateJobState()`（`core/runtime/local.ts`） | 無条件で jobId ストアへ persist（+ slug ストアへ best-effort） | dual-write 本体 |
| W3 | `command/runner.ts` 終端 persist（WORKSPACE_SETUP_FAILED / INIT_FAILED / pipeline crash） | `new JobStateStore(jobId, repoRoot).fail()` で jobId ストアへ | runtime 非依存層 |
| W4 | `command/resume.ts` の stale-recovery / running 遷移 persist | `new JobStateStore(jobId, cwd).persist()` で jobId ストアへ | prepare() 内、setupWorkspace 前 |
| W5 | `lifecycle/exit-guard.ts` の `handleGlobalExit` | `new JobStateStore(state.jobId, repoRoot).persist()` で jobId ストアへ | `handlePerJobExit` は R1 で slug 化済み |
| W6 | `cancel/runner.ts` の canceled persist | `new JobStateStore(jobId, repoRoot).persist()` で jobId ストアへ | cleanup（worktree+branch 削除）後に persist |

`LocalRuntime` の他の persist（step 実行時の `deps.storeFactory`、`commitFinalState`、`registerCleanup` の `signalCleanup` / `cleanupWorktreeOnFailure`）は R1 準備で既に slug ストア（`slugStoreOpts()` / `makeStore()`）経由になっており、jobId ストアに書かない。

### 共有点：`create()` は local / managed 両方が使う

`JobStateStore.create()` は `PipelineRunCommand.prepare()`（`specrunner run` の prepare、runtime 非依存）から呼ばれ、**local と managed の両方**で job 起動点になる。managed は worktree / slug 正本を持たず full state を jobId ストアにのみ保持するため、`create()` の jobId ストア永続化に依存している。W1 を素朴に撤去すると managed が壊れるため、defer は runtime ごとに分岐させる必要がある。

## Goals / Non-Goals

**Goals**:

- local runtime の全 state 書き込み経路（W1–W6）が jobId ストア（`.specrunner/jobs/<jobId>/`）に書かない。
- 初期 state 永続化を **worktree 確立後**まで遅延（defer）し、slug 正本 + sidecar に書く。
- machine-local フィールド（worktreePath / pid / session）は sidecar、portable な state は slug 正本、という役割分担を全経路で一貫させる。
- managed runtime の書き込み挙動（jobId ストア）と、R1 で温存した読み取り経路（`load()` fallback readFile / marker→jobs-dir）を不変に保つ。
- `bun run typecheck && bun run test` を green に保つ。

**Non-Goals**:

- **managed runtime の state 書き込み**の slug/sidecar 化（別 request `managed-slug-keyed-state`）。本変更は managed の jobId ストア書き込みを温存する。
- `JobStateStore.load()` の `.specrunner/jobs/` fallback 除去、`xdg.ts` helper / doctor checks の撤去、旧 `.specrunner/jobs/` データの migration（別 request `retire-jobs-dir`）。

## Decisions

### D1: 初期 state 永続化を `create()` から分離し、RuntimeStrategy が bootstrap を所有する（defer 方式）

`JobStateStore.create()` の責務「jobId 採番 + 初期 state 構築 + jobId ストア永続化」のうち、**永続化を切り離す**。

- 初期 state の構築（jobId 採番 + `JobState` 組み立て）を純粋関数 `buildInitialJobState(params)`（I/O なし）として `store/job-state-store.ts` に切り出す。
- `JobStateStore.create()` は `buildInitialJobState()` + jobId ストア永続化として**残す**（managed と既存テストが利用する。挙動不変）。
- `RuntimeStrategy` に `bootstrapJob(repoRoot, params): Promise<JobState>` を追加する。
  - **Local**: `buildInitialJobState()` のみ（**永続化しない**）。in-memory の初期 state を返す。
  - **Managed**: `JobStateStore.create()`（mint + jobId ストア永続化。現状維持）。
- `PipelineRunCommand.prepare()` は `JobStateStore.create()` 直呼びをやめ、`this.runtime.bootstrapJob()` を呼ぶ。jobId は返り値から得てそのまま branch 名導出（`jobId.slice(0,8)`）に使う。

**Rationale**: 「どこに初期 state を書くか」は runtime ごとに異なる（local=slug+sidecar、managed=jobId）方針判断であり、runtime に閉じるのが Ports & Adapters の筋。`create()` を温存することで managed と全テスト（`JobStateStore.create()` をセットアップに使う多数の test）の blast radius をゼロに保てる。

**Alternatives considered**:
- *`create()` 自体を非永続化に変える*: managed が壊れ、`create()` をセットアップに使う全テストが破綻する。却下。
- *`PipelineRunCommand.prepare()` で `config.runtime` を直接分岐*: prepare() を runtime 詳細に結合させる。runtime に分岐を閉じる方が DSM 的に正しい。却下。
- *sidecar に bootstrap state を別途置く*: state の二重持ち＝split-brain 再導入。architect 評価で不採用。却下。

### D2: 遅延した初期永続化を `setupWorkspace` の seeding で行い、`updateJobState` を slug 一本化する

local の初期永続化は worktree 確立後に行う。`setupWorkspace()` が **新規 worktree を作成する経路**（run / resume-recreate / resume-null）で、in-memory state を新 worktree の slug ストアへ **fresh write（seed）**する。

- `WorkspaceOptions` に `bootstrapState?: JobState` を追加し、`PipelineRunCommand.prepare()`（初期 state）と `ResumeCommand.prepare()`（running 遷移後 state）が設定する。
- `LocalRuntime.setupWorkspace()` は新規 worktree 作成直後（既存の `updateJobState` / `writeLivenessSidecar` 呼び出しより前）に `bootstrapState` を slug ストアへ persist する。worktree 再利用経路（slug ストアが既に worktree 内に存在）では seed しない。
- `LocalRuntime.updateJobState()` を **slug ストア専用**にする：slug ストアから load → mutate → slug ストアへ persist。jobId ストアへの persist（W2）と jobId ストア load fallback を撤去する。machine-local フィールドは slug-mode で strip されるため slug ストアには portable のみが残る。

**Rationale**: seed 後は slug ストアが worktree 内に存在するため、`setupWorkspace` 内の後続 `updateJobState`（worktreePath / branch / request.path の更新）が slug ストア load で成立する。create() が永続化しなくなった穴を seed が埋める。

**Alternatives considered**:
- *`updateJobState` の load 失敗時に provided seed を使う暗黙経路*: seed の責務が散らばり可読性が落ちる。明示的に setupWorkspace で 1 回 seed する方が追える。却下。

### D3: machine-local / portable の書き分けを sidecar / slug 正本に一貫させる

- **portable**（status / step / branch / journal / pullRequest 等）→ slug 正本。`slug-mode` の `stateToStateJson` が machine-local を strip するため自然に成立する。
- **machine-local**（worktreePath / pid / session）→ sidecar（`liveness.json`）。`writeLivenessSidecar()` が唯一の writer。
- resume 再利用経路（既存 worktree）でも sidecar の `pid` を現プロセスの値に更新（refresh）する。`isStaleRunning` は slug-mode で `state.pid` が strip される結果 sidecar の `pid` を参照するため、resume 後に sidecar pid が旧プロセスのままだと誤判定を生む。

**Rationale**: 要件 4 の役割分担を「writer の単一化」で担保する。slug ストアに machine-local を渡しても strip されるだけなので、machine-local は sidecar writer に集約する。

### D4: cross-cutting な persist 経路を「runtime-dispatch」と「sidecar-inference」で正しいストアへ向ける

W3–W6 は runtime 非依存層（`command/` `lifecycle/` `cancel/`）にあり、local は slug 正本、managed は jobId ストア、と書き先が分かれる。呼び出し側の文脈に応じて 2 方式を使い分ける。

- **runtime-dispatch**（呼び出し側が `RuntimeStrategy` を保持する場合）: `RuntimeStrategy.persistJobState(jobId, slug, workspace, state): Promise<void>` を追加。
  - **Local**: 書き込み可能な slug ストアを解決（`workspace.worktreePath` → sidecar の worktreePath → `resolveCanonicalStateDir(slug)` の順、いずれも実在を確認）し portable を persist、machine-local を sidecar 更新。解決できなければ **best-effort skip**（jobId ストアには決して書かない）。
  - **Managed**: jobId ストアへ persist（現状維持）。
  - 利用: `command/runner.ts` の WORKSPACE_SETUP_FAILED / INIT_FAILED 終端 persist（W3）。
- **sidecar-inference**（呼び出し側が `RuntimeStrategy` を持たない、または job ごとに runtime が異なりうる場合）: `resolveStateStoreByJobId(repoRoot, jobId): Promise<JobStateStore | null>` を `core/job-access/` に新設（`loadStateByJobId` の writable 版）。
  - sidecar `kind="local"`: worktree の slug ストア（実在時）→ `resolveCanonicalStateDir` の changeDir ストア → なければ `null`（degraded skip。jobId ストアには書かない）。
  - sidecar `kind="managed"`: jobId ストア。
  - sidecar なし（legacy / sidecar 未生成）: jobId ストア（安全網。legacy local と既存テストの後方互換）。
  - 利用: `command/resume.ts`（W4）、`cancel/runner.ts`（W6）、`lifecycle/exit-guard.ts` の `handleGlobalExit`（W5）。
- `command/runner.ts` の **pipeline crash** 終端 persist（W3 の一部）は、その時点で `deps` が確立しているため `deps.storeFactory(jobId)`（local=slug / managed=jobId）を用いる。load-check（disk status が running の時のみ fail）ロジックは温存する。

**Rationale**: WORKSPACE_SETUP_FAILED は sidecar 未生成（`writeLivenessSidecar` 前に失敗）になりうるため、sidecar-inference では local/managed を区別できない（no-sidecar→jobId で local も jobs-dir に書いてしまう）。よって `RuntimeStrategy` を持つ runner は runtime-dispatch を用い、local は確実に skip する。一方 resume / cancel / exit-guard が扱う job は sidecar（liveness / marker）を持つか、持たない場合は legacy 安全網で十分なため sidecar-inference で足りる。`persistJobState` は store を返さず persist を内包し、port → store の逆依存を作らない。

**Alternatives considered**:
- *全経路を `resolveStateStoreByJobId` に統一*: runner WORKSPACE_SETUP_FAILED の local が no-sidecar→jobId に落ちて jobs-dir に書く。AC（jobs-dir 書き込みゼロ）と trade-off（早期失敗の記録は残さない）に反する。却下。
- *全経路に runtime を注入*: cancel は任意 job（runtime が config と一致しない可能性）を扱い、exit-guard global は runtime を持たない。job ごとの kind は sidecar が真実。却下。

### D5: bootstrap defer の crash window を許容する

`bootstrapJob`（local）は永続化しないため、jobId 採番後・worktree seed 前にクラッシュすると当該 job の記録はどこにも残らない。

**Trade-off**: draft（`specrunner/drafts/<slug>/`）は `setupWorkspace` の request.md 移動が成功するまで残るため、この window のクラッシュは re-run で回復可能。architect 評価済みの許容事項。

### D6: cancel の local job は degraded を許容する

`cancelSingleJob` は cleanup（worktree 削除 + branch 削除）を persist より前に行う。local の slug 正本は worktree+branch に同伴するため、persist 時点で書き込み先が存在しない。`resolveStateStoreByJobId` は local（sidecar あり・worktree 消失）に対し `null` を返し、cancel は canceled state の persist を **skip** する（jobId ストアにも書かない）。jobId は sidecar に残るため `resolveId` から失われない。

**Rationale**: R1 で既に受容済みの「canceled local job の degraded 化」を書き込み側でも踏襲する。worktree+branch を破棄する以上、canceled state の portable な置き場は存在せず、sidecar に portable state を置くのは役割分担（D3）に反する。managed（worktree-less, jobId ストアに full state）と legacy（no-sidecar 安全網）は従来どおり jobId ストアへ persist される。

### D7: managed 書き込み・load fallback・xdg を温存する

managed の jobId ストア書き込み（`create()` 経由の bootstrap、`updateJobState`、`signalCleanup`、`persistJobState` の managed 実装）、`load()` の jobs-dir fallback readFile、`xdg.ts` helper / doctor checks は本変更で**一切変更しない**（Non-Goal）。

## Risks / Trade-offs

- [Risk] **bootstrap crash window で記録消失**（D5）→ Mitigation: draft 残存により re-run 回復可能。trade-off として明示。
- [Risk] **cancel/local の canceled state 非永続化**（D6）→ Mitigation: jobId は sidecar に保持され `resolveId` で生存。`job ls` の default は terminal を元々除外（`!isTerminal`）するため既定表示は不変。`--all` の canceled local 表示は degrade しうる旨を test で固定。
- [Risk] **WORKSPACE_SETUP_FAILED（local）の failed state 非永続化**（D4）→ Mitigation: trade-off（D5）と同列。worktree 未確立のため portable 置き場が無く、draft 残存で回復可能。
- [Risk] **既存テストの破綻**: cancel / exit-guard / state-store の test は `JobStateStore.create()`（jobId ストア）でセットアップし sidecar を併置しない。`resolveStateStoreByJobId` の no-sidecar→jobId 安全網により jobId ストアへ persist され従来アサートは green を維持する。新規 integration test のみ sidecar 併設で local-skip を検証する。
- [Trade-off] **`storeFactory` / `makeStore` の no-worktree fallback（`local.ts`）**: worktree 未設定時に jobId ストアを返す分岐は、local では setupWorkspace 後に worktree が常に在るため到達しない。本変更では到達不能経路として温存（撤去は `retire-jobs-dir` で）。

## Open Questions

- resume 再利用経路での sidecar pid refresh（D3）は本変更に含めるが、`isStaleRunning` 以外に sidecar pid を参照する経路が将来増えた場合の影響は後続で再検討。
- legacy（no-sidecar）local job への書き込みは安全網で jobId ストアへ残る。これらの完全な解消は `retire-jobs-dir`（旧データ migration）で扱う。

## Migration Plan

- **振る舞い互換**: 書き込み先の差し替えのみ。slug 正本 / sidecar の schema、jobId ストアの形式は不変。R1 で移行済みの読み取り経路はそのまま機能する。
- **既存 job**: sidecar を持つ active local job は worktree slug ストアへ書かれる。sidecar を持たない legacy job は安全網で従来どおり jobId ストアへ書かれる（読み取りは R1 の fallback で継続可能）。
- **rollback**: W1–W6 を元の jobId ストア直書きへ戻すだけで従来挙動に復帰。managed / データ形式は不変のため互換。
- **ADR**: 新 port メソッド（`bootstrapJob` / `persistJobState`）導入、bootstrap defer パターン、machine-local/portable の writer 単一化という設計選択を伴うため `adr: true`。ADR は後続ステップで起票する。
