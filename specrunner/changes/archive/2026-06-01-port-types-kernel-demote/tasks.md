# Tasks: port-types-kernel-demote

## T-01: `src/kernel/model-usage.ts` を新設し `ModelUsage` を移動

- [x] `src/kernel/model-usage.ts` を作成し、`core/port/model-usage.ts` の `ModelUsage` interface 定義と JSDoc をコピー
- [x] `src/core/port/model-usage.ts` を re-export barrel に置換: `export type { ModelUsage } from "../../kernel/model-usage.js";`

**Acceptance Criteria**:
- `src/kernel/model-usage.ts` が `ModelUsage` interface を export する
- `src/core/port/model-usage.ts` は re-export のみ（1行）
- `bun run typecheck` が green

## T-02: `src/kernel/report-result.ts` を新設し `BaseReportResult` を移動

- [x] `src/kernel/report-result.ts` を作成し、`BaseReportResult` interface 定義のみを記述
- [x] `src/core/port/report-result.ts` の `BaseReportResult` interface 定義を削除し、kernel から import + re-export に置換: `import type { BaseReportResult } from "../../kernel/report-result.js"; export type { BaseReportResult } from "../../kernel/report-result.js";`
- [x] 派生型（`ProducerReportResult` 等）の `extends BaseReportResult` と parse 関数内の `BaseReportResult` 参照が kernel import 経由で解決されることを確認

**Acceptance Criteria**:
- `src/kernel/report-result.ts` が `BaseReportResult` interface を export する
- `src/core/port/report-result.ts` が `BaseReportResult` を kernel から import + re-export している
- `ReportToolSpec`, `FollowUpPolicy`, `DEFAULT_TOOL_RETRY`, parse 関数群, 派生型は `core/port/report-result.ts` に残っている
- `bun run typecheck` が green

## T-03: state/schema.ts と state/helpers.ts の import path を kernel に変更

- [x] `src/state/schema.ts` の `import type { ModelUsage } from "../core/port/model-usage.js"` を `import type { ModelUsage } from "../kernel/model-usage.js"` に変更
- [x] `src/state/schema.ts` の `export type { ModelUsage } from "../core/port/model-usage.js"` を `export type { ModelUsage } from "../kernel/model-usage.js"` に変更
- [x] `src/state/schema.ts` の `import type { BaseReportResult } from "../core/port/report-result.js"` を `import type { BaseReportResult } from "../kernel/report-result.js"` に変更
- [x] `src/state/helpers.ts` の `import type { BaseReportResult } from "../core/port/report-result.js"` を `import type { BaseReportResult } from "../kernel/report-result.js"` に変更

**Acceptance Criteria**:
- `src/state/` 内に `core/port` を import する行が存在しない（`grep -r "core/port" src/state/` が空）
- `bun run typecheck` が green

## T-04: arch-allowlist.ts の B3-state-port / B3-state-helpers エントリを削除

- [x] `tests/unit/architecture/arch-allowlist.ts` から tracking `"B3-state-helpers"` の 1 エントリを削除
- [x] 同ファイルから tracking `"B3-state-port"` の 2 エントリを削除
- [x] B3-state-port / B3-state-helpers に言及するコメント行を削除
- [x] B3-logger エントリ（1 件）が残っていることを確認

**Acceptance Criteria**:
- `arch-allowlist.ts` に tracking `"B3-state-port"` / `"B3-state-helpers"` のエントリが存在しない
- tracking `"B3-logger"` のエントリが残っている
- suppression-demo テスト（`core-invariants.test.ts` L523: B3-logger 参照）が引き続き pass する
- `bun run test` の architecture enforcement suite が green

## T-05: 全体検証

- [x] `bun run build && bun run typecheck && bun run lint && bun run test` が green

**Acceptance Criteria**:
- 全 4 コマンドが exit code 0
