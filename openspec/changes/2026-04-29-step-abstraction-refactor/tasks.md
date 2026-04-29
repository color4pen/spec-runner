## 1. Module Skeleton & Directory Layout (D7)

- [x] 1.1 `src/core/{pipeline,step,agent,event,port}/` ディレクトリを作成し、各々に index.ts と placeholder を置く
- [x] 1.2 `src/adapter/{anthropic,github}/` ディレクトリを作成し、placeholder を置く
- [x] 1.3 `src/store/` ディレクトリを作成し、placeholder を置く
- [x] 1.4 `src/cli/` を composition root の入口として整理（既存 `src/cli/` は残す）
- [x] 1.5 現在 passing の 161 テスト PASS を確認（この commit で挙動変化が無いこと）
- [x] 1.6 commit: `chore: introduce module skeleton (core/adapter/store)`

## 2. JobStateStore class + StepRun[] schema (D8a + D8b)

- [x] 2.1 `src/store/job-state-store.ts` に `JobStateStore` class を新設し、`load` / `persist` / `appendHistory` / `appendStepRun` を method 化
- [x] 2.2 `atomic-write` 呼び出しを `JobStateStore` 内部に隠蔽（既存 `state/store.ts` から委譲）
- [x] 2.3 `JobState.steps` schema を `Record<StepName, StepRun[]>` に変更（`src/state/schema.ts`）
- [x] 2.4 `StepRun` interface を定義: `attempt: number / sessionId: string / outcome: StepOutcome / startedAt: ISO8601 / endedAt: ISO8601`
- [x] 2.5 `JobStateStore.load()` で旧 schema normalization 実装:
  - PR #24 前（単数 `StepResult`）→ `[StepRun]`
  - PR #24 後（`StepResult[]`）→ `StepRun[]`
- [x] 2.6 旧 schema 固定 fixture を `tests/fixtures/legacy-job-state-{pre-pr24,post-pr24}.json` に追加
- [x] 2.7 `JobStateStore` の unit test 追加（must-area: legacy load + normalization）
- [x] 2.8 `JobStateStore.appendStepRun` の unit test 追加（must-area: append / 永続化）
- [x] 2.9 既存 `src/state/store.ts` の関数 export は残し、内部で `JobStateStore` に委譲（呼び出し側の段階的移行のため）
- [x] 2.10 現在 passing の 161 テスト + 新規テスト 全 PASS を確認
- [x] 2.11 commit: `feat(store): JobStateStore class + StepRun[] schema with backward-compat normalization`

## 3. Step interface + StepExecutor + Tool 同居 (D1 + D2 + D9)

- [x] 3.1 `src/core/step/types.ts` に `Step` interface 定義（`name / agent / toolHandlers? / buildMessage / resultFilePath / parseResult`）
- [x] 3.2 `src/core/step/executor.ts` に `StepExecutor` class 実装
  - constructor: `SessionClient`, `JobStateStore`, `EventBus` を注入
  - `execute(step, state, deps)` で I/O lifecycle 全体を回す
  - 既存 `propose.ts` / `spec-review.ts` / `spec-fixer.ts` の 45–55 行コピペ箇所を集約
- [x] 3.3 `src/core/step/propose.ts` に `ProposeStep: Step` 実装を移植
  - `buildMessage` / `resultFilePath` / `parseResult` のみ持つ
  - `toolHandlers: Map(["register_branch", registerBranchHandler])` を同居
- [x] 3.4 `src/core/step/spec-review.ts` に `SpecReviewStep: Step` 実装を移植
- [x] 3.5 `src/core/step/spec-fixer.ts` に `SpecFixerStep: Step` 実装を移植
- [x] 3.6 既存 `src/core/steps/{propose,spec-review,spec-fixer}.ts` の `runProposeStep` / `runSpecReviewStep` / `runSpecFixerStep` 関数を廃止（8.2 で `src/core/steps/` ディレクトリを削除。関数は step/ に移植済み）
- [x] 3.7 各 step ファイルが以前の 1/3 程度の LOC に縮小していることを確認（新ファイルで達成）
- [x] 3.8 グローバル tool registry (`src/core/tools/registry.ts`) を削除（8.1 で対応済み）
- [x] 3.9 `src/core/tools/register-branch.ts` の handler を `src/core/step/propose.ts` の `toolHandlers` に移動
- [x] 3.10 `core` 層から `@anthropic-ai/sdk` 直 import が無いことを確認（Group 6 で対応済み。7.7 grep で確認）
- [x] 3.11 StepExecutor の unit test 追加（must-area: Step 実装の振る舞い不変、Custom Tool 同居動作）
- [x] 3.12 現在 passing の 161 テスト + 新規テスト 全 PASS を確認
- [x] 3.13 commit: `refactor(step): Step interface + StepExecutor + tool co-location, abolish global registry`

## 4. Pipeline class + Transition table (D3)

- [x] 4.1 `src/core/pipeline/types.ts` に `Transition = { step: StepName; on: Verdict; to: StepName | "end" | "escalate" }` を定義
- [x] 4.2 `src/core/pipeline/pipeline.ts` に `Pipeline` class 実装
  - constructor: `Map<StepName, Step>`, `Transition[]`, `maxIterations`, `StepExecutor`, `EventBus`
  - `run(start: StepName, state: JobState, deps): Promise<JobState>` で state machine 駆動
- [x] 4.3 既存 `pipeline.ts:78-86` の inline if 連鎖 + `runLoopUntil` を `Pipeline.run` に置換
- [x] 4.4 transition table の standard set を定義:
  - propose --success→ end
  - propose --error→ escalate
  - spec-review --approved→ end
  - spec-review --needs-fix→ spec-fixer
  - spec-fixer --approved→ spec-review
  - spec-review --escalation→ escalate
  - spec-fixer --error→ escalate
- [x] 4.5 `maxIterations` で spec-review ↔ spec-fixer の cycle に loop guard を実装。既存 `SPEC_REVIEW_RETRIES_EXHAUSTED` の trigger 条件を維持
- [x] 4.6 Pipeline の unit test 追加（must-area: transition table 駆動、cycle、loop guard）
- [x] 4.7 既存 pipeline integration test の import path 修正（assertion 変更は禁止、振る舞い不変確認）
- [x] 4.8 現在 passing の 161 テスト + 新規テスト 全 PASS を確認
- [x] 4.9 commit: `refactor(pipeline): Pipeline class + declarative transition table`

## 5. EventBus + emit 配線 (D7)

- [x] 5.1 `src/core/event/types.ts` に `DomainEvent` union 型と `Payload<E>` mapped type を定義
  - events: `pipeline:start` / `pipeline:complete` / `pipeline:fail` / `step:start` / `step:complete` / `step:error` / `verdict:parsed`
- [x] 5.2 `src/core/event/event-bus.ts` に `EventBus` class 最小実装（`on(event, handler)` / `emit(event, payload)` のみ、synchronous）
- [x] 5.3 `StepExecutor.execute` で step:start / step:complete / step:error / verdict:parsed を emit
- [x] 5.4 `Pipeline.run` で pipeline:start / pipeline:complete / pipeline:fail を emit
- [x] 5.5 CLI 層（`src/cli/`）では subscribe しない（v1 では subscriber 0、ADR D7 通り）
- [x] 5.6 EventBus の unit test 追加（must-area: subscribe / emit）
- [x] 5.7 現在 passing の 161 テスト + 新規テスト 全 PASS を確認
- [x] 5.8 commit: `feat(event): EventBus reservation seat with step/pipeline lifecycle emission`

## 6. Composition Root + adapter 配線

- [x] 6.1 `src/cli/` (composition root) で `JobStateStore` / `EventBus` / `SessionClient` / step instances / `Pipeline` を構築・注入
- [x] 6.2 `src/adapter/anthropic/session-client.ts` に `SessionClient` interface 実装（`@anthropic-ai/sdk` の唯一の import 場所）
- [x] 6.3 `src/adapter/github/github-client.ts` に既存 GitHub I/O を移植
- [x] 6.4 `src/core/port/session-client.ts` / `src/core/port/github-client.ts` に interface 定義
- [x] 6.5 全 import 整理: `core` → `store` / `util` / `core/port` のみ依存、`core` → `adapter` 直接依存無いことを確認
- [x] 6.6 現在 passing の 184 テスト PASS を確認（元 161 + Group 2-6 新規テスト含む）
- [x] 6.7 commit: `refactor(layout): align imports to module boundaries (core/adapter/store/port)`

## 7. Behavior Invariance Verification

- [x] 7.1 旧 state file 固定サンプル（PR #24 前 / PR #24 後）の load → normalize → save round-trip test を追加（tests/store/job-state-store.test.ts TC-003/004 にて実装済み）
- [x] 7.2 CLI stdout snapshot test を追加（`[iter N/M]` 進捗行 + 最終サマリ文字列を pin）→ tests/cli-stdout-snapshot.test.ts
- [x] 7.3 エラーコード preservation test:
  - `SESSION_TIMEOUT` / `SESSION_TERMINATED` / `BRANCH_NOT_REGISTERED` / `SPEC_REVIEW_RETRIES_EXHAUSTED` / `CONFIG_INCOMPLETE` の 5 種が同じ trigger で発火することを assert → tests/error-codes.test.ts
- [x] 7.4 `register_branch` の `input_schema` JSON が変わっていないことを確認するテスト → tests/register-branch-schema.test.ts
- [x] 7.5 全 184 既存 passing テスト + 上記新規テスト 全 PASS を最終確認（207 pass, 1 fail pre-existing, 1 error pre-existing）
- [x] 7.6 `tsc --noEmit` 確認 — pre-existing エラー数 515 行で変化なし（AbortController/fetch 等は @types/node 未設定による環境起因。実装由来エラーなし）
- [x] 7.7 `grep -rE "from ['\"]@anthropic-ai/sdk" src/core/ src/store/` → 0 行（コメント内のみ）。adapter/ → core/ 逆方向も 0 行

## 8. Documentation & Cleanup

- [x] 8.1 `src/core/tools/registry.ts` + `index.ts` 削除（global registry 廃止、D4）。register-branch.ts + types.ts は保持（tests と executor が参照）
- [x] 8.1a `src/core/loop.ts` (`runLoopUntil`) 削除 — Pipeline.run に吸収済み
- [x] 8.1b `src/core/session-runner.ts` 削除（importers ゼロを確認後削除）
- [x] 8.2 `src/core/steps/` ディレクトリ削除完了（propose.ts + spec-review.ts を src/core/step/ + src/core/pipeline.ts に移植後削除）
- [x] 8.3 `src/state/store.ts` を deprecate 化（@deprecated jsdoc を主要 export に追加）
- [ ] 8.4 README / inline コメントの import path 例を新構造に更新（任意、必要箇所のみ）
- [ ] 8.5 `openspec change show 2026-04-29-step-abstraction-refactor` で artifact 整合確認

## 9. Spec Validation

- [x] 9.1 `openspec validate 2026-04-29-step-abstraction-refactor --strict` で spec delta の構造確認 → "Change '2026-04-29-step-abstraction-refactor' is valid"
- [x] 9.2 spec delta 5 種（job-state-store / step-execution-architecture / pipeline-orchestrator / module-boundary / pipeline-loop-primitive）が validate を通過することを確認
