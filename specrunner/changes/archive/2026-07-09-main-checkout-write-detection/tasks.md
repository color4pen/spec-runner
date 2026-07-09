# Tasks: worktree job による main checkout 逃避書き込み検出

> 前提: 実装は `src/` 配下で行う。各タスクは design.md の Decision（D1〜D7）に対応する。
> 依存追加は禁止（git コマンド + node 標準 `crypto`/`fs` + 既存 util のみ）。

## T-01: snapshot DTO を port 層に追加する

- [x] `src/core/port/runtime-strategy.ts` に snapshot DTO `MainCheckoutGuardSnapshot` を追加する
      （形: `{ entries: { path: string; hash: string | null }[] }`。`hash === null` は削除/不在を表す DELETED sentinel）。
- [x] domain 依存を持たない純 DTO として宣言し、port→domain 逆エッジを作らない（`RequiredInput` / `FindingRef` と同じ扱い）。

**Acceptance Criteria**:
- `MainCheckoutGuardSnapshot` が port から export され、step 純モジュール・LocalRuntime・ManagedRuntime のいずれからも import できる。
- 追加により `typecheck` が green を維持する。

## T-02: 監視 path 解決と drift 判定の純モジュールを新設する

- [x] `src/core/step/main-checkout-guard.ts` を新規作成する（scope-check.ts と同じ step 層 sibling パターン、I/O なし）。
- [x] `resolveMonitoredGuardGlobs(config): string[]` — `resolvePipelineForbiddenSurfaces(config, "fast")` の全 `paths` を flatten し、
      `.specrunner/**` を加え、dedupe して返す（D3。literal `"fast"` を使い、実行 pipeline 種別に依存しない）。
- [x] `matchesMonitored(path: string, globs: string[]): boolean` — `matchGlob`（`../reviewers/glob-match.js`）で path を各 glob と照合する。
- [x] `diffGuardSnapshots(before, after): GuardDrift` — 純関数。`GuardDrift = { drifted: boolean; changes: { path: string; kind: "created" | "modified" | "deleted" }[] }`。
      kind 導出: after のみ存在 = `created` / before のみ存在 = `modified` / 両方存在で hash 相違 = `modified` / after が DELETED(null) かつ before が非 null = `deleted`。
      changes は path 昇順で決定的に返す。
- [x] import は `MainCheckoutGuardSnapshot`(port) / `matchGlob`(reviewers) / `resolvePipelineForbiddenSurfaces`(config) に限定し、
      いずれも既存の許可された層間エッジ（step→port / step→reviewers / step→config）であることを確認する。

**Acceptance Criteria**:
- 純関数のみで `fs` / `child_process` を import しない。
- `resolveMonitoredGuardGlobs` が forbiddenSurfaces の全 `paths` + `.specrunner/**` を dedupe して返す単体テストが green。
- `diffGuardSnapshots` の created / modified / deleted / no-change 各ケースの単体テストが green。

## T-03: RuntimeStrategy に snapshot seam を宣言する

- [x] `src/core/port/runtime-strategy.ts` の `RuntimeStrategy` に **optional** メソッド
      `snapshotMainCheckoutGuard?(cwd: string, config: SpecRunnerConfig): Promise<MainCheckoutGuardSnapshot | null>` を追加する。
- [x] `RealRuntimeStrategy` 交差型に同メソッドを **required** として加え、実 runtime に実装を compile 時強制する（`canDeriveChangedFiles` と同型）。
- [x] JSDoc に契約を明記する: never-throw（エラー時 `null`）、no-worktree/managed は `null`、`git status --porcelain` は ignore を除外する旨。

**Acceptance Criteria**:
- port が optional・`RealRuntimeStrategy` が required で宣言され、RuntimeStrategy 型の既存 test fake が無改修で `typecheck` を通す。
- 実 runtime クラスが同メソッドを実装しないと compile error になる。

## T-04: LocalRuntime に snapshotMainCheckoutGuard を実装する

- [x] `src/core/runtime/local.ts` に `snapshotMainCheckoutGuard(cwd, config)` を実装する。
- [x] `detectSpecrunnerWorktree(cwd)`（`../worktree/detection.js`）を呼び、`isSpecrunnerWorktree === false` なら `null` を返す（no-worktree/非 worktree を skip）。
- [x] `mainCheckoutPath` で `git status --porcelain -z --no-renames` を `this.spawnFn` で実行する（`inspectWorktreeWork` の spawn パターンに倣う）。
- [x] 出力 path を `resolveMonitoredGuardGlobs(config)` + `matchesMonitored`（T-02）でフィルタする。
- [x] フィルタ後の各 path について、存在すれば `crypto.createHash("sha256")` で content hash（`digestArtifacts` と同じ `sha256:<hex>` 規約）を、
      削除（status が `D`）なら `hash: null` を `entries` に積む。
- [x] 例外・非 0 exit はすべて捕捉して `null` を返す（never-throw、fail-open。D6）。

**Acceptance Criteria**:
- specrunner worktree の cwd で、監視対象 path に main checkout 側の変更があるとき、その path が `entries` に現れる。
- no-worktree の cwd（repo root）では `null` を返す。
- `git status` 失敗を模した spawn で `null` を返し例外を投げない。
- `.specrunner/local/` 配下（gitignore 対象）の書き込みは `entries` に現れない。

## T-05: ManagedRuntime に no-op 実装を追加する

- [x] `src/core/runtime/managed.ts` に `snapshotMainCheckoutGuard(_cwd, _config): Promise<MainCheckoutGuardSnapshot | null>` を追加し、常に `null` を返す（`captureHeadSha` の no-op に倣う）。

**Acceptance Criteria**:
- ManagedRuntime が `RealRuntimeStrategy` を満たし `typecheck` が green。
- 呼び出しで常に `null` を返す単体テストが green。

## T-06: JobState に drift 記録フィールドを追加する

- [x] `src/state/schema.ts` に optional フィールド
      `mainCheckoutDrift?: { changes: { path: string; kind: "created" | "modified" | "deleted" }[]; detectedAtStep: StepName; ts: string } | null` を `JobState` に追加する。
- [x] `resumePoint` の validation（schema.ts:518-521）に倣い、不在は許容・存在時のみ型チェックする後方互換 validation を追加する。

**Acceptance Criteria**:
- 既存 state（`mainCheckoutDrift` 不在）が従来どおり parse できる。
- フィールド追加で `typecheck` が green を維持する。

## T-07: executor の runAgentStep に before/after 検出を配線する

- [x] `src/core/step/executor.ts` `runAgentStep` で、`headBeforeStep` capture 付近（agent 実行前）に
      `const guardBefore = deps.runtimeStrategy?.snapshotMainCheckoutGuard ? await deps.runtimeStrategy.snapshotMainCheckoutGuard(cwd, deps.config) : null;` を追加する（optional chaining で fake/absent は `null`）。
- [x] `runResult.completionReason !== "success"` の各 guard を抜けた後・output contract gate（executor.ts:461）の前で、
      `guardBefore` が非 null のときのみ `guardAfter` を取得し、`guardAfter` も非 null なら `diffGuardSnapshots(guardBefore, guardAfter)` を評価する。
- [x] `drifted === true` の場合、timeout escalation（executor.ts:395-431）と同型で以下を行う:
      `recordFailedStepResult` → `transitionJob(state, "awaiting-resume", { trigger: "executor", reason: "main checkout write detected", patch: { resumePoint: { step: toStepName(step.name), reason: "main checkout write detected", iterationsExhausted: 0 }, mainCheckoutDrift: { changes, detectedAtStep, ts }, error } })` → `appendInterruption` → `appendHistory` → `persist` → `attachStateAndRethrow`。
- [x] `errorInfo` は `code: "MAIN_CHECKOUT_WRITE_DETECTED"`、`message` に検出 path 要約、`hint` に「操作者自身の main checkout 並行編集の可能性」+「確認のうえ `specrunner job resume <slug>` する」案内を含める。
- [x] `guardBefore`/`guardAfter` が `null`、または `drifted === false` の場合は既存フローに素通りし、観測挙動を変えない（要件4）。
- [x] `runCliStep` には一切追加しない（D7）。

**Acceptance Criteria**:
- drift 検出時に job が `awaiting-resume` + `resumePoint`(当該 step) になり、`finalizeStepArtifacts`（commit）へ進まない。
- `runtimeStrategy` 不在 / seam 未実装 / drift なしのとき、既存の executor テストが無改修で green。
- cli step 実行時に snapshot seam が呼ばれない。

## T-08: CLI に drift 検出の描画を追加する

- [x] `src/core/command/runner.ts` の `handleResult`（awaiting-resume 分岐, 306-311）で、
      `finalState.mainCheckoutDrift` が存在するとき、検出 path と変更種別の一覧・操作者自身の並行編集の可能性・
      `specrunner job resume <slug>` での継続案内を出力する。
- [x] `mainCheckoutDrift` 不在の awaiting-resume は従来の描画のまま変えない。

**Acceptance Criteria**:
- drift ありの awaiting-resume で、検出差分・並行編集の可能性・resume 案内が出力される。
- drift なしの awaiting-resume 出力は従来と同一。

## T-09: 受け入れ基準を固定するテストを追加する

- [x] agent step 中に main checkout 側監視対象 path が変更された fixture で、run が escalation（awaiting-resume + resumePoint）になり、
      検出 path が state（`mainCheckoutDrift`）に記録されることを固定する。
- [x] 監視対象外 path の変更（例: 操作者による `specrunner/drafts/` 追加）では escalation しないことを固定する。
- [x] no-worktree mode（`detectSpecrunnerWorktree` false 相当）で本検査が実行されないことを固定する。
- [x] 変更なしの worktree run が従来どおり完走する（既存テスト無改修で green）。
- [x] 既 dirty な監視ファイルへの追記が content hash 差分で検出される単体テスト（`diffGuardSnapshots`）を含める。

**Acceptance Criteria**:
- 上記 5 ケースのテストがすべて green。
- 既存テストを改変せずに green を維持する。
- `typecheck && test` が green。
