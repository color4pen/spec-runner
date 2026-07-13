# Tasks: 逐次経路の single-writer（StepExecutor producer 化 ＋ CommitOrchestrator 単一適用）

> 実装は各 guard・成功・skip の副作用**順序**を現 `executor.ts` と逐一照合しながら進めること。観測挙動（最終 state / verdict / history 列 / persist 結果 / throw）は不変が絶対条件。

## T-01: `StepExecutionResult` DU と `StepHalt` 拡張・新 factory を定義する

- [ ] `StepExecutionResult` discriminated union を定義する（`src/core/step/commit-orchestrator.ts` に co-locate、または `src/core/step/step-execution-result.ts` へ切り出し）:
  - `{ kind: "success"; completion: StepCompletion; completedAt: string; startedAt: string; session: { id: string; agentId: string; environmentId: string } | null; agentBranch?: string; modelUsage?: Record<string, ModelUsage>; followUpAttempts?: number; transientRetryAttempts?: number; completionReportDiagnostics?: CompletionReportDiagnostic[] }`
  - `{ kind: "halt"; halt: StepHalt }`
  - `{ kind: "skipped"; skipReason: string }`
  - **命名注意**: 既存 `StepOutcome`（`StepRun.outcome`）と衝突するため `StepExecutionResult` を使う（`StepOutcome` を再利用しない）。
- [ ] `src/core/step/step-halt.ts` の `StepHalt` に optional field を追加する（既存 `failed` / `awaiting-resume` の両 variant 共通）:
  - `recordOpts?: Omit<StepResultInput, "verdict" | "findingsPath" | "error">` — `recordFailedStepResult` の第4引数（`startedAt` / `completedAt` / `transientRetryAttempts` 差異を吸収）
  - `history?: Omit<HistoryEntry, "ts">` — 追記する history エントリ（`ts` は適用時に付与、未設定 = 追記しない）
- [ ] 既存 6 factory（`makeAgentThrowHalt` / `makeTimeoutHalt` / `makeNonSuccessHalt` / `makeDriftHalt` / `makeOutputGateHalt` / `makeCommitFailHalt`）を、現 executor の各 guard が渡していた `recordOpts` と追記していた `history`（有無・label・status・message）を埋めるよう拡張する。**返す `error`（`ErrorInfo`）と `thrownErr` は不変**に保つ。history の有無マップ:
  - append あり: agent-throw（`{step}-failed`/error/`${step} failed: ${code} — ${message}`）, timeout（`{step}-timeout`/error/`${step} timed out: ${message}`）, drift（`{step}-main-checkout-write-detected`/error/`${step}: main checkout write detected — ${pathSummary}`）, output-gate（`{step}-failed`/error/`${step} failed: ${code} — ${message}`）
  - append なし: non-success, commit-fail
- [ ] R1 未値化の2経路に factory を追加する:
  - `makeInputMissingHalt(err, stepName, recordOpts)` — `validateRequiredInputs` 失敗用（`kind:"failed"`, code 既定 `STEP_INPUT_MISSING`, history `{step}-failed`/error/`${step} failed: ${code} — ${message}`）
  - `makeCliStepFailHalt(err, stepName, recordOpts)` — `runCliStep` の `step.run` throw 用（`kind:"failed"`, code `CLI_STEP_FAILED`, message `${step} failed: ${errMsg}`, hint `Check the ${step} output for details.`, history なし）

**Acceptance Criteria**:
- `bun run typecheck` が新型でエラーを出さない
- `StepExecutionResult.kind` で `success` / `halt` / `skipped` が exhaustive に判別できる
- 既存 6 factory の返す `error.code` / `error.message` / `error.hint` / `thrownErr` が拡張前と一致する（テスト or 目視照合）
- 新 factory 2 個が正しい `kind` / `code` / `history` / `recordOpts` を返す

---

## T-02: `CommitOrchestrator` を新設する

- [ ] `src/core/step/commit-orchestrator.ts` に `CommitOrchestrator` クラスを新規作成する。コンストラクタは `storeFactory: StoreFactory` ＋ `events: EventBus` ＋ `permissionScope?: PermissionScope`（`deriveStepCompletion` を orchestrator 側で使う場合）を受ける。store アクセス（`getStore` 相当のキャッシュ）は orchestrator が所有する。
- [ ] `begin(step, state): Promise<JobState>` を実装する:
  - `store.update(state, { step: step.name })`
  - 開始 history 追記: agent step は `{step}-started` / status `started` / `Starting ${step} step`、CLI step は `step-transition` / status `ok` / `Transitioning to ${step} step`
  - 現 `runAgentStep` 冒頭（`:200-207`）と `runCliStep` 冒頭（`:577-584`）に一致
- [ ] `commitSuccess(step, state, deps, result): Promise<JobState>` を実装する（現 `finalizeStep` `:628-741` の副作用ブロックに一致）:
  - `findingsPath = step.resultFilePath(state, deps)`
  - `verdict:parsed` emit（outcome: verdict / toolResult=persistToolResult / followUpAttempts）
  - `pushStepResult`（session / verdict / findingsPath / completedAt / startedAt / error:null / toolResult / followUpAttempts / transientRetryAttempts / completionReportDiagnostics）
  - `{step}-verdict` history（status `ok` / `${step} verdict: ${verdict}`）
  - branch 設定（`agentBranch && !state.branch` / `setsBranch === true && !state.branch` の分岐）
  - `completion.pullRequest` 反映
  - usage 追記（`modelUsage && deps.cwd && deps.slug` の best-effort、`appendInvocation`）
  - `store.persist(state)`
  - lineage 記録（`step.writes && deps.runtimeStrategy && deps.cwd` の best-effort、`digestArtifacts` → `appendLineage`）
- [ ] `commitSkipped(step, state, skipReason): Promise<JobState>` を実装する（現 `finalizeSkippedStep` `:518-554` に一致）:
  - `pushStepResult`（verdict `skipped` / findingsPath null / skipReason / completedAt=startedAt=now / error null）
  - `{step}-skipped` warning history（`${step} skipped: ${skipReason}`）
  - `verdict:parsed` emit（verdict `skipped` / toolResult null / followUpAttempts 0）
  - `store.persist(state)`
- [ ] `commitHalt(step, state, halt): Promise<never>` を実装する（現 6+2 guard の適用ブロックに一致、必ず throw）:
  - `state = recordFailedStepResult(state, step.name, halt.error, halt.recordOpts ?? {})`
  - `halt.kind === "failed"`: `state = await store.fail(state, halt.error, step.name)`
  - `halt.kind === "awaiting-resume"`: `transitionJob(state, "awaiting-resume", { trigger: "executor", reason: halt.resumePoint.reason, patch: { resumePoint: halt.resumePoint, ...(halt.statePatch?.mainCheckoutDrift ? { mainCheckoutDrift: halt.statePatch.mainCheckoutDrift } : {}), error: halt.error } })` → `store.appendInterruption({ ...halt.interruption, ts: now })`
  - `halt.history` があれば `store.appendHistory(state, { ts: now, ...halt.history })`
  - `store.persist(state)`
  - `attachStateAndRethrow(halt.thrownErr, state)`
- [ ] `apply(step, state, deps, result: StepExecutionResult): Promise<JobState>` を実装し `result.kind` で `commitSuccess` / `commitSkipped` / `commitHalt` へ分岐する（halt は throw）。

**Acceptance Criteria**:
- `commit-orchestrator.ts` が型エラーなしで compile される
- `commitHalt` の戻り型が `Promise<never>` で、全 path が `attachStateAndRethrow` に到達する
- 各 commit メソッドの副作用（呼ぶ store API・emit・順序）が現 executor の対応ブロックと1対1で一致する（コードレビューで照合）

---

## T-03: `StepExecutor` を producer 化する（store 書き込み・遷移手組みを除去）

- [ ] コンストラクタで `CommitOrchestrator` を1インスタンス構築し保持する（`storeFactory` / `events` / `permissionScope` を渡す）。`execute` シグネチャ（`(step, jobState, deps) => Promise<JobState>`）とコンストラクタ引数は**不変**に保つ。
- [ ] `execute` を begin → produce → apply の3段に書き換える:
  - `step:start` emit（現状維持）
  - `const begun = await this.orchestrator.begin(step, jobState)`
  - `const result = await this.produce(step, begun, deps)`（`runStepInternal` を producer 化）
  - `const out = await this.orchestrator.apply(step, begun, deps, result)`（halt は throw）
  - `step:complete` emit / catch で `step:error` emit（現状の err.state 抽出を維持）
- [ ] `runAgentStep` を `StepExecutionResult` を返す producer に変える:
  - 冒頭の `store.update` ＋ 開始 history を**削除**（begin へ移設済み）。以降は `begun` state を起点に処理
  - activation skip: `return { kind: "skipped", skipReason: decision.reason }`
  - `validateRequiredInputs` 失敗: `makeInputMissingHalt(...)` を構築し `return { kind: "halt", halt }`（`store.fail`/`appendHistory`/`persist`/`attachStateAndRethrow` を削除）
  - 6 guard（agent-throw / timeout / non-success / drift / output-gate / commit-fail）: `makeXxxHalt(...)` 構築後、**適用ブロックを削除**して `return { kind: "halt", halt }` に置換
  - 成功: `deriveStepCompletion` を呼び（現状どおり producer 内で実行）、`return { kind: "success", completion, completedAt, startedAt, session, agentBranch, modelUsage, followUpAttempts, transientRetryAttempts, completionReportDiagnostics }`
  - `finalizeStepArtifacts`（commit/push）＋ `commitMutex`（git 直列化）＋ `detectNoOp` は producer 内に**残す**（git 副作用 = R5 の範囲、state 書き込みではない）。no-op verdict override は `completion` に反映する経路を維持
- [ ] `runCliStep` を `StepExecutionResult` を返す producer に変える:
  - 冒頭の `store.update` ＋ 開始 history を削除（begin へ移設済み）
  - `step.run` throw: `makeCliStepFailHalt(...)` を構築し `return { kind: "halt", halt }`
  - 成功: 結果ファイル読込後 `deriveStepCompletion`（agentResult は `{ resultContent }`）を呼び `return { kind: "success", ... }`
- [ ] `finalizeStep` / `finalizeSkippedStep` の**副作用ブロックを削除**する（`commitSuccess` / `commitSkipped` へ移設済み）。verdict 導出（`deriveStepCompletion` 呼び出し）は producer 側に残すか、`commitSuccess` へ渡す `completion` として producer で計算する
- [ ] `validateRequiredInputs` を producer 化する（`store.fail`/`appendHistory`/`persist`/`attachStateAndRethrow` を除去し halt を返すか throw 相当を producer 上位へ伝播）。agent / cli 両呼び出し元で halt が `apply` へ渡ること
- [ ] `getStore` / `storeCache` / `storeCacheJobId` を executor から**除去**する（store アクセスは orchestrator が所有）。`executor.ts` に `store.persist` / `store.fail` / `store.update` / `store.appendHistory` / `store.appendInterruption` / `store.appendLineage` / `store.appendStepRun` / `transitionJob` / `attachStateAndRethrow` の call-site が**一切残らない**こと
- [ ] 不要になった import（`transitionJob`・`attachStateAndRethrow`・`appendInvocation`・lineage 系等で orchestrator へ移動したもの）を `executor.ts` から削除する

**Acceptance Criteria**:
- `executor.ts` に `store\.(persist|fail|update|appendHistory|appendInterruption|appendLineage|appendStepRun)\(` の call-site が 0（grep 確認、コメント除く）
- `executor.ts` に `transitionJob\(` / `attachStateAndRethrow\(` の call-site が 0
- `execute` シグネチャとコンストラクタ引数が不変（既存テスト `executor-commit-mutex` / `executor-drift-detection` / `executor-no-op` / `executor-resume-context` / `judge-verdict` がコンパイル・pass）
- `finalizeStepArtifacts` / `commitMutex` は producer 内に残存（`executor-commit-mutex.test.ts` の TC-035 が pass）

---

## T-04: B-13 / B-14 を ratify する（歯 ＋ catalog ＋ domain-model 同時昇格）

> `invariant-catalog-parity.test.ts`（TC-ICS-02）が model §4 ＝ conformance (A) ＝ describe ブロックの B-x ID 集合一致を強制する。3ファイルを**同一変更**で追加しないと parity が red。

- [ ] `tests/unit/architecture/core-invariants.test.ts` に `describe("B-13: …")` を追加する:
  - `executor.ts` を grep し `store\.(persist|fail|update|appendHistory|appendInterruption|appendLineage|appendStepRun)\(` の非コメント call-site が空であることを assert
  - liveness: `commit-orchestrator.ts` 側には対応 call-site が存在する（歯が vacuous でない）ことを確認
  - T-04 系の合成 regression guard（synthetic match が allowlist 無しで検出される / seam が抑制される）を既存 B-x に倣って追加
- [ ] `core-invariants.test.ts` に `describe("B-14: …")` を追加する:
  - `executor.ts` を grep し `(transitionJob|attachStateAndRethrow)\(` の非コメント call-site が空であることを assert
  - liveness ＋ 合成 regression guard を追加
- [ ] `architecture/model.md` §4 表に B-13 / B-14 行を追加する（parity 抽出正規表現 `^\s*\|\s*\*\*B-(\d+)\*\*` に一致する `| **B-13** | … | … |` 形式）:
  - B-13: 「逐次 step 実行の state commit は `CommitOrchestrator` が単一所有。`StepExecutor`（`executor.ts`）は `store` の書き込み API を呼ばず実行結果を値で返す」
  - B-14: 「step 失敗遷移は `StepHalt` を適用する `CommitOrchestrator` の単一適用点のみ。`StepExecutor` の実行経路で `transitionJob` / `attachStateAndRethrow` による遷移＋rethrow を手組みしない」
  - §4 冒頭の系統説明（B-5〜B-12 の列挙文）へ B-13 / B-14 を「commit orchestration 所有の call-site 制約」として加える
- [ ] `architecture/conformance.md` (A) 表に B-13 / B-14 行を追加する（`| **B-13** …` 形式、assert 内容 ＋ 検査方法 grep）
- [ ] `architecture/domain-model.md` の「## Value Objects」に `### StepHalt — step 停止判断の VO`（`failed` / `awaiting-resume` の DU）を追加し `→ src/core/step/step-halt.ts` を付す
- [ ] （任意・parity 非依存）`architecture/divergence-status.md` に B-13/B-14 ratify の状況断面を追記する場合は既存フォーマットに従う

**Acceptance Criteria**:
- `invariant-catalog-parity.test.ts`（TC-ICS-01〜05）が pass（model §4 ＝ conformance (A) ＝ describe の B-x ID 一致、undocumented / unenforced とも空）
- `describe("B-13")` / `describe("B-14")` が refactor 完了後 green（executor に禁止 call-site が無い）
- B-13 / B-14 の合成 regression guard が「禁止 call-site 再導入を検出する」ことを確認する
- `domain-model.md` に `StepHalt` Value Object が存在する

---

## T-05: single-writer 適用テストと逐次 regression テストを追加する

> 構造 scenario（B-13/B-14 の grep 歯 = T-04）は interface 非依存のため先行して書ける。behavioral テストは CommitOrchestrator interface 確定後（T-02 完了後）に書く。

- [ ] `src/core/step/__tests__/commit-orchestrator.test.ts` を新規作成し、成功・halt の適用を固定する:
  - **成功適用**: producer が返す成功結果を `commitSuccess` に渡すと、`store.persist` が呼ばれ、返る state の verdict / `steps` / history（`{step}-verdict`）/ branch が期待どおり
  - **halt 適用（failed）**: `failed` halt を `commitHalt` に渡すと `store.fail` → persist → throw（error に state attach）が起き、executor 側では起きない
  - **halt 適用（awaiting-resume）**: timeout/drift halt を渡すと `transitionJob("awaiting-resume")` ＋ `appendInterruption` ＋ history ＋ persist ＋ throw が起きる
  - **単一適用点**: 成功・halt とも state 永続化が `CommitOrchestrator` 経由でのみ起きる（executor 側に persist 経路が無い）ことを、mock store の呼び出し記録で固定
- [ ] 逐次 step の観測挙動不変を固定する regression テストを追加する（既存 `executor-*.test.ts` の scenario を活用しつつ、最終 state / verdict / history 列 / throw が本変更前と一致することを assert）:
  - agent 成功 step（judge 系 / producer 系）の verdict ＋ history 列
  - agent 失敗 step（non-success）の throw ＋ 最終 state（status failed / error）
  - awaiting-resume（timeout もしくは drift）の resumePoint / interruption / history
  - CLI step 成功パス（prose-parse）
- [ ] 並列不変の確認: 既存 `custom-reviewers-e2e` / `reviewer-activation-e2e` / `executor-commit-mutex`（TC-035）を回帰として実行し、round 最終 state が不変であることを確認する

**Acceptance Criteria**:
- `commit-orchestrator.test.ts` が「成功・halt とも CommitOrchestrator が適用する」「executor は persist しない」を固定する
- 逐次 regression テストが最終 state / verdict / history / throw の不変を固定する
- 既存の並列・executor テストが全 pass（回帰なし）

---

## T-06: import 整理と verification（typecheck && test green）

- [ ] `executor.ts` / `commit-orchestrator.ts` / `step-halt.ts` の import を整合させる（未使用 import 削除、新規 import パス確認）
- [ ] 新規ファイルが全て domain 層（`src/core/step/`）に留まり DSM edge を増やさないことを確認する（`core-invariants.test.ts` の DSM closure が pass）
- [ ] `bun run typecheck` が exit 0
- [ ] `bun run test` が exit 0（全 pass、回帰なし）

**Acceptance Criteria**:
- `bun run typecheck` exit code 0
- `bun run test` exit code 0（`core-invariants` / `invariant-catalog-parity` / `executor-*` / `commit-orchestrator` / 並列 e2e を含む全 pass）
- `src/core/step/commit-orchestrator.ts` が存在し、`executor.ts` に `store.*` 書き込み・`transitionJob`・`attachStateAndRethrow` の call-site が残っていない
