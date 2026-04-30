# Proposal — implementer / verification / build-fixer step 追加

## Why

現在の SpecRunner pipeline は spec 層（propose / spec-review / spec-fixer）までしか走らず、spec が approved になった後の「実装→検証→修正」を CLI が自走できない。ADR-20260424（4 直列セッションモデル）と ADR-20260429（D10 で後続 request として明示分離）で予告された implementer + verification + build-fixer の 3 step を 1 PR で main 経路に乗せ、spec 層と対称な「実装層 self-correct loop」を確立する。これにより spec → code self-host のための pipeline 状態機械が完成する。

## What Changes

- **新 Step 3 種を追加**:
  - `ImplementerStep` (`src/core/step/implementer.ts`) — `tasks.md` と spec を入力に実装 + git push を行う agent step
  - `VerificationStep` (`src/core/step/verification.ts`) — agent を呼ばず CLI が build/typecheck/test/lint/security 5 phase を直接実行する **CLI-resident step**（agent-less Step）
  - `BuildFixerStep` (`src/core/step/build-fixer.ts`) — verification 失敗時の mechanical 修正専用 agent step
- **新 Agent 2 種を `specrunner init` に登録**: `specrunner-implementer`, `specrunner-build-fixer`（spec-fixer と対称な `gitWrite = true` capability）
- **Pipeline transition table 拡張** (`src/core/pipeline/types.ts`):
  - `spec-review --approved→ implementer`（既存の `→ end` を置換）
  - `implementer --success→ verification`、`implementer --error→ escalate`
  - `verification --passed→ end`、`verification --failed→ build-fixer`、`verification --escalation→ escalate`
  - `build-fixer --success→ verification`、`build-fixer --error→ escalate`
  - loop guard: `verification ↔ build-fixer` cycle に max 3 iterations を適用
- **Verdict / StepName 型拡張** (`src/state/schema.ts`):
  - `Verdict` union に `"passed" | "failed" | "success" | "error"` を追加
  - `StepName` union に `"implementer" | "verification" | "build-fixer"` を追加
- **CLI verification runner 新設** (`src/core/verification/runner.ts`): `node:child_process` で `bun run <phase>` を順次（fail-fast）実行し、`verification-result.md` を生成
- **AgentRegistry 拡張** (`src/cli/init.ts`): implementer / build-fixer の 2 Agent を Anthropic に作成（VerificationStep は agent なしのため `AgentRegistry.fromSteps` から除外）
- **後続 request への橋渡し**: 本 PR では `verification --passed→ end` で止め、後続 request（code-review / code-fixer / PR 作成）で `→ code-review` に書き換えられるよう transition table の構造を保つ

## Capabilities

### New Capabilities

- `implementer-session`: spec approved 後にコードを実装し git push まで実行する agent step の責務とライフサイクル
- `verification-runner`: agent を呼ばず CLI が build/typecheck/test/lint/security 5 phase を実行する CLI-resident step と shell runner の責務
- `build-fixer-session`: verification 失敗時に mechanical な修正のみを行う agent step の責務（仕様変更や設計判断の禁止）

### Modified Capabilities

- `pipeline-orchestrator`: STANDARD_TRANSITIONS に新 step 群の遷移行を追加し、`verification ↔ build-fixer` cycle にも `maxIterations` loop guard を適用する。`spec-review --approved→ end` を `→ implementer` に置換
- `step-execution-architecture`: agent を持たない `Step` 形（agent-less / CLI-resident step）の表現方法を明示する。lifecycle は agent step とは別経路で `StepExecutor` から委譲される（具体方式は design.md ADR で確定）
- `agent-registry`: `AgentRegistry.fromSteps` が agent を持たない Step を skip して agent 作成対象から除外する規律を明示

## Impact

- **Affected code**:
  - 新規: `src/core/step/{implementer,verification,build-fixer}.ts`、`src/core/verification/runner.ts`、`src/prompts/{implementer,build-fixer}-system.ts`
  - 変更: `src/core/pipeline/types.ts`（transition table 拡張）、`src/state/schema.ts`（Verdict/StepName 拡張）、`src/core/pipeline/pipeline.ts`（loop guard 拡張）、`src/cli/init.ts`（AgentRegistry 拡張）、`src/cli/run.ts`（steps Map 拡張）、`src/core/agents/registry.ts`（agent-less Step skip 規律）
  - 場合により変更: `src/core/step/types.ts`（Step interface に agent-less 表現を追加する場合）または `src/core/step/executor.ts`（CLI-resident 分岐を追加する場合）
- **Affected tests**:
  - 新規: `tests/unit/core/verification/runner.test.ts`、`tests/unit/step/{implementer,verification,build-fixer}.test.ts`、`tests/unit/core/pipeline/pipeline.transitions.test.ts` への追加
  - 既存: `tests/unit/cli/init.test.ts` の AgentRegistry 期待値更新
- **External dependencies**: `node:child_process`（既存依存）。`bun:*` / `Bun.*` の import は禁止規律に従い使用しない
- **Anthropic Managed Agents**: 新規 Agent 2 種が `specrunner init` で作成される。既存環境では再 `init` が必要
- **Backward compatibility**: spec 層の挙動は不変（既存テスト regression 0 件が受け入れ基準）
- **Out of scope**（後続 request）: code-review step、code-fixer step、PR 作成 step、学習層 EventBus subscriber、cost ledger、E2E 実機検証
