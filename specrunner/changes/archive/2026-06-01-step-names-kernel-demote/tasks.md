# Tasks: step-names-kernel-demote

## T-01: `src/kernel/step-names.ts` を新設し定数を移動

- [x] `src/kernel/` ディレクトリを作成
- [x] `src/core/step/step-names.ts` の内容（`STEP_NAMES`, `AGENT_STEP_NAMES`, `CLI_STEP_NAMES` 定義 + JSDoc）を `src/kernel/step-names.ts` にコピー
- [x] `src/core/step/step-names.ts` を re-export barrel に置換: `export * from "../../kernel/step-names.js";`

**Acceptance Criteria**:
- `src/kernel/step-names.ts` が `STEP_NAMES`, `AGENT_STEP_NAMES`, `CLI_STEP_NAMES` を export する
- `src/core/step/step-names.ts` は `export * from "../../kernel/step-names.js"` のみ
- `bun run typecheck` が green

## T-02: config/state の import path を kernel に変更

- [x] `src/config/migrate.ts:13` の import を `"../core/step/step-names.js"` → `"../kernel/step-names.js"` に変更
- [x] `src/state/schema.ts:15` の import を `"../core/step/step-names.js"` → `"../kernel/step-names.js"` に変更

**Acceptance Criteria**:
- `src/config/` と `src/state/` に `core/step` を import する行が存在しない（`grep -r "core/step" src/config/ src/state/` が空）
- `StepName` / `AgentStepName` / `CliStepName` 型が `state/schema.ts` で正しく導出される
- `bun run typecheck` が green

## T-03: arch-allowlist.ts の R3 エントリを削除

- [x] `tests/unit/architecture/arch-allowlist.ts` から tracking `"R3"` の 2 エントリ（`config/migrate.ts` + `state/schema.ts`）を削除
- [x] R3 に言及するコメント行（`// R3: config/ and state/ → core/step/step-names`）を削除
- [x] burn-down priority コメント内の `R3 (step-names)` への言及を更新（R3 完了済みとするか削除）

**Acceptance Criteria**:
- `arch-allowlist.ts` に tracking `"R3"` のエントリが存在しない
- R1 / B3-state-port / B3-state-helpers / B3-logger 等の他エントリは残っている
- `bun run test` の architecture enforcement suite が green

## T-04: 全体検証

- [x] `bun run build && bun run typecheck && bun run lint && bun run test` が green

**Acceptance Criteria**:
- 全 4 コマンドが exit code 0
