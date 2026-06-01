# Test Cases: port-types-kernel-demote

## Summary

- **Total**: 23 cases
- **Automated** (unit/integration): 18
- **Manual**: 5
- **Priority**: must: 20, should: 3, could: 0

## Test Cases

---

### TC-001: `src/kernel/model-usage.ts` が `ModelUsage` interface を export する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01 AC

**GIVEN** `src/kernel/model-usage.ts` が新設されている  
**WHEN** そのファイルの export を確認する  
**THEN** `ModelUsage` interface が export されており、4 フィールド（inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens 相当）を持つ純粋データ interface である

---

### TC-002: `src/core/port/model-usage.ts` が re-export のみになっている

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01 AC

**GIVEN** `src/core/port/model-usage.ts` が更新されている  
**WHEN** そのファイルの内容を確認する  
**THEN** `export type { ModelUsage } from "../../kernel/model-usage.js"` という re-export 行のみが存在し、interface 定義が含まれない

---

### TC-003: `core/port/model-usage` 経由の import が既存 consumer で解決できる

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01 AC / design.md D3

**GIVEN** `core/port/model-usage.ts` が re-export barrel に変換されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** `core/port/model-usage.js` を import している既存 consumer（adapter/ 内等）のすべてが型エラーなく解決できる

---

### TC-004: `src/kernel/report-result.ts` が `BaseReportResult` interface を export する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 AC

**GIVEN** `src/kernel/report-result.ts` が新設されている  
**WHEN** そのファイルの export を確認する  
**THEN** `BaseReportResult` interface が export されており、`ok: boolean` と `reason?: string` の 2 フィールドを持つ純粋データ interface である

---

### TC-005: `src/core/port/report-result.ts` が `BaseReportResult` を kernel から import + re-export する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 AC / design.md D4

**GIVEN** `src/core/port/report-result.ts` が更新されている  
**WHEN** そのファイルの `BaseReportResult` に関する行を確認する  
**THEN** `import type { BaseReportResult } from "../../kernel/report-result.js"` および `export type { BaseReportResult } from "../../kernel/report-result.js"` が存在し、interface 定義がそのファイル内に含まれない

---

### TC-006: `core/port/report-result.ts` のポート固有エクスポートが残っている

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 AC / design.md D2

**GIVEN** `src/core/port/report-result.ts` が更新されている  
**WHEN** そのファイルの export を確認する  
**THEN** `ReportToolSpec`、`FollowUpPolicy`、`DEFAULT_TOOL_RETRY`、parse 関数群、`ProducerReportResult`、`JudgeReportResult` 等の派生型がすべて残っており、kernel に移動していない

---

### TC-007: `ProducerReportResult` 等の派生型が `BaseReportResult` を extends して型チェックを通過する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 AC / design.md Risks

**GIVEN** `BaseReportResult` が `src/kernel/report-result.ts` から import されるように変更されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** `ProducerReportResult extends BaseReportResult` 等の派生型が型エラーなく解決し、import 元変更による互換性破壊が発生しない

---

### TC-008: `src/state/` 内に `core/port` を import する行が存在しない

**Category**: manual
**Priority**: must
**Source**: tasks.md T-03 AC / request.md 受け入れ基準

**GIVEN** `src/state/schema.ts` および `src/state/helpers.ts` の import path が kernel に変更されている  
**WHEN** `grep -r "core/port" src/state/` を実行する  
**THEN** 出力が空であり、state 層から port 層への上向き依存が存在しない

---

### TC-009: `src/state/schema.ts` が `ModelUsage` を kernel から import する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03 AC / design.md D5

**GIVEN** `src/state/schema.ts` の import が更新されている  
**WHEN** そのファイルの `ModelUsage` に関する import 行を確認する  
**THEN** `import type { ModelUsage } from "../kernel/model-usage.js"` が存在し、`core/port/model-usage` を参照する行が存在しない

---

### TC-010: `src/state/schema.ts` が `BaseReportResult` を kernel から import する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03 AC / design.md D5

**GIVEN** `src/state/schema.ts` の import が更新されている  
**WHEN** そのファイルの `BaseReportResult` に関する import 行を確認する  
**THEN** `import type { BaseReportResult } from "../kernel/report-result.js"` が存在し、`core/port/report-result` を参照する行が存在しない

---

### TC-011: `src/state/helpers.ts` が `BaseReportResult` を kernel から import する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03 AC / design.md D5

**GIVEN** `src/state/helpers.ts` の import が更新されている  
**WHEN** そのファイルの `BaseReportResult` に関する import 行を確認する  
**THEN** `import type { BaseReportResult } from "../kernel/report-result.js"` が存在し、`core/port/report-result` を参照する行が存在しない

---

### TC-012: `arch-allowlist.ts` に `B3-state-port` エントリが存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 AC / design.md D6

**GIVEN** `tests/unit/architecture/arch-allowlist.ts` が更新されている  
**WHEN** そのファイル内の tracking 一覧を確認する  
**THEN** tracking `"B3-state-port"` を含むエントリが 0 件であり、関連するコメント行も削除されている

---

### TC-013: `arch-allowlist.ts` に `B3-state-helpers` エントリが存在しない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 AC / design.md D6

**GIVEN** `tests/unit/architecture/arch-allowlist.ts` が更新されている  
**WHEN** そのファイル内の tracking 一覧を確認する  
**THEN** tracking `"B3-state-helpers"` を含むエントリが 0 件であり、関連するコメント行も削除されている

---

### TC-014: `arch-allowlist.ts` に `B3-logger` エントリが残っている

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 AC / request.md 要件 4

**GIVEN** `tests/unit/architecture/arch-allowlist.ts` が更新されている  
**WHEN** そのファイル内の tracking 一覧を確認する  
**THEN** tracking `"B3-logger"` を含むエントリが 1 件存在し、削除されていない

---

### TC-015: suppression-demo テストが `B3-logger` を参照して pass する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 AC / design.md D6 / request.md 要件 4

**GIVEN** `tests/unit/architecture/core-invariants.test.ts` の suppression-demo テスト（L523 付近）が `B3-logger` を参照している  
**WHEN** `bun run test` でそのテストを実行する  
**THEN** suppression-demo テストが pass し、regression guard が維持されている

---

### TC-016: B-3 architecture enforcement suite が green

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04 AC / request.md 受け入れ基準

**GIVEN** state→port の B-3 upward edge が解消され、allowlist から B3-state-port / B3-state-helpers が削除されている  
**WHEN** `bun run test` の architecture enforcement suite を実行する  
**THEN** B-3 カテゴリのすべてのテスト（suppression-demo を含む）が green であり、state→port の edge に対する B-3 違反が検出されない

---

### TC-017: `bun run build` が green

**Category**: manual
**Priority**: must
**Source**: tasks.md T-05 AC

**GIVEN** 全変更（T-01〜T-04）が適用されている  
**WHEN** `bun run build` を実行する  
**THEN** exit code 0 で完了し、ビルドエラーが発生しない

---

### TC-018: `bun run typecheck` が green

**Category**: manual
**Priority**: must
**Source**: tasks.md T-05 AC / tasks.md T-01, T-02, T-03 AC

**GIVEN** 全変更（T-01〜T-04）が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** exit code 0 で完了し、型エラーが発生しない

---

### TC-019: `bun run lint` が green

**Category**: manual
**Priority**: must
**Source**: tasks.md T-05 AC

**GIVEN** 全変更（T-01〜T-04）が適用されている  
**WHEN** `bun run lint` を実行する  
**THEN** exit code 0 で完了し、lint エラーが発生しない

---

### TC-020: `bun run test` が green

**Category**: manual
**Priority**: must
**Source**: tasks.md T-05 AC / request.md 受け入れ基準

**GIVEN** 全変更（T-01〜T-04）が適用されている  
**WHEN** `bun run test` を実行する  
**THEN** exit code 0 で完了し、全テストが pass する

---

### TC-021: `ModelUsage` の型フィールド構造が変更されていない

**Category**: unit
**Priority**: should
**Source**: request.md 受け入れ基準 / design.md D1

**GIVEN** `ModelUsage` interface が `src/kernel/model-usage.ts` に移動されている  
**WHEN** 新旧の interface 定義のフィールド（名前・型・必須/オプション）を比較する  
**THEN** フィールド構造が元の `core/port/model-usage.ts` と完全に一致しており、追加・削除・変更がない

---

### TC-022: `BaseReportResult` の型フィールド構造が変更されていない

**Category**: unit
**Priority**: should
**Source**: request.md 受け入れ基準 / design.md D2

**GIVEN** `BaseReportResult` interface が `src/kernel/report-result.ts` に移動されている  
**WHEN** 新旧の interface 定義のフィールド（名前・型・必須/オプション）を比較する  
**THEN** フィールド構造が元の `core/port/report-result.ts` と完全に一致しており、`ok: boolean` と `reason?: string` の 2 フィールドが不変である

---

### TC-023: `B3-logger` edge が本 change で解消されていない（スコープ外維持）

**Category**: unit
**Priority**: should
**Source**: request.md スコープ外 / design.md Non-Goals

**GIVEN** 全変更（T-01〜T-04）が適用されている  
**WHEN** `arch-allowlist.ts` の `B3-logger` エントリと `src/logger/pipeline-logger.ts` の `core/event/event-bus.js` import を確認する  
**THEN** B3-logger エントリが allowlist に残り、`logger` → `core/event` の依存 edge が存在しており、本 change では解消されていない

---

## Result

```yaml
result: completed
total: 23
automated: 18
manual: 5
must: 20
should: 3
could: 0
blocked_reasons: []
```
