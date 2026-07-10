# Tasks: resume-member-step-routing

## T-01: coordinator を `buildAllowedStepSet` の許可集合に追加する

対象ファイル: `src/core/resume/resolve-step.ts`

- [ ] `CUSTOM_REVIEWERS_STEP_NAME` を `types.ts` からインポートする
- [ ] `buildAllowedStepSet` の reviewers 分岐で `set.add(CUSTOM_REVIEWERS_STEP_NAME)` を追加する（regression-gate の追加直後）
- [ ] reviewers が空 / undefined の場合は追加しない（既存の "零レビュアー = coordinator なし" 不変条件を維持）

**Acceptance Criteria**:
- `buildAllowedStepSet([{ name: "security" }])` の返り値に `"custom-reviewers"` が含まれる
- `buildAllowedStepSet([])` および `buildAllowedStepSet(undefined)` の返り値に `"custom-reviewers"` が含まれない
- `buildAllowedStepSet([{ name: "security" }])` の返り値に `"security"` と `"regression-gate"` も含まれる（既存動作の非退行）

---

## T-02: `resolveResumeStep` に member → coordinator マッピングを追加する

対象ファイル: `src/core/resume/resolve-step.ts`

- [ ] 関数シグネチャに第 5 引数 `reviewers?: ReadonlyArray<{ name: string }>` を追加する
- [ ] ファイルスコープのヘルパー `mapMemberToCoordinator(step: string, reviewers: ReadonlyArray<{ name: string }> | undefined): string` を実装する
  - reviewers が空 / undefined なら `step` をそのまま返す
  - `reviewers.some(r => r.name === step)` が true なら `CUSTOM_REVIEWERS_STEP_NAME` を返す
  - それ以外は `step` をそのまま返す
- [ ] `from !== undefined` 分岐: `from` を `mapMemberToCoordinator(from, reviewers)` で変換した後に `allowed.has(resolvedFrom)` チェックを行う
  - member → coordinator へのマッピングが発生した場合は `logInfo`（または `logDebug`）でマッピングを通知する
  - マッピング後の値が `allowed` にない場合は既存のエラーパスを通す（元の `from` 値をエラーメッセージに使う）
- [ ] `resumePoint !== null` 分岐: `resumePoint.step` を `mapMemberToCoordinator(resumePoint.step, reviewers)` で変換した値を返す
- [ ] `stateStep` 分岐（hard-crash fallback）はマッピング対象外とする（既存動作維持）

**Acceptance Criteria**:
- `resolveResumeStep(undefined, { step: "cross-boundary-invariants", ... }, undefined, allowedSetWithReviewers, [{ name: "cross-boundary-invariants" }])` → `"custom-reviewers"`
- `resolveResumeStep("cross-boundary-invariants", null, undefined, allowedSetWithReviewers, [{ name: "cross-boundary-invariants" }])` → `"custom-reviewers"`
- `resolveResumeStep("custom-reviewers", null, undefined, allowedSetWithReviewers, [{ name: "cross-boundary-invariants" }])` → `"custom-reviewers"`（coordinator 直接指定も通過）
- `resolveResumeStep(undefined, { step: "code-review", ... }, undefined, allowedSetWithReviewers, [{ name: "cross-boundary-invariants" }])` → `"code-review"`（非 member は変換されない）
- `resolveResumeStep("totally-unknown", null, undefined, allowedSetWithReviewers, [...])` → エラー（未知ステップはエラーのまま）
- reviewers が空 / undefined の場合、既存テストがすべて green

---

## T-03: `resume.ts` の呼び出し元を更新する

対象ファイル: `src/core/command/resume.ts`

- [ ] `resolveResumeStep(this.options.from, resumePoint, state.step, allowedSteps)` の呼び出しに第 5 引数 `state.reviewers` を追加する
  - 変更前: `resolveResumeStep(this.options.from, resumePoint, state.step, allowedSteps)`
  - 変更後: `resolveResumeStep(this.options.from, resumePoint, state.step, allowedSteps, state.reviewers)`
- [ ] `state.reviewers` の型が `ReviewerSnapshot[] | undefined` であることを確認し、型エラーが発生しないことを確認する

**Acceptance Criteria**:
- `bun run typecheck` が green
- `resume.ts` の変更行数は 1 行のみ（引数追加のみ）

---

## T-04: `src/core/lifecycle/signal-state.ts` を新規作成する

対象ファイル: `src/core/lifecycle/signal-state.ts`（新規）

- [ ] モジュールレベルの `let signalHandlerFired = false` 変数を定義する
- [ ] `markSignalHandlerFired(): void` — フラグを `true` にする
- [ ] `isSignalHandlerFired(): boolean` — 現在のフラグ値を返す
- [ ] `resetSignalHandlerFiredForTest(): void` — テスト用のリセット関数（テストファイルでのみ使用）
- [ ] JSDoc コメント: 「このフラグが `true` の場合、exit-guard は `appendInterruption` と `store.persist` をスキップする。signal handler を追加する場合は非同期処理の前に必ず `markSignalHandlerFired()` を呼ぶこと」

**Acceptance Criteria**:
- `isSignalHandlerFired()` は初期状態で `false` を返す
- `markSignalHandlerFired()` 呼び出し後は `true` を返す
- `resetSignalHandlerFiredForTest()` 呼び出し後は再び `false` を返す
- 型エラーなし（`bun run typecheck` green）

---

## T-05: `local.ts` の `signalCleanup` で `markSignalHandlerFired()` を呼ぶ

対象ファイル: `src/core/runtime/local.ts`

- [ ] `markSignalHandlerFired` を `src/core/lifecycle/signal-state.js` からインポートする
- [ ] `signalCleanup` 関数の先頭（`try {` の前）で `markSignalHandlerFired()` を呼ぶ
  - `async (): Promise<void> => { markSignalHandlerFired(); try { ... } }`
  - 呼び出しは同期的であり、いかなる `await` よりも前であること
- [ ] SIGINT ハンドラと SIGTERM ハンドラは同じ `signalCleanup` 関数を共有しているため、追加箇所は 1 か所のみ

**Acceptance Criteria**:
- `signalCleanup` が呼ばれた直後（async が始まる前）に `isSignalHandlerFired()` が `true` になる
- `bun run typecheck` green

---

## T-06: exit-guard の各ハンドラで `isSignalHandlerFired()` チェックを追加する

対象ファイル: `src/core/lifecycle/exit-guard.ts`

- [ ] `isSignalHandlerFired` を `./signal-state.js` からインポートする
- [ ] `handleNoWorktreeExit` の先頭（`try {` の外側、関数の最初の行）に以下を追加する:
  ```typescript
  if (isSignalHandlerFired()) return;
  ```
- [ ] `handlePerJobExit` の同じ箇所に追加する（worktree 探索ループの前）
- [ ] `handleGlobalExit` の同じ箇所に追加する（`JobStateStore.list` の前）
- [ ] 各関数にコメント: `// Signal handler is responsible — skip to avoid duplicate interruption record`

**Acceptance Criteria**:
- `isSignalHandlerFired()` が `true` のとき、いずれの exit-guard ハンドラも `appendInterruption` を呼ばない
- `isSignalHandlerFired()` が `true` のとき、いずれの exit-guard ハンドラも `store.persist` を呼ばない
- `isSignalHandlerFired()` が `false` のとき（non-signal exit）、exit-guard は従来通り `appendInterruption` と `store.persist` を呼ぶ

---

## T-07: `resolve-step.test.ts` に member → coordinator のテストを追加する

対象ファイル: `src/core/resume/__tests__/resolve-step.test.ts`

- [ ] `buildAllowedStepSet` のテスト追加:
  - reviewers 存在 → 返り値に `"custom-reviewers"` が含まれる
  - reviewers 不在 → 返り値に `"custom-reviewers"` が含まれない
- [ ] `resolveResumeStep` のテスト追加（member → coordinator マッピング）:
  - `resumePoint.step` が member 名 → `"custom-reviewers"` を返す
  - `--from <member名>` → `"custom-reviewers"` を返す
  - `--from custom-reviewers` → `"custom-reviewers"` を返す（coordinator 直接指定）
  - `resumePoint.step` が非 member 静的 step → 変換されない（`"code-review"` のまま）
  - reviewers が undefined / 空のとき、既存テストに影響なし（第 5 引数省略で動作）
  - 未知の `--from` 値はエラー（マッピングされない）
- [ ] テストフィクスチャ: `makeReviewers(names: string[])` ヘルパーを追加し、テスト間で共有する
- [ ] テストフィクスチャ: job 8d5f9b5c の実例（`cross-boundary-invariants` escalated → approved）を再現する fixture を 1 件追加する

**Acceptance Criteria**:
- 追加したすべてのテストが green
- 既存テストが無変更で green（`resolveResumeStep` の第 5 引数省略時の動作は変わらない）

---

## T-08: exit-guard のシグナル重複抑止テストを追加する

対象ファイル: `src/core/lifecycle/__tests__/exit-guard.test.ts`

- [ ] `signal-state.ts` の `resetSignalHandlerFiredForTest` を各テストの `afterEach` でリセットする（テスト間の汚染防止）
- [ ] テスト追加: `markSignalHandlerFired()` 呼び出し後に exit-guard を実行 → `appendInterruption` が呼ばれない（journal に行追加なし）
- [ ] テスト追加: `markSignalHandlerFired()` 呼び出し後に exit-guard を実行 → `state.status` が `running` のままである（persist されない）
- [ ] テスト追加: signal なし（フラグ false）の exit-guard は従来通り `awaiting-resume` に遷移する（非退行）
- [ ] テスト実装: `events.jsonl` の行数を比較して `appendInterruption` が呼ばれていないことを検証する

**Acceptance Criteria**:
- 追加したすべてのテストが green
- 既存テストが無変更で green（`resetSignalHandlerFiredForTest` でテスト間の状態が隔離されている）

---

## T-09: pipeline-level の member resume 統合テストを追加する

対象ファイル: `src/core/pipeline/__tests__/` に新規テストファイルを追加する（例: `member-resume-routing.test.ts`）

このテストは実際の Pipeline インスタンスを構築せず、`resolveResumeStep` + `buildAllowedStepSet` + `composeReviewerDescriptor` の組み合わせを検証するレイヤーを対象とする。

- [ ] フィクスチャ: job 8d5f9b5c 相当の state（`resumePoint.step = "cross-boundary-invariants"`, reviewers = `[{ name: "cross-boundary-invariants" }]`, coordinator が pending を `[]` として返す）を作成する
- [ ] テスト: `buildAllowedStepSet(reviewers)` → coordinator が含まれる
- [ ] テスト: `resolveResumeStep(undefined, resumePoint, undefined, allowedSteps, reviewers)` → `"custom-reviewers"` を返す
- [ ] テスト: coordinator から resume したとき `selectPendingMembers` が `[]` を返す（approved 済み member は再実行されない）シナリオをロジックレベルで検証する
  - `deriveReviewerStatuses` と `selectPendingMembers` を実際に呼んで確認する

**Acceptance Criteria**:
- #769 の実例シナリオ（approved なのに escalate）が解消されていることをテストで固定する
- approved 済み member が pending に含まれないことをテストで固定する
- `bun run typecheck && bun run test` が green
