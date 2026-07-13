# Tasks: executor の runAgentStep 概念分解

## T-01: `StepHalt` discriminated union を `step-halt.ts` に定義する

- [x] `src/core/step/step-halt.ts` を新規作成する
- [x] `StepHalt` 型を定義する:
  - `{ kind: "failed"; error: ErrorInfo; thrownErr: Error }` ― executor での `store.fail` 経路に対応
  - `{ kind: "awaiting-resume"; error: ErrorInfo; thrownErr: Error; resumePoint: { step: StepName; reason: string; iterationsExhausted: number }; interruption: { type: "interruption"; reason: string; errorCode?: string }; statePatch?: { mainCheckoutDrift?: MainCheckoutDrift } }` ― executor での `transitionJob` 経路に対応
- [x] 以下の 6 個の factory 関数を実装する（各 guard に 1 対 1 対応）。各関数は `ErrorInfo` を内部で組み立てて `StepHalt` を返す:
  - `makeAgentThrowHalt(err, stepName)` ― `:380` agent throw guard 用 (`kind: "failed"`, code: `AGENT_STEP_FAILED`)
  - `makeTimeoutHalt(runResult, stepName)` ― `:404` timeout guard 用 (`kind: "awaiting-resume"`, code: `POLL_TIMEOUT`)
  - `makeNonSuccessHalt(runResult, stepName)` ― `:442` non-success guard 用 (`kind: "failed"`, code: `AGENT_STEP_FAILED`)
  - `makeDriftHalt(drift, stepName, changes)` ― `:472` main-checkout drift guard 用 (`kind: "awaiting-resume"`, code: `MAIN_CHECKOUT_WRITE_DETECTED`, `statePatch.mainCheckoutDrift` を含む)
  - `makeOutputGateHalt(violations, stepName, branch)` ― `:525` output-gate guard 用 (`kind: "failed"`, code: `STEP_OUTPUT_MISSING`)
  - `makeCommitFailHalt(err, stepName)` ― `:598` commit-fail guard 用 (`kind: "failed"`, code: `COMMIT_AND_PUSH_FAILED`)
- [x] 必要な型を `src/state/schema.ts` / `src/core/step/step-names.ts` からインポートする（`StepName`、`ErrorInfo`、`MainCheckoutDrift` 等）

**Acceptance Criteria**:
- `step-halt.ts` が TypeScript 型エラーなしで compile される
- `StepHalt` の `kind` プロパティで `failed` / `awaiting-resume` が exhaustive に判別できる
- 各 factory 関数が正しい `kind` と `ErrorInfo.code` を返す（目視確認 / 型チェック）

---

## T-02: `buildStepContext` を `step-context-builder.ts` に実装する

- [x] `src/core/step/step-context-builder.ts` を新規作成する
- [x] 以下のシグネチャで `buildStepContext` を実装する:
  ```typescript
  export async function buildStepContext(
    step: AgentStep,
    state: JobState,
    deps: PipelineDeps,
    cwd: string,
    emitFn: (event: DomainEvent, payload: Record<string, unknown>) => void,
  ): Promise<AgentRunContext>
  ```
- [x] `executor.ts:256-347` のコードを丸ごと移植する（以下の順序で処理する）:
  1. `projectContext` 読み込み（`step.needsProjectContext === true` の場合）
  2. `resolveStepRules` + `buildRulesFollowUpPrompts` でルール follow-up prompt 列を組み立てる
  3. `existingFollowUp` と `rulesPrompts` を結合して `allFollowUpPrompts` を作る
  4. `resumeSessionId` を `FIXER_STEP_NAMES` / `getPreviousSessionId` で解決する
  5. `sessionLogPath` をデバッグレベル条件で計算する
  6. `outputVerification` ポリシーを `followUpContracts` から構築する
  7. `effectiveResumePrompt` を `buildResumePrompt` で組み立てる
  8. `AgentRunContext` オブジェクト（`ctx`）を構築して返す（`emit` フィールドは引数の `emitFn` を使う）
- [x] 関数内に **制御フローによる挙動分岐（条件付き early return や例外投げ）を一切含めない**（I/O は許容、分岐は許容、ただし全パスが ctx を組み立てて return する）
- [x] 必要な依存（`resolveStepRules`, `buildRulesFollowUpPrompts`, `buildResumePrompt`, `FIXER_STEP_NAMES`, `getPreviousSessionId`, `projectMdPath`, 等）を import する

**Acceptance Criteria**:
- `step-context-builder.ts` が型エラーなしで compile される
- `executor.ts` の `runAgentStep` が `buildStepContext` 呼び出しでコンパイルエラーを出さない
- 関数内に `throw` / `process.exit` / `attachStateAndRethrow` が存在しない（grep で確認）

---

## T-03: `StepCompletion` 型と `deriveStepCompletion` 関数を `step-completion.ts` に実装する

- [x] `src/core/step/step-completion.ts` を新規作成する
- [x] `StepCompletion` インターフェースを定義する:
  ```typescript
  export interface StepCompletion {
    verdict: Verdict;
    persistToolResult: (BaseReportResult & { findings?: Finding[] }) | null;
  }
  ```
- [x] `deriveStepCompletion` 関数を実装する。以下を引数として受け取る:
  - `step: Step` ― ステップ宣言
  - `state: JobState` ― 現在の job 状態
  - `deps: PipelineDeps` ― パイプライン依存（`runtimeStrategy`, `cwd`, `decisions` 等）
  - `agentResult` ― `finalizeStep` の現行 `agentResult` 引数と同等の型（`toolResult?`, `verdictOverride?`, `followUpAttempts?`, 等）、`undefined` 可
  - `permissionScope: PermissionScope | undefined` ― scope breach 合成用
- [x] `executor.ts:finalizeStep` の verdict 導出ブロック（`:793-915`）を `deriveStepCompletion` へ移植する。移植する範囲:
  - `stepReportTool` / `isConformanceStep` / `isJudgeStep` / `isRequestReviewStep` の判定
  - `computeExtraScopeFindings` 呼び出し
  - 各 step 種別の verdict 分岐（`isRequestReviewStep` / `isConformanceStep` / `isJudgeStep` / producer / prose-parse）
  - `effectiveToolResult` の組み立てと `persistToolResult` の確定
  - `verifyFindingRefs` 呼び出しと `verdict = "escalation"` へのフォールバック
  - null toolResult の fallback（escalation / needs-discussion / completionVerdict）
  - `verdictOverride` 適用（`verdict !== "error"` の guard を含む）
  - 最終 `verdict` の null ガード（`verdict ?? "escalation"`）
- [x] `deriveStepCompletion` は state への書き込み（`store.persist` / `store.fail` / `store.appendHistory`）を**一切行わない**

**Acceptance Criteria**:
- `step-completion.ts` が型エラーなしで compile される
- `deriveStepCompletion` の戻り値型が `Promise<StepCompletion>` である
- 関数内に `store.persist` / `store.fail` / `store.appendHistory` / `attachStateAndRethrow` が存在しない

---

## T-04: `runAgentStep` を `buildStepContext` と `StepHalt` factories を使うよう書き換える

- [x] `executor.ts` の `runAgentStep` で `buildStepContext` をインポートし、context 組立ブロック（`:256-347`）を以下の1行へ置換する:
  ```typescript
  const ctx = await buildStepContext(step, state, deps, cwd, (event, payload) => {
    this.events.emit(event, payload as never);
  });
  ```
  ※ `deps.resumePrompt = undefined` のクリアブロック（`:349-353`）は `buildStepContext` 呼び出し直後・`runner.run` 呼び出し前に executor 内に残す（one-shot 消費の契約を維持するため）
- [x] 6 箇所の失敗 guard を `StepHalt` factory を呼び出す形に書き換える。各 guard について:
  - factory 関数で `StepHalt` 値を構築する
  - その直後の**同一ブロック内**で `halt.error` / `halt.resumePoint` / `halt.statePatch` / `halt.thrownErr` を使って既存と同等の persist / transition / rethrow を実行する（適用コードは executor 内に残す）
  - 具体的な書き換え対象: `:380` / `:404` / `:442` / `:472` / `:525` / `:598`
- [x] `buildStepContext` に移したコードが `runAgentStep` 内に二重に存在しないことを確認する（重複削除）
- [x] `buildStepContext` から return された `AgentRunContext` に含まれる `ctx.session.resumeSessionId` / `ctx.policy.postWorkPrompts` 等が既存と同じ値になることを型チェック + テストで確認する

**Acceptance Criteria**:
- `runAgentStep` の context 組立ブロック（`:256-347` 相当）が `buildStepContext` 呼び出しに置換されている
- 6 箇所すべての guard に `makeXxxHalt(...)` 呼び出しが存在し、戻り値の `halt` が同一ブロック内で使われている
- 既存の executor テスト（`executor-commit-mutex.test.ts`, `executor-drift-detection.test.ts`, `executor-no-op.test.ts`, `executor-resume-context.test.ts`）が pass する

---

## T-05: `finalizeStep` を `deriveStepCompletion` を使うよう書き換える

- [x] `executor.ts` の `finalizeStep` で `deriveStepCompletion` をインポートする
- [x] `finalizeStep` 内の verdict 導出ブロック（`:793-915` 相当）を以下に置換する:
  ```typescript
  const { verdict, persistToolResult } = await deriveStepCompletion(
    step, state, deps, agentResult, this.permissionScope,
  );
  ```
- [x] `verdict` / `persistToolResult` を参照している後続コード（`pushStepResult` 引数 / `events.emit("verdict:parsed", ...)` / usage 追記等）が引き続き正しく動作することを確認する
- [x] `finalizeStep` から移植済みのコードが消去されており二重実装になっていないことを確認する
- [x] `runCliStep` から `finalizeStep` を呼ぶパス（`agentResult` が undefined）でも `deriveStepCompletion` が正しく動作することを確認する（CLI step は prose-parse path を使う）

**Acceptance Criteria**:
- `finalizeStep` の verdict 導出ブロックが `deriveStepCompletion` 呼び出し1行に置換されている
- `runCliStep` 経由のパスでテストが pass する（`bun run test` 全通過）
- `finalizeStep` 内に `isJudgeStep` / `isConformanceStep` / `isRequestReviewStep` 等の verdict 計算変数の再宣言がない

---

## T-06: import パスの更新と typecheck / test の確認

- [x] `executor.ts` に追加した import 行（`buildStepContext`, `StepHalt` factories, `deriveStepCompletion`）を正しいパスで宣言する
- [x] 移植元から削除した import で不要になったものを `executor.ts` から削除する（使われなくなった import は TypeScript が警告するので逐次整理する）
- [x] architecture test（`tests/unit/architecture/core-invariants.test.ts`）が新規ファイル追加によって影響を受けないことを確認する（新ファイルはいずれも `src/core/step/` 内 = domain 層に留まり、layer crossing なし）
- [x] `bun run typecheck` が 0 エラーで通過することを確認する
- [x] `bun run test` が全 pass することを確認する（リグレッションなし）

**Acceptance Criteria**:
- `bun run typecheck` exit code 0
- `bun run test` exit code 0（全テスト pass）
- `src/core/step/step-halt.ts`, `src/core/step/step-context-builder.ts`, `src/core/step/step-completion.ts` が存在する
- `executor.ts` 内に `buildStepContext` の移植元コード（`:256-347` の内容）が残っていない
- `executor.ts` 内の `finalizeStep` 内に verdict 導出ロジック（`isJudgeStep`、`deriveJudgeVerdict` 等の呼び出し）が残っていない（`deriveStepCompletion` へ委譲済み）
