# Design: 並列 round の git 副作用を coordinator が round 単位で所有する（scoped staging・非宣言変更 halt）

## Context

`architecture/adr/2026-07-13-execution-ownership-model.md`（accepted）の **D3 — git 副作用の round 所有 ＋ scoped staging** の並列 round 実装。ADR の提案 invariant **B-15**（parallel round の stage / commit は coordinator 所有点だけが行い、member 実行経路から Git stage / commit port を呼ばない）を挙動として実現する request。R3 で `ParallelReviewRound` は挙動不変で抽出済み、R5（本 request）で git 副作用の所有を round へ移す。

### 現状の構造

- **member commit**（`src/core/step/executor.ts` `runAgentStep`、finalize ブロック ≈ L343-374）: agent step 成功後、`deps.runtimeStrategy.finalizeStepArtifacts(step, state, deps, headBeforeStep, commitPushInfra)` を **commit mutex（FIFO）でシリアライズして**呼ぶ。
- **finalizeStepArtifacts の実体**（`src/core/runtime/local.ts:746-758`）: `cleanupOutputTemplates` → `commitAndPush`。`commitAndPush`（`src/core/step/commit-push.ts:33`）は共有 worktree に対し `git add -A` → `git commit -m "<step>: <slug>"` → `push`（1 retry）を行う。
- **fan-out**（`src/core/pipeline/parallel-review-round.ts:180-194`）: `Promise.allSettled` で pending member を実行し、各 member を `this.executor.execute(memberStep, state, roundDeps)` で回す（`roundDeps = { ...deps }`、R4/B-16）。各 member が上記 member commit を行う。共有 worktree のため `git add -A` は他 member の出力・pipeline 簿記も stage しうる。commit 直列化はされるが、**どの member の成果物をどの commit が所有するかは fan-out 解決順に依存**（attribution 問題）。
- **member の宣言出力**（`src/core/step/custom-reviewer.ts:134-139`）: custom reviewer step の `writes(state, deps)` は `customReviewerResultPath(slug, name, iteration)`（= `specrunner/changes/<slug>/<name>-result-NNN.md`）を返す。custom reviewer は `getOutputTemplates` に含まれず（`src/templates/step-output-templates.ts:524`）、B-group template も持たないため `cleanupOutputTemplates` は member では no-op。
- **member 実行中の pipeline 簿記**（`src/core/step/commit-orchestrator.ts` `begin` / `commitSuccess`）: `store.persist`（`state.json` / `events.jsonl`）＋ `appendInvocation`（`usage.json`）＋ `appendLineage`（`events.jsonl`）を書く。これらは worktree で git-tracked（branch-borne）。commit 後の persist なので、**step 完了後は常にこれら簿記が未 commit で残る**（現状も同様で、次 step の `git add -A` が拾う）。
- **coordinator の終端**（`parallel-review-round.ts:233-261`）: merge / aggregate 後、synthetic coordinator `StepRun`（verdict は aggregate）を push し、`store.persist` する。coordinator の outcome は `approved` / `needs-fix` / `escalation`。`escalation` は transition table に行が無く、pipeline は `transition?.to ?? "escalate"`（`pipeline.ts:342`）で escalate 終端へ落とす（既存の handled path）。

### 構造的欠陥

git commit の所有が「どの member が先に finalize したか」という fan-out 解決順で偶然決まる。共有 worktree では member 単位の attribution が原理的に不可能であり、`git add -A` は他 member の出力と pipeline 簿記まで巻き込む。ADR D3 が閉じるべき残余そのものである。

## Goals / Non-Goals

**Goals**:

- member 実行経路から git stage / commit port（`finalizeStepArtifacts`）の呼び出しを除去する（R1 / B-15）。
- coordinator（`ParallelReviewRound`）が round 単位で、round member の宣言出力 union だけを scoped stage（`git add -A -- <declared>`、`git add -A` 無差別 stage は不使用）して commit / push する。宣言範囲内の削除・置換も拾う（R2）。
- round member が宣言外のファイルを変更した場合（changed ⊆ declared が破れた場合）、round 全体を halt（escalation）する。判定は round 単位（member attribution は不可能）（R3）。
- pipeline 管理 path（`state.json` / `usage.json` / `events.jsonl`）を round commit にも changed ⊆ declared 判定にも含めない。
- 逐次経路の commit 挙動を byte-for-byte 不変に保つ（R4）。

**Non-Goals**:

- round state の single-writer（member no-persist / round commit の統合）= R6。本 request では member は従来どおり `CommitOrchestrator.apply` で state を persist する（簿記が worktree に残る前提で設計する）。
- `architecture/` 配下の変更。B-15 の ratify（`model.md` §4 / `conformance.md` (A) / `core-invariants.test.ts` の歯＝静的 call-edge 禁止）は本 request の pipeline では行わず、実装 merge 後に attended で行う（trust-root を out-of-loop に保つ）。
- managed runtime の並列 custom reviewer 対応（既知の Non-Goal）。managed は worktree 変更列挙を `[]` で返し、round commit を no-op にする（fail-safe）。
- commit mutex（`executor.ts:88` `commitMutex`）の撤去。member が commit しなくなると並列 commit は消えるが、逐次経路の finalize は従来どおり mutex を通す（length-1 chain、挙動不変）。撤去は blast radius を広げるため本 request では行わない。
- round commit と state persist の二相境界の解消（ADR の既知 Negative、revision reconciliation は将来判断）。

## Decisions

### D1 — member 実行入力に「round 所有」を宣言し、executor の finalize を抑止する

`ParallelReviewRound.run` は fan-out 前の `roundDeps` 構築（`parallel-review-round.ts:185`）を `{ ...deps, roundOwnsGitEffects: true }` に拡張する。`StepExecutor.runAgentStep` の finalize ブロック（`executor.ts:343-374`）を `if (!deps.roundOwnsGitEffects) { ... }` で gate し、round 所有下では `finalizeStepArtifacts`（＝ `cleanupOutputTemplates` ＋ `commitAndPush`）を **一切呼ばない**。

`roundOwnsGitEffects?: boolean` を `PipelineDeps`（`src/core/types.ts`）に追加する。逐次経路の `deps` はこの field を持たない（`undefined` = 従来挙動）ため、逐次の finalize は不変。

**Rationale**: 「member 実行経路から commit port を呼ばない」を、executor と round の両方に散らばる分岐でなく、**round が構築する readonly な実行入力の宣言**で表す。B-16（R4 で landing）が既に `roundDeps` を per-round readonly 入力として構築しており、その入力へ「git 副作用は round が所有する」という 1 bit を足すのが最小。custom reviewer は round 経由でしか実行されない（`compose-reviewers.ts` の member は steps Map に居るが transition の currentStep には現れない）ため、flag は round 経路だけに立ち、逐次経路と衝突しない。

member では `cleanupOutputTemplates` も skip されるが、custom reviewer は B-group template を持たない（`getOutputTemplates` 既定 `[]`）ため no-op であり、skip して失うものは無い。

**Alternatives considered**:

- *`execute()` に options 引数を足して commit 抑止を渡す*: 逐次呼び出し（`pipeline.ts:278`）と round 呼び出し（`parallel-review-round.ts:192`）両方の signature 変更が必要で波及が広い。round が既に構築する `roundDeps` に載せる方が最小。却下。
- *finalize を `runAgentStep` から pipeline 側へ引き上げ、逐次だけ pipeline が commit する*: commit の所有点を producer から orchestrator へ移す大改修（D1 系）だが、要件「逐次経路の commit 挙動を変えない」に対しリスクが高い（commit 位置の移動で回帰しうる）。本 request では逐次の commit 位置を動かさず、flag で member だけ抑止する。R6 で改めて検討。却下。

### D2 — coordinator round 所有点の git primitive を RuntimeStrategy seam に置く

git 副作用は runtime 固有（local = worktree、managed = no-op）なので、`finalizeStepArtifacts` と同じく `RuntimeStrategy` の seam として 2 メソッドを追加する:

- `listWorktreeChanges(cwd): Promise<string[]>` — worktree の未 commit 変更（追加 `??` / 変更 / 削除 `D`）を repo 相対 path で列挙する。既存 snapshot-diff 機構（`local.ts:684-735` の `git status --porcelain -z --no-renames` パース）を worktree scope へ振り向けて再利用する。never-throw、error 時 `[]`。managed は `[]`。
- `commitRoundArtifacts(stagePaths, cwd, branch, coordinatorName, slug, commitPushInfra): Promise<void>` — scoped `git add -A -- <stagePaths>` → staged 変更があれば `git commit -m "<coordinatorName>: <slug>"` → `pushOnly`（1 retry）。managed は no-op。実体は `commit-push.ts` に helper（例: `commitScopedPaths`）として置き、`pushOnly` を再利用する。

両メソッドは port（`RuntimeStrategy`）では **optional** とし、`RealRuntimeStrategy`（`runtime-strategy.ts:468-472` の intersection）で **required** にする。既存の `canDeriveChangedFiles?` / `snapshotMainCheckoutGuard?` と同じパターンで、`RuntimeStrategy` 型の test fake は両メソッドを省略でき、実 runtime は compile-time で実装を強制される。

`ParallelReviewRound` は `commitPushInfra`（`{ spawnFn, sleepFn, events }`）を構築して `commitRoundArtifacts` へ渡す。infra 構築のため round constructor に `events: EventBus` を追加し、`Pipeline`（`pipeline.ts:120-121`）が `this.events` を渡す。`spawnFn` は `deps.gitTransportSpawn`（transport auth 付き、`types.ts:85`）、`sleepFn` は `deps.sleepFn ?? 既定`。これは executor が `commitPushInfra` を組んで `finalizeStepArtifacts` へ渡す構造（`executor.ts:100`）と対称。

**Rationale**: git 副作用の runtime 分岐は既に `RuntimeStrategy` に集約されている。round 所有点も同じ seam に置けば、managed の no-op / fail-safe が既存パターンで成立し、changed 列挙・scoped commit が runtime 実装として差し替え可能になる。changed ⊆ declared の判定（domain logic）は runtime に置かず、raw changed list を domain へ返して coordinator が判定する（下記 D3）。

**Alternatives considered**:

- *既存 `listChangedFiles` を再利用*: `listChangedFiles` は `git diff --name-only <base>...HEAD`（**commit 済** diff）で、member が commit しなくなると member の未 commit 出力を拾えない。round の changed は worktree（未 commit）で見る必要があり、`git status` 系の新 seam が要る。architect の「snapshot-diff 機構を worktree scope へ振り向けて再利用」に沿い、`snapshotMainCheckoutGuard` のパースを流用した新メソッドを置く。却下（再利用不可）。
- *round が `deps.spawn` で直接 git を叩く*: managed 分岐が round に漏れ、`finalizeStepArtifacts` と非対称になる。RuntimeStrategy seam に寄せる。却下。

### D3 — changed ⊆ declared の判定を pure module に切り出し、coordinator が halt/commit を決める

宣言範囲判定・pipeline 管理 path 除外・stage 対象決定は pure function に切り出す（新規 `src/core/pipeline/round-git-scope.ts`）:

- `pipelineManagedPaths(slug): string[]` — `[slugStateJsonPath(slug), slugEventsPath(slug), usageJsonPath(slug)]`（`util/paths.ts` の既存 path fn を使う）。
- `partitionRoundChanges({ changed, declared, slug }): { toStage: string[]; offending: string[] }` —
  - `managed = new Set(pipelineManagedPaths(slug))`
  - `toStage = changed.filter(f => declared.includes(f))`（changed ∩ declared。宣言範囲内の追加・変更・削除を拾い、`git add -A -- <toStage>` の pathspec が必ず git status にマッチするため pathspec-mismatch error を避ける）
  - `offending = changed.filter(f => !managed.has(f) && !declared.includes(f))`（宣言外かつ簿記外の変更）

`ParallelReviewRound.run` は fan-out（merge）**前**の base `state` から declared union を計算する（`this.steps.get(name).writes(state, roundDeps)` を pending member 分だけ集める）。member の `writes` は `nextIteration(state, name)` で iteration を決めるので、全 member が受け取った同一 base `state` から算出すれば、member が実際に書いた path と一致する。

fan-out / merge / aggregate 後、`listWorktreeChanges(cwd)` の結果 `changed` と declared から `partitionRoundChanges` を呼ぶ:

- `offending.length > 0` → **halt**: aggregate を `escalation` に上書きし、synthetic coordinator `StepRun.outcome.error` と `state.error` に `ROUND_NONDECLARED_CHANGE`（message に offending path 列挙）を記録する。`commitRoundArtifacts` は呼ばない。pipeline は `(coordinator, escalation)` に transition 行が無いため escalate 終端（awaiting-resume、reason は `state.error.message`）へ落ちる。
- `offending.length === 0` かつ `toStage.length > 0` → `commitRoundArtifacts(toStage, ...)`。aggregate verdict（approved / needs-fix）は従来どおり member 判定から導出（needs-fix でも宣言出力は commit する）。
- `runtimeStrategy` や `listWorktreeChanges` が無い（test fake 等）→ 判定・commit を skip（従来挙動、no-op）。

commit 後、既存の synthetic StepRun push と `store.persist` を行う（persist は `state.json` を再度未 commit にするが、これは従来と同じく次 step が拾う）。

**Rationale**: 「changed ⊆ declared」「scoped staging = declared に限定」は本 request の中核契約であり、pure function に切り出すことで git / executor 非依存で intended-invariant を固定できる（受け入れ基準の #2 / #3）。pipeline 管理 path の除外を `partitionRoundChanges` 内に閉じ込め、round commit が簿記を呑まないこと（architect 判断）と halt 判定が簿記で誤発火しないことを 1 箇所で保証する。halt を既存の escalation 終端へ載せるのは、coordinator escalation が既に handled path（`aggregateVerdict` が escalation を返しうる）であり、新しい停止経路を作らない最小手段。

**Alternatives considered**:

- *halt を `StepHalt` / throw で表現*: coordinator は `run()` が `{ outcome, state }` を返す設計で、escalation を outcome として既に扱える。throw 経路を新設すると pipeline の catch と二重になる。outcome escalation ＋ error 記録に留める。却下。
- *toStage を declared 全部にして `git add -A -- <declared>` を無条件に叩く*: member が宣言出力を書かなかった場合、未 tracked かつ未作成の pathspec が git add で mismatch error になる。`changed ∩ declared` に絞れば pathspec は必ず git status にマッチし、削除も（git status に `D` として現れるので）拾える。却下。
- *base ではなく merge 後 state で declared を計算*: merge 後は member の `StepRun` が push され `nextIteration` が進むため、member が実際に書いた path とずれる。fan-out 前 base で計算する。却下。

### D4 — 検出は worktree の単一 after-snapshot ＋ 簿記除外で足りる

round 開始前、worktree には直前逐次 step（code-review 等）の post-persist で簿記（`state.json` / `events.jsonl` / `usage.json`）だけが未 commit で残る（source は逐次 step の `git add -A` が commit 済）。round の member は宣言出力を書き、pipeline は簿記を更新する。よって round 完了後の `git status`（after-snapshot）を簿記除外でフィルタすれば、round が導入した非簿記変更 = member 由来の変更に一致する。before/after 差分を取らずとも、簿記除外（`pipelineManagedPaths`）で round-introduced な非宣言変更を同定できる。

**Rationale**: before-snapshot を取っても簿記は before/after 双方に現れ、いずれにせよ簿記除外が要る。非簿記の未 commit 変更は round 前には存在しない（逐次 step が commit 済）ため、after-snapshot ＋ 簿記除外で十分かつ最小。snapshot-diff 機構（`git status --porcelain`）はそのまま流用する。

**Alternatives considered**:

- *before/after 2 snapshot の差分*: 簿記は差分にも残る（member 実行中に更新される）ため簿記除外は結局必要。単一 after-snapshot ＋ 簿記除外と結果は同じで、実装は単純な方を採る。却下。

## Risks / Trade-offs

- **[Risk] 簿記 path の列挙漏れ** → member 実行中に pipeline が書く簿記が `state.json` / `events.jsonl` / `usage.json` 以外に増えると、それが offending 扱いされ round が誤 halt する。`CommitOrchestrator.begin` / `commitSuccess` が書くのはこの 3 つ（`store.persist` = state.json + events.jsonl、`appendInvocation` = usage.json、`appendLineage` = events.jsonl）で、`pipelineManagedPaths` の単一定義に集約する。将来 pipeline が別の簿記を書くようになったら同定義を更新する（テストで 3 path 固定）。
- **[Risk] round commit が簿記を残す（二相境界）** → 本 request では member が state を persist する（R6 前）ため、round commit 後も簿記は未 commit で残り、次 step の `git add -A` が拾う。現状（member commit）でも step 完了後に簿記が残る挙動と同型で、新たな未 commit 残留を増やさない。crash 時の二相不整合は ADR の既知 Negative（R6 / revision reconciliation で判断）。
- **[Risk] managed runtime での fail-safe** → managed は `listWorktreeChanges` が `[]` を返すため、declared があっても `toStage=[]` / `offending=[]` となり commit も halt も起きない。managed の並列 custom reviewer は既知の Non-Goal であり、`listChangedFiles` の managed=`[]` と同じ fail-safe 方針。
- **[Risk] commit mutex の残置** → member が commit しなくなり mutex の並列直列化は不要になるが、逐次経路の finalize は従来どおり mutex を通す（length-1、挙動不変）。撤去は別 request（本 request のスコープ外）。
- **[Risk] escalation 終端の情報量** → 非宣言変更 halt は escalation として awaiting-resume に落ちる。reason は `state.error.message`（= offending path 列挙）で、resume 時に人が worktree を検査できる。round commit を行わないので worktree の全変更はそのまま保持される。

## Open Questions

なし（architect 評価済みの設計判断で確定。R6 = member no-persist / round state single-writer は本 request の Non-Goal）。
