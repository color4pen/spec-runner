# Tasks: validated step-name cast

## T-01: `toStepName` を `src/core/step/step-names.ts` に再導入する

- [x] `src/core/step/step-names.ts` に `import type { StepName } from "../../state/schema.js";` を追加する（既存の `export * from "../../kernel/step-names.js";` は維持）。
- [x] `AGENT_STEP_NAMES` と `CLI_STEP_NAMES`（同 module で re-export 済み）から、module 内 private な `ALL_STEP_NAMES_SET = new Set<string>([...AGENT_STEP_NAMES, ...CLI_STEP_NAMES])` を構成する。
- [x] `export function toStepName(name: string): StepName` を追加する。`ALL_STEP_NAMES_SET.has(name)` が false なら未登録である旨のメッセージで `throw new Error(...)`、true なら `name as StepName` を返す。

**Acceptance Criteria**:
- `toStepName` が `src/core/step/step-names.ts` から export されている。
- 登録済み step 名（例 `"implementer"`）を渡すと同じ値が返る。
- 未登録の文字列（例 `"not-a-step"`）を渡すと throw する。
- `src/kernel/step-names.ts` には変更を加えない（leaf の依存方向を維持）。

## T-02: `pipeline.ts` の 3 箇所を `toStepName()` に置換する

- [x] `src/core/pipeline/pipeline.ts` に `import { toStepName } from "../step/step-names.js";` を追加する。
- [x] L102 `(finalState.step ?? startStep) as StepName` → `toStepName(finalState.step ?? startStep)`。
- [x] L294 `currentStep as StepName` → `toStepName(currentStep)`。
- [x] L505 `(this.loopFixerPairs[exhaustedLoopName] ?? exhaustedLoopName) as StepName` → `toStepName(this.loopFixerPairs[exhaustedLoopName] ?? exhaustedLoopName)`。
- [x] L4 の import から `StepName` を除去する（他で未使用になるため。`JobState, Verdict, StepRun` は残す）。

**Acceptance Criteria**:
- `pipeline.ts` に `as StepName` が 1 つも残らない。
- 未使用 import が残らず lint が green。

## T-03: `executor.ts` の timeout resumePoint 記録を `toStepName()` に置換する

- [x] `src/core/step/executor.ts` に `import { toStepName } from "./step-names.js";` を追加する。
- [x] L297 `step: step.name as import("../../state/schema.js").StepName` → `step: toStepName(step.name)`。

**Acceptance Criteria**:
- `executor.ts` の timeout resumePoint 記録から `as ...StepName` が消え `toStepName(step.name)` になっている。

## T-04: `resolve-step.ts` の `--from` cast を `toStepName()` に置換する

- [x] `src/core/resume/resolve-step.ts` に `import { toStepName } from "../step/step-names.js";` を追加する。
- [x] L22 `return from as StepName;` → `return toStepName(from);`（直前の `ALL_STEP_NAMES_SET.has(from)` ガードと不正値の詳細エラー分岐は現状維持）。
- [x] `StepName` の type import（L1）は戻り値型で使用しているため残す。

**Acceptance Criteria**:
- `resolve-step.ts` から `as StepName` が消える。
- `--from` 不正値で従来どおり "Available step names: ..." を含むエラーが throw される（既存テスト `tests/unit/core/resume/resolve-step.test.ts` が green）。

## T-05: runtime（`local.ts` / `managed.ts`）の signal-handler cast を置換する

- [x] `src/core/runtime/local.ts` に `import { toStepName } from "../step/step-names.js";` を追加し、L718 `(current.step ?? startStep) as StepName` → `toStepName(current.step ?? startStep)`。
- [x] `local.ts` L14 の import から `StepName` を除去する（`JobState` は残す）。
- [x] `src/core/runtime/managed.ts` に `import { toStepName } from "../step/step-names.js";` を追加し、L398 `startStep as StepName` → `toStepName(startStep)`。
- [x] `managed.ts` L17 の import から `StepName` を除去する（`JobState, RequestInfo, RepositoryInfo` は残す）。

**Acceptance Criteria**:
- `local.ts` / `managed.ts` の signal-handler resumePoint 記録から `as StepName` が消える。
- 未使用 import が残らず lint が green。

## T-06: `resume.ts:147` を optional を保つ条件付き変換に置換する

- [x] `src/core/command/resume.ts` に `import { toStepName } from "../step/step-names.js";` を追加する。
- [x] L147 `const startStepForCheck = resumePoint?.step ?? (state.step as StepName | undefined);` を、`state.step` が falsy なら `undefined`、truthy なら `toStepName(state.step)` を返す形に置換する（例: `resumePoint?.step ?? (state.step ? toStepName(state.step) : undefined)`）。結果型は `StepName | undefined` を保つ。
- [x] `StepName` の type import（L16）は L167 `let startStep: StepName` で使用しているため残す。

**Acceptance Criteria**:
- `resume.ts` から `as StepName` cast が消える。
- `state.step` が falsy のとき `startStepForCheck` は `undefined` になり、後続 `if (startStepForCheck)` ガードが従来どおりスキップされる（throw しない）。

## T-07: `toStepName` の unit test を追加する

- [x] `tests/unit/core/step/step-names.test.ts` を新規作成する。
- [x] 全ての登録済み step 名（`AGENT_STEP_NAMES` ∪ `CLI_STEP_NAMES`）が `toStepName` を通過して同値で返ることを検証する。
- [x] 未登録文字列（例 `"not-a-step"` / 空文字 / legacy alias `"critic"`）で `toStepName` が throw することを検証する。

**Acceptance Criteria**:
- 新規テストファイルが追加され、valid 名で同値返却・invalid 名で throw を両方カバーしている。
- `bun run test` が green。

## T-08: スコープ外の残存確認と全体検証

- [x] `src/store/job-state-store.ts:674` の `(validated.step ?? "init") as StepName` を **変更しない**（journal 復元の `"init"` フォールバックのため、本 change のスコープ外）。
- [x] `grep -rn "as StepName" src/` の結果が `job-state-store.ts` の 1 箇所のみであることを確認する（テストの `as StepName` は対象外）。
- [x] `bun run typecheck` が green。
- [x] `bun run test` が green。

**Acceptance Criteria**:
- src 配下で `as StepName` が残るのは `job-state-store.ts` の 1 箇所のみ。
- `bun run typecheck && bun run test` が green。
