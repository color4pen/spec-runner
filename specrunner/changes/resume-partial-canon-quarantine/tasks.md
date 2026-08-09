# Tasks: 中断 step の書きかけ canon を resume が自動隔離して再走する

## T-01: reconcile-worktree の quarantine core を切り出し `quarantinePartialCanon` を追加する（D3）

- [ ] `src/core/resume/reconcile-worktree.ts` の「git status → parse → 対象 filter → kind 分類 →
      evidence 全件退避 → kind 別削除」ロジック（現 :107-267）を、対象述語を差し替え可能な内部関数
      （例 `quarantineAndRemoveMatching`）へ切り出す。引数に「対象判定述語 `(path: string) => boolean`」
      「任意 pathspecs（git status に `-- <paths>` で渡す）」「退避ディレクトリ prefix」を受ける。
- [ ] `reconcileWorktreeArtifacts(slug, worktreePath, spawnFn)` を、内部関数を
      `matches = (p) => isReconcilableArtifact(p, slug)` / pathspecs 無し / prefix `reconcile` で
      呼ぶ薄いラッパーに変更する。外部シグネチャ・戻り値型（`ReconcileResult`）・git コマンド列を不変に
      保つ（挙動不変のリファクタ）。
- [ ] `quarantinePartialCanon(slug, worktreePath, canonPaths, spawnFn): Promise<ReconcileResult>` を
      新規 export する。内部関数を `matches = (p) => new Set(canonPaths).has(p)` / pathspecs =
      `canonPaths` / prefix `canon-quarantine` で呼ぶ。
- [ ] evidence-first / fail-closed 不変を維持する: 退避書き込みが 1 件でも失敗したら throw し、削除を
      一切実行しない。gitignore self-ignore setup（`.specrunner/local/.gitignore`）も両経路で有効。
- [ ] `canonPaths` が空、または git status が対象を返さない場合は no-op（`{ reconciled: [],
      quarantineDir: null }`）を返す。

**Acceptance Criteria**:
- `quarantinePartialCanon` が、渡した canon path のみを退避（evidence）してから kind 別に worktree から
  除去し、`reconciled` に除去した path、`quarantineDir` に退避先を返す。
- 退避書き込み失敗時は throw し、いずれの path も削除されていない。
- 既存 reconcile テスト（`src/core/resume/__tests__/reconcile-worktree.test.ts`、
  `src/core/command/__tests__/resume-reconcile.test.ts`、
  `tests/resume-worktree-reconciliation-e2e.test.ts`）が無改変で green のまま。

## T-02: apply-canon.ts に provenance 判定の pure helper を追加する（D2）

- [ ] `src/core/resume/apply-canon.ts` に interruption reason 定数
      `INTERRUPTION_REASONS = {"signal","timeout","failure","exhaustion"}` を定義する。
- [ ] `isInterruptionBacked(resumePoint: ResumePoint | null, staleRunningDetected: boolean): boolean`
      を追加する。`staleRunningDetected === true`、または `resumePoint !== null` かつ
      `INTERRUPTION_REASONS.has(resumePoint.reason)` のとき true。
- [ ] `declaredCanonWritesForStep(stepName, state, deps): string[]` を追加する。
      `getPipelineDescriptor(getPipelineId(state))` → `new Map(descriptor.steps).get(stepName)` で step を
      引き、`step.writes?.(state, deps)` の path を `protectedCanonPaths(deps.slug)` で filter して返す。
      step 不在 / writes 未定義 / 例外時は `[]`（fail-closed）。
- [ ] `isInterruptedStepPartialCanon(input): boolean` を追加する。input =
      `{ dirtyCanonPaths, declaredCanonWrites, interruptionBacked, completedStepRunAbsent }`。
      `interruptionBacked && completedStepRunAbsent && dirtyCanonPaths.length > 0 &&
      dirtyCanonPaths.every(p => new Set(declaredCanonWrites).has(p))` のとき true。
- [ ] いずれも pure（I/O なし、`declaredCanonWritesForStep` は registry 参照のみで副作用なし）にする。

**Acceptance Criteria**:
- `isInterruptionBacked` が stale 検出時 true、interruption reason の resumePoint で true、
  `escalation` reason / null で false。
- `declaredCanonWritesForStep("design", state, deps)` が design.md / tasks.md / spec.md（`isSpecRequired`
  に応じ spec.md）を返し、非 canon path や未知 step 名では `[]`。
- `isInterruptedStepPartialCanon` が 4 条件すべて成立時のみ true、1 条件でも欠けると false。

## T-03: resume prepare の apply-canon gate に三分岐と自動隔離を配線する（D1 / D4 / D5）

- [ ] `src/core/command/resume.ts` の stale-running ブロック（:158-180）で
      `let staleRunningDetected = false;` を導入し、`isStaleRunning` が true の分岐で `true` にする。
- [ ] apply-canon gate（:294-332）の dirty 分岐を三分岐に拡張する:
      - `options.applyCanon` → 現行の `commitOperatorCanon` 経路（不変、D5）。
      - else if 部分出力判定成立 → `quarantinePartialCanon` を呼び、成功時は halt せず gate を抜ける（D4）。
      - else → 現行の fail-closed halt（不変）。
- [ ] 部分出力判定の入力を prepare 内で組み立てる:
      - `interruptedStep = updatedState.step`
      - `startStep === interruptedStep`（再走対象一致）
      - `declaredCanon = declaredCanonWritesForStep(interruptedStep, updatedState, minimalDeps)`
        （minimalDeps = `{ slug: resolvedSlug, request, config }` を `StepDeps` として渡す。
        `writes()` が参照するフィールドは現在 `slug` / `request.type` のみだが、将来 `writes()` が
        追加フィールドを参照するようになった場合は minimalDeps の構築を同期すること。
        未同期でも例外は `declaredCanonWritesForStep` の try/catch が捕捉し `[]` を返すため
        fail-closed になるが、runtime エラーになる前に minimalDeps を更新する義務がある。）
      - `interruptionBacked = isInterruptionBacked(resumePoint, staleRunningDetected)`
        （`resumePoint` は :189 で running 遷移前に capture 済みの値を使う）
      - `completedStepRunAbsent = !(updatedState.steps?.[interruptedStep]?.length)`
      - `isInterruptedStepPartialCanon({ dirtyCanonPaths, declaredCanonWrites: declaredCanon,
        interruptionBacked, completedStepRunAbsent })` かつ `startStep === interruptedStep` で発動。
- [ ] `quarantinePartialCanon` が throw したら `logError` + `stderrWrite`（退避保全・削除未実行を促す
      hint）+ `throw new PrepareError(1, ...)`（fail-closed）。
- [ ] 隔離成功時は `logInfo` で「隔離した step 名 / 退避した path / 退避先 quarantineDir」を明示する。
- [ ] 隔離後は throw せず処理を継続し、adopt-commits gate → reconcile-worktree → step 再走へ進む。

**Acceptance Criteria**:
- dirty canon が中断 step の部分出力と判定された未 `--apply-canon` resume で、`quarantinePartialCanon`
  が呼ばれ、`PrepareError` が throw されず `startStep` が中断 step のまま返る。
- 判定不成立（裏づけ無し / 宣言外 canon 混在 / 完了 StepRun あり / `startStep` 不一致）では
  `quarantinePartialCanon` が呼ばれず、現行どおり `PrepareError(1)` で halt する。
- `--apply-canon` 指定時は `quarantinePartialCanon` が呼ばれず `commitOperatorCanon` 経路になる。
- `quarantinePartialCanon` throw 時は `PrepareError(1)` で halt し、step は開始されない。

## T-04: pure helper の単体テストを追加する

- [ ] `src/core/resume/__tests__/apply-canon.test.ts` に `isInterruptionBacked` /
      `declaredCanonWritesForStep` / `isInterruptedStepPartialCanon` のテストを追加する。
- [ ] `isInterruptionBacked`: stale=true / reason ∈ interruption / reason="escalation" / null の各分岐。
- [ ] `declaredCanonWritesForStep`: "design" が canon 3 点を返す / 非 canon を含まない / 未知 step で `[]`。
- [ ] `isInterruptedStepPartialCanon`: 全条件成立で true、各条件を 1 つ落とすと false（宣言外 canon
      混在で false を含む）。

**Acceptance Criteria**:
- 上記 pure helper のテストが green。各判定分岐（成立 / 各条件欠落）を網羅する。
- `isInterruptedStepPartialCanon` は条件 2/3/4 のみを検証する関数である。条件 1（`startStep === interruptedStep`）は gate 配線（T-03）側で `isInterruptedStepPartialCanon` の呼び出し前に独立チェックされる。本テストでは条件 1 不一致のケースを `isInterruptedStepPartialCanon` に混入させない（条件 1 の欠落テストは T-05 の gate 配線レベルで固定する）。

## T-05: resume prepare 統合テスト（モックハーネス）を追加する

- [ ] `src/core/command/__tests__/resume-partial-canon.test.ts` を追加する。既存の
      `resume-reconcile.test.ts` / `resume-apply-canon.test.ts` の vi.mock ハーネスを踏襲し、
      `detectCanonDirtyPaths` / `quarantinePartialCanon` / `commitOperatorCanon` /
      `reconcileWorktreeArtifacts` / `isStaleRunning` 等を mock する。
- [ ] TC: 中断裏づけ（resumePoint.reason="signal"、`state.steps["design"]` 不在）+ dirty canon =
      design writes → `--apply-canon` 無し resume が `quarantinePartialCanon` を呼び halt しない。
- [ ] TC: 裏づけ無し（resumePoint=null / reason="escalation"、not stale）+ dirty canon → 現行どおり
      `PrepareError(1)` で halt、`quarantinePartialCanon` 未呼び出し。
- [ ] TC: dirty canon に design writes 外の canon（例 test-cases.md）が混在 → halt、隔離未呼び出し。
- [ ] TC: `state.steps["design"]` に完了 StepRun あり + dirty canon → halt（前 step 正常完了相当）。
- [ ] TC: `--apply-canon` 指定 + dirty canon → `commitOperatorCanon` 呼び出し、`quarantinePartialCanon`
      未呼び出し。
- [ ] TC: `quarantinePartialCanon` が throw → `PrepareError(1)` で halt。
- [ ] TC: stale 経路（`isStaleRunning`=true、resumePoint 無し、`state.steps["design"]` 不在）+ dirty
      canon = design writes → 隔離して halt しない。
- [ ] TC: `startStep !== interruptedStep`（`--from` で別 step へ redirect）+ 中断裏づけあり + dirty canon
      = design writes → 隔離せず `PrepareError(1)` で halt する（条件 1 不成立で fail-closed）。
- [ ] TC: destruction 記録 — 隔離配線（else-if 分岐）を除去すると上記 signal TC が halt に退行することを
      inline で記す。

**Acceptance Criteria**:
- 上記 TC が green。受け入れ基準（隔離続行 / 裏づけ無し halt / 混在 halt / `--apply-canon` 優先 /
  退避失敗 halt / stale 経路 / startStep 不一致 halt）をモックレベルで固定する。

## T-06: 実 git worktree による e2e テストを追加する（evidence readable + 冪等性）

- [ ] `tests/resume-partial-canon-quarantine-e2e.test.ts` を追加する。`apply-canon.test.ts` /
      `resume-worktree-reconciliation-e2e.test.ts` に倣い `os.tmpdir` + `git init` で実リポジトリを
      構築し、`defaultSpawnFn` で `quarantinePartialCanon` を直接検証する。
- [ ] untracked case: change folder に request.md 等を commit 済の状態で、untracked な design.md /
      tasks.md を作成 → `quarantinePartialCanon` 実行 → worktree から除去され、退避先に内容が読める形で
      残る（raw content）ことを assert。
- [ ] tracked-modified case: commit 済 design.md を編集（modified）→ 実行 → `HEAD` 内容へ戻り、退避先に
      diff が残ることを assert。
- [ ] 冪等性: 隔離実行後に再度 `detectCanonDirtyPaths` を呼び `[]`（dirty 無し）を assert。
- [ ] 退避失敗 fail-closed: 退避先を書き込み不能にした状態で実行し、throw かつ対象 canon が worktree に
      残る（未削除）ことを assert。

**Acceptance Criteria**:
- untracked / tracked-modified の両方で退避 + 除去 + evidence 可読が固定される。
- 隔離後の `detectCanonDirtyPaths` が `[]` を返す（冪等性）。
- 退避失敗時は throw し canon 未削除。

## T-07: 検証ゲート

- [ ] `bun run typecheck` が green。
- [ ] `bun run test` が green（既存 reconcile / apply-canon / resume テスト群を含む）。

**Acceptance Criteria**:
- `typecheck && test` が green。
