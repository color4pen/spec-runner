# Tasks: 並列 round の git 副作用を coordinator が round 単位で所有する（scoped staging・非宣言変更 halt）

> 実装順の原則: 中核契約（changed ⊆ declared / scoped staging）は interface-stable な pure function
> なので、まず T-01 でその intended-invariant を固定する。seam（flag / port method / coordinator 配線）
> を T-02〜T-04 で確定させてから、signature に依存する spy / behavior test を T-05 で置く。
> `architecture/` 配下・`specrunner/adr/` 配下は変更しない（スコープ外）。

## T-01: changed ⊆ declared / scoped staging の pure logic を intended-invariant として固定する

- [x] `src/core/pipeline/round-git-scope.ts`（新規、pure module、I/O なし）を作る:
  - `pipelineManagedPaths(slug: string): string[]` — `util/paths.ts` の `slugStateJsonPath` / `slugEventsPath` / `usageJsonPath` を使い `[state.json, events.jsonl, usage.json]`（いずれも `specrunner/changes/<slug>/` 相対）を返す。
  - `partitionRoundChanges({ changed, declared, slug }: { changed: string[]; declared: string[]; slug: string }): { toStage: string[]; offending: string[] }` —
    - `toStage = changed.filter(f => declared.includes(f))`（changed ∩ declared）。
    - `offending = changed.filter(f => !pipelineManagedPaths(slug).includes(f) && !declared.includes(f))`。
- [x] `src/core/pipeline/__tests__/round-git-scope.test.ts`（新規）で以下を固定する:
  - 宣言出力だけが changed のとき `toStage` = 宣言出力、`offending` = `[]`。
  - changed に宣言外 path（例: `src/foo.ts`）が混じると `offending` に含まれる。
  - changed に pipeline 管理 path（`state.json` / `events.jsonl` / `usage.json`）が混じっても `offending` に含まれず、かつ `toStage` にも入らない。
  - 宣言出力の削除（changed に宣言 path が現れるが declared にも含まれる）が `toStage` に入り、`offending` には入らない。
  - member が宣言出力を書かなかった（declared にあるが changed に無い）path は `toStage` に入らない（pathspec mismatch 回避）。

**Acceptance Criteria**:
- `partitionRoundChanges` が changed ⊆ declared（簿記除外後）判定と scoped staging 対象（changed ∩ declared）を pure に決定する。
- pipeline 管理 path が halt 判定・stage 対象の双方から除外される。
- test は git / executor に依存しない（pure function だけを駆動する）。

## T-02: member 実行入力に round 所有を宣言し、executor の finalize を抑止する（D1）

- [x] `src/core/types.ts` の `PipelineDeps` に `roundOwnsGitEffects?: boolean` を追加する（round 所有下の実行入力であることを示す。逐次経路は未設定 = 従来挙動）。
- [x] `src/core/step/executor.ts` `runAgentStep` の finalize ブロック（`finalizeStepArtifacts` を commit mutex 経由で呼ぶ ≈ L343-374）を `if (!deps.roundOwnsGitEffects) { ... }` で gate する。round 所有下では `finalizeStepArtifacts`（`cleanupOutputTemplates` ＋ `commitAndPush`）を一切呼ばない。
- [x] flag 未設定の逐次経路では finalize ブロックが従来どおり実行される（commit mutex・`finalizeStepArtifacts` 呼び出し・commit fail halt の経路が不変）ことをコード上で担保する。

**Acceptance Criteria**:
- `roundOwnsGitEffects === true` の実行入力で agent step を成功実行しても `finalizeStepArtifacts` が呼ばれない。
- flag 未設定（逐次経路）では `finalizeStepArtifacts` が従来どおり呼ばれ、`git add -A` ＋ `commit` ＋ `push` 挙動が不変。
- member では `cleanupOutputTemplates` の skip が発生するが、custom reviewer は B-group template を持たないため観測される欠落は無い。

## T-03: coordinator round 所有点の git primitive を RuntimeStrategy seam に追加する（D2）

- [x] `src/core/step/commit-push.ts` に scoped commit helper（例: `commitScopedPaths(stagePaths, cwd, branch, commitMessage, infra: CommitPushInfra)`）を追加する:
  - `stagePaths` が空なら no-op。
  - `git add -A -- <stagePaths...>`（pathspec 限定、`git add -A` 無差別 stage を使わない）。add が非 0 exit（git 非機能）なら silent return。
  - `git diff --cached --quiet` が exit 1（staged あり）のときだけ `git commit -m "<commitMessage>"` → `pushOnly(branch, cwd, coordinatorName, infra)`（既存 `pushOnly` を再利用）。
- [x] `src/core/port/runtime-strategy.ts` の `RuntimeStrategy` に **optional** で 2 メソッドを追加する:
  - `listWorktreeChanges?(cwd: string): Promise<string[]>` — worktree の未 commit 変更（追加・変更・削除）を repo 相対 path で返す。never-throw、error 時 `[]`。
  - `commitRoundArtifacts?(stagePaths: string[], cwd: string, branch: string, coordinatorName: string, slug: string, commitPushInfra: unknown): Promise<void>` — scoped stage ＋ commit ＋ push。domain 型は既存 seam と同じく `unknown`。
- [x] `RealRuntimeStrategy`（`runtime-strategy.ts:468-472` の intersection）に上記 2 メソッドを **required** で足す（`canDeriveChangedFiles` / `snapshotMainCheckoutGuard` と同じ optional-on-port / required-on-real パターン）。
- [x] `src/core/runtime/local.ts` に実装する:
  - `listWorktreeChanges(cwd)`: `git status --porcelain -z --no-renames` を cwd で実行し、`snapshotMainCheckoutGuard`（L684-735）と同じ NUL パースで path を抽出する（`??` 追加・` M` 変更・` D`/`D ` 削除を含む）。error 時 `[]`。
  - `commitRoundArtifacts(...)`: `commitScopedPaths(stagePaths, cwd, branch, "<coordinatorName>: <slug>", infra)` へ委譲する（`commitMessage` は逐次の `"<step>: <slug>"` と同型）。
- [x] `src/core/runtime/managed.ts` に実装する: `listWorktreeChanges` → `[]`、`commitRoundArtifacts` → no-op（no local worktree、既知 Non-Goal の fail-safe）。

**Acceptance Criteria**:
- `commitScopedPaths` が pathspec 限定 add（`git add -A -- <paths>`）のみを使い、pathspec なしの `git add -A` を使わない。
- local の `listWorktreeChanges` が worktree の未 commit 変更（追加・変更・削除）を repo 相対で返し、never-throw。
- managed の 2 メソッドが `[]` / no-op で、既存 `listChangedFiles` の managed=`[]` と同じ fail-safe 方針。
- `RuntimeStrategy` 型の既存 test fake（2 メソッド未実装）が typecheck を通る（optional）。実 runtime は required で compile-time 強制。

## T-04: coordinator round 所有点を配線する（D3 / D4）

- [x] `src/core/pipeline/parallel-review-round.ts` の `run`:
  - fan-out 前の `roundDeps` 構築（L185）を `{ ...deps, roundOwnsGitEffects: true }` に変更する。
  - fan-out（merge）**前** の base `state` から declared union を計算する: pending member ごとに `this.steps.get(name)?.writes?.(state, roundDeps) ?? []` を集め、`path` を union する。
  - merge / aggregate 後、`deps.runtimeStrategy?.listWorktreeChanges` が存在すれば `changed = await listWorktreeChanges(cwd)` を取得し、`partitionRoundChanges({ changed, declared, slug: deps.slug })` を呼ぶ:
    - `offending.length > 0` → aggregate を `escalation` に上書きし、synthetic StepRun の `outcome.error` と返却 `state.error` に `ROUND_NONDECLARED_CHANGE`（message に offending path 列挙、hint に「worktree を検査して非宣言変更の出所を特定」）を記録する。`commitRoundArtifacts` は呼ばない。
    - `offending.length === 0` かつ `toStage.length > 0` → `deps.runtimeStrategy.commitRoundArtifacts?.(toStage, cwd, branch, coordinatorName, deps.slug, infra)` を呼ぶ。
    - `listWorktreeChanges` 不在（test fake 等）→ 判定・commit を skip（従来挙動）。
  - `infra`（`CommitPushInfra`）は `{ spawnFn: deps.gitTransportSpawn ?? defaultSpawnFn, sleepFn: deps.sleepFn ?? 既定, events: this.events }` で構築する（executor の `commitPushInfra` 構築＝ `executor.ts:100` と対称）。
- [x] `ParallelReviewRound` の constructor に `events: EventBus` を追加し、`src/core/pipeline/pipeline.ts` の round 構築（L120-121）で `this.events` を渡す。
- [x] 既存の synthetic coordinator StepRun push（L233-255）と `store.persist`（L258-259）は commit 判定の後に行う（commit → synthetic StepRun → persist の順）。approved / needs-fix の aggregate 導出（`aggregateVerdict`）と merge / pending 選択・invalidation は不変。

**Acceptance Criteria**:
- coordinator が宣言出力 union（実際に変更された分 = changed ∩ declared）だけを `commitRoundArtifacts` へ渡す。
- 非宣言変更（簿記除外後に declared 外）が 1 つでもあれば outcome が escalation になり、`commitRoundArtifacts` が呼ばれず、offending path が記録される。
- pipeline は `(coordinator, escalation)` の transition 不在により escalate 終端（awaiting-resume）へ落ち、reason に offending が反映される。
- 共有 `deps` は round 内で in-place 変更されない（`roundDeps` は新規オブジェクト、B-16 不変）。

## T-05: intended-invariant / behavior test（seam 確定後）

- [x] executor level（`src/core/step/__tests__/executor-round-commit.test.ts` 新規、または既存 executor test に describe 追加）:
  - `finalizeStepArtifacts` を spy にした fake runtimeStrategy と fake runner で agent step を実行する。
  - `deps.roundOwnsGitEffects === true` の実行で `finalizeStepArtifacts` が **呼ばれない** ことを固定する（受け入れ基準: member 経路が git stage/commit port を呼ばない）。
  - flag 未設定（逐次）の実行で `finalizeStepArtifacts` が **呼ばれる** ことを固定する（逐次不変）。
- [x] coordinator level（`src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts` 新規）で、`writes()` が宣言 path を返す fake member step ＋ member 出力を simulate する fake executor ＋ `listWorktreeChanges` / `commitRoundArtifacts` を spy にした fake runtimeStrategy で `ParallelReviewRound.run` を駆動する:
  - `listWorktreeChanges` が宣言出力だけを返す → `commitRoundArtifacts` が declared（= changed ∩ declared）だけを stagePaths として 1 回呼ばれる（scoped staging を固定）。
  - `listWorktreeChanges` が宣言出力 ＋ 宣言外 path を返す → outcome escalation、`commitRoundArtifacts` が **呼ばれない**、offending が記録される（round halt を固定）。
  - `listWorktreeChanges` が宣言出力 ＋ pipeline 管理 path（`state.json` 等）を返す → halt せず、`commitRoundArtifacts` の stagePaths に簿記が含まれない（簿記を round commit に呑まないことを固定）。
- [x] 既存 `src/core/pipeline/__tests__/parallel-review-round-resume.test.ts` が回帰しない（新メソッドは optional で fake は未実装のまま、commit / halt を skip する経路で従来どおり通る）ことを確認する。

**Acceptance Criteria**:
- member 経路が git stage/commit port を呼ばず、coordinator round 所有点だけが宣言出力を stage することが test で固定される（intended-invariant）。
- round の changed files が宣言出力 union の範囲内であること、範囲外なら round halt することが test で固定される。
- scoped staging が `git add -A`（無差別）でなく宣言 path 限定であることが test で固定される。

## T-06: 全体検証

- [x] `bun run typecheck` が green。
- [x] `bun run test` が green（新規・更新 test 含む、既存 parallel review / resume / executor / commit-and-push test の regression なし）。
- [x] 変更ファイルが `src/core/types.ts` / `src/core/step/executor.ts` / `src/core/step/commit-push.ts` / `src/core/port/runtime-strategy.ts` / `src/core/runtime/local.ts` / `src/core/runtime/managed.ts` / `src/core/pipeline/parallel-review-round.ts` / `src/core/pipeline/pipeline.ts` / `src/core/pipeline/round-git-scope.ts` と対応 test に限られることを確認する。
- [x] `architecture/` 配下・`specrunner/adr/` 配下に変更が無いことを確認する（B-15 の ratify は本 pipeline では行わない ― スコープ外）。

**Acceptance Criteria**:
- `typecheck && test` が green。
- `architecture/` は不変（trust-root を out-of-loop に保つ）。
