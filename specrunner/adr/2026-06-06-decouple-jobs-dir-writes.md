# local runtime の state 書き込みを slug/sidecar に一本化する

**Date**: 2026-06-06
**Status**: accepted
**Related**: `specrunner/adr/2026-06-06-decouple-jobs-dir-reads.md`（読み取り経路の slug/sidecar 一本化。本 ADR の前提）
**Related**: `specrunner/adr/2026-06-06-event-journal-slug-dir-state-model.md`（slug dir を state 正本とする上位決定）
**Related**: `specrunner/adr/2026-05-22-job-state-store-di.md`（JobStateStore の DI パターン）

## Context

`decouple-jobs-dir-reads`（R1）で local runtime job の **読み取り**は slug 正本 + sidecar 起点に移行済み。一方 **書き込み**は依然 dual-write で `.specrunner/jobs/<jobId>/`（jobId ストア）にも書いており、これが jobs-dir を生かし続ける唯一の理由になっていた。

書き込み経路は 6 箇所あった（W1–W6）:

| # | 場所 | 内容 |
|---|------|------|
| W1 | `JobStateStore.create()` ← `command/pipeline-run.ts` | 初期 state を jobId ストアへ永続化（worktree 確立前） |
| W2 | `LocalRuntime.updateJobState()` | 無条件で jobId ストアへ persist（slug ストアへ best-effort） |
| W3 | `command/runner.ts` 終端 persist | `new JobStateStore(jobId).fail()` で jobId ストアへ |
| W4 | `command/resume.ts` の stale-recovery / running 遷移 | `new JobStateStore(jobId).persist()` で jobId ストアへ |
| W5 | `lifecycle/exit-guard.ts` の `handleGlobalExit` | `new JobStateStore(state.jobId).persist()` で jobId ストアへ |
| W6 | `cancel/runner.ts` の canceled persist | `new JobStateStore(jobId).persist()` で jobId ストアへ |

`JobStateStore.create()` は local/managed 両方の起動点であり、managed は worktree/branch を持たず jobId ストアへの永続化に依存するため、素朴な撤去は managed を壊す。また W3–W6 は runtime 非依存層（`command/` `lifecycle/` `cancel/`）にあり、local と managed で書き先が分かれる。

## Decision

### D1: 初期 state 永続化を `create()` から分離し、`RuntimeStrategy.bootstrapJob()` が所有する（defer 方式）

`JobStateStore.create()` の責務「jobId 採番 + 初期 state 構築 + jobId ストア永続化」のうち、**永続化だけを切り離す**。

- 初期 state 構築（jobId 採番 + `JobState` 組み立て）を純粋関数 `buildInitialJobState(params)`（I/O なし）として切り出す。
- `JobStateStore.create()` は `buildInitialJobState()` + jobId ストア永続化として**残す**（managed と既存テストが利用する。挙動不変）。
- `RuntimeStrategy` に `bootstrapJob(repoRoot, params): Promise<JobState>` を追加する。
  - **Local**: `buildInitialJobState()` のみ（永続化しない）。in-memory の初期 state を返す。
  - **Managed**: `JobStateStore.create()`（mint + jobId ストア永続化。現状維持）。
- `PipelineRunCommand.prepare()` は `JobStateStore.create()` 直呼びをやめ、`this.runtime.bootstrapJob()` を呼ぶ。

**Rationale**: 「どこに初期 state を書くか」は runtime ごとに異なる方針判断であり、runtime に閉じるのが Ports & Adapters の筋。`create()` を温存することで managed と全テストの blast radius をゼロに保てる。

### D2: 遅延した初期永続化を `setupWorkspace` の seeding で行い、`updateJobState` を slug 一本化する

local の初期永続化は worktree 確立後に行う。

- `WorkspaceOptions` に `bootstrapState?: JobState` を追加し、`PipelineRunCommand.prepare()`（初期 state）と `ResumeCommand.prepare()`（running 遷移後 state）が設定する。
- `LocalRuntime.setupWorkspace()` は新規 worktree 作成直後に `bootstrapState` を slug ストアへ **fresh write（seed）**する。worktree 再利用経路では seed しない。
- `LocalRuntime.updateJobState()` を **slug ストア専用**にする：slug ストアから load → mutate → slug ストアへ persist。jobId ストアへの persist（W2）を撤去する。

**Rationale**: seed 後は slug ストアが worktree 内に存在するため、後続 `updateJobState` が slug ストア load で成立する。

### D3: machine-local / portable の書き分けを sidecar / slug 正本に一貫させる

- **portable**（status / step / branch / journal / pullRequest 等）→ slug 正本。`slug-mode` の `stateToStateJson` が machine-local を自動 strip する。
- **machine-local**（worktreePath / pid / session）→ sidecar（`liveness.json`）。`writeLivenessSidecar()` が唯一の writer。
- resume 再利用経路（既存 worktree）でも sidecar の `pid` を現プロセスの値に更新（refresh）する。`isStaleRunning` は slug-mode で `state.pid` が strip されるため sidecar の `pid` を参照しており、refresh しないと誤判定が生じる。

**Rationale**: 「writer の単一化」で役割分担を担保する。slug ストアに machine-local を渡しても strip されるだけなので、machine-local は sidecar writer に集約する。

### D4: cross-cutting な persist 経路を「runtime-dispatch」と「sidecar-inference」で正しいストアへ向ける

W3–W6 は runtime 非依存層にあり、2 方式を使い分ける。

**runtime-dispatch**（呼び出し側が `RuntimeStrategy` を保持する場合）:
- `RuntimeStrategy.persistJobState(jobId, slug, workspace, state): Promise<void>` を追加。
  - **Local**: 書き込み可能な slug ストアを解決（`workspace.worktreePath` → sidecar の worktreePath → `resolveCanonicalStateDir` の順）し portable を persist、sidecar を更新。解決できなければ best-effort skip（jobId ストアには決して書かない）。
  - **Managed**: jobId ストアへ persist（現状維持）。
- 利用: `command/runner.ts` の WORKSPACE_SETUP_FAILED / INIT_FAILED 終端 persist（W3）。

**sidecar-inference**（呼び出し側が `RuntimeStrategy` を持たない、または job ごとに runtime が異なりうる場合）:
- `resolveStateStoreByJobId(repoRoot, jobId): Promise<JobStateStore | null>` を `core/job-access/` に新設。
  - sidecar `kind="local"`: worktree の slug ストア（実在時）→ `resolveCanonicalStateDir` の changeDir ストア → なければ `null`（degraded skip。jobId ストアには書かない）。
  - sidecar `kind="managed"`: jobId ストア。
  - sidecar なし（legacy / sidecar 未生成）: jobId ストア（安全網。legacy local と既存テストの後方互換）。
- 利用: `command/resume.ts`（W4）、`cancel/runner.ts`（W6）、`lifecycle/exit-guard.ts` の `handleGlobalExit`（W5）。
- `command/runner.ts` の **pipeline crash** 終端 persist（W3 の一部）は、`deps.storeFactory(jobId)`（local=slug / managed=jobId）を用いる。

**Rationale**: WORKSPACE_SETUP_FAILED は sidecar 未生成（`writeLivenessSidecar` 前に失敗）になりうるため、sidecar-inference では local/managed を区別できない（no-sidecar→jobId で local も jobs-dir に書いてしまう）。よって runner は runtime-dispatch を用い local は確実に skip する。resume / cancel / exit-guard が扱う job は sidecar を持つか、持たない場合は legacy 安全網で十分なため sidecar-inference で足りる。

### D5: bootstrap defer の crash window を許容する

`bootstrapJob`（local）は永続化しないため、jobId 採番後・worktree seed 前にクラッシュすると当該 job の記録はどこにも残らない。draft（`specrunner/drafts/<slug>/`）は `setupWorkspace` の request.md 移動が成功するまで残るため、この window のクラッシュは re-run で回復可能。architect 評価済みの許容事項。

### D6: cancel/local の canceled state 非永続化を許容する

`cancelSingleJob` は cleanup（worktree 削除 + branch 削除）を persist より前に行う。local の slug 正本は worktree+branch に同伴するため、persist 時点で書き込み先が存在しない。`resolveStateStoreByJobId` は local（sidecar あり・worktree 消失）に対し `null` を返し、cancel は canceled state の persist を skip する（jobId ストアにも書かない）。jobId は sidecar に残るため `resolveId` から失われない。

**Rationale**: R1 で既に受容済みの「canceled local job の degraded 化」を書き込み側でも踏襲する。managed と legacy（no-sidecar 安全網）は従来どおり jobId ストアへ persist される。

### D7: managed 書き込み・load fallback・xdg を温存する

managed の jobId ストア書き込み（`create()` 経由の bootstrap、`updateJobState`、`persistJobState` の managed 実装）、`load()` の jobs-dir fallback readFile、`xdg.ts` helper / doctor checks は本変更で一切変更しない。

## Alternatives Considered

### Alternative 1: `create()` 自体を非永続化に変える

- **Pros**: `bootstrapJob` という新 port メソッドを追加せずに済み、呼び出し側 (`pipeline-run.ts`) が `create()` 一本でシンプルに使える
- **Cons**: managed が壊れ、`create()` をセットアップに使う全テストが破綻する
- **Why not**: blast radius が managed と全テストに及ぶため却下

### Alternative 2: `PipelineRunCommand.prepare()` で `config.runtime` を直接分岐する

- **Pros**: `RuntimeStrategy` に新 port を追加せず、prepare() 内だけで完結する
- **Cons**: prepare() が runtime 実装詳細を知ることになり、runtime 層との依存が逆転する
- **Why not**: runtime に分岐を閉じる方が DSM 的に正しい。却下

### Alternative 3: sidecar に bootstrap state を別途置く

- **Pros**: crash window 問題を解消できる（jobId 採番直後から state が残り、early-crash でも記録が失われない）
- **Cons**: slug 正本と sidecar の両方に state を持つ split-brain が再導入される
- **Why not**: architect 評価で不採用。state の二重持ちを正当化できない。却下

### Alternative 4: `updateJobState` の load 失敗時に provided seed を使う暗黙経路

- **Pros**: `WorkspaceOptions` に `bootstrapState` フィールドを追加せずに済む
- **Cons**: seed の責務が `updateJobState` 内の暗黙条件に散らばり、どこで初期化されたか追いにくくなる
- **Why not**: 明示的に `setupWorkspace` で 1 回 seed する方が読める。却下

### Alternative 5: 全経路を `resolveStateStoreByJobId` に統一する

- **Pros**: runtime-dispatch と sidecar-inference の二方式を保持せず、実装が単一経路で済む
- **Cons**: runner の WORKSPACE_SETUP_FAILED は sidecar 未生成のため no-sidecar→jobId 安全網に落ち、local でも jobs-dir に書いてしまう。受け入れ基準（jobs-dir 書き込みゼロ）に反する
- **Why not**: runner は `RuntimeStrategy` を保持しており runtime-dispatch が使えるため、単一化の利便性より正確性を優先。却下

### Alternative 6: 全経路に runtime を注入する

- **Pros**: runtime 種別を明示的に保持し、sidecar 不在でも runtime から local/managed を判定できる
- **Cons**: cancel は設定 runtime と異なる job を扱う可能性があり、exit-guard global は runtime インスタンスを持たない。job ごとの kind は sidecar が唯一の真実
- **Why not**: 注入経路の設計コストに見合う利点がない。却下

## Consequences

### Positive

- local runtime は `.specrunner/jobs/` を読みも書きもしなくなり、jobs-dir の存在意義が消える
- slug 正本（portable）と sidecar（machine-local）の役割分担が全書き込み経路で一貫する
- managed と既存テストは jobId ストア経路が完全に維持され blast radius ゼロ

### Negative / Known Debt

- bootstrap crash window（jobId 採番後・seed 前のクラッシュ）で当該 job の記録が残らない。draft 残存で re-run 回復可能（D5）
- cancel/local の canceled state が永続化されない。jobId は sidecar に保持（D6）
- WORKSPACE_SETUP_FAILED（local）の failed state が永続化されない。draft 残存で re-run 回復可能（D4）
- no-sidecar legacy local job への書き込みは安全網で jobId ストアへ残る。完全な解消は `retire-jobs-dir` で対応
- `storeFactory` / `makeStore` の no-worktree fallback（worktree 未設定時に jobId ストアを返す）は到達不能経路として温存。撤去は `retire-jobs-dir` で対応

## References

- Request: `specrunner/changes/decouple-jobs-dir-writes/request.md`
- Design: `specrunner/changes/decouple-jobs-dir-writes/design.md`
- Related: `specrunner/adr/2026-06-06-decouple-jobs-dir-reads.md`（読み取り経路の一本化。本 ADR の前提）
- Related: `specrunner/adr/2026-06-06-event-journal-slug-dir-state-model.md`（slug dir state model の上位決定）
- Related: `specrunner/adr/2026-05-22-job-state-store-di.md`（`changeDir` seam の DI パターン）
