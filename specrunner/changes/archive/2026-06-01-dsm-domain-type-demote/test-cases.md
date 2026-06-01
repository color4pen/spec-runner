# Test Cases: adapters / ports が domain 型を直参照しない — 共有型を shared-kernel へ降格

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to design.md or tasks.md section

GIVEN/WHEN/THEN structure (required for each test case):
  **GIVEN** <preconditions>
  **WHEN** <action>
  **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — required design artifacts (design.md, tasks.md) are missing
-->

## Summary

- **Total**: 37 cases
- **Automated** (unit/integration): 32
- **Manual**: 5
- **Priority**: must: 30, should: 7, could: 0

---

### TC-001: DSM allowlist — DSM-adapter-domain エントリが 0 件

**Category**: integration  
**Priority**: must  
**Source**: T-10 / 受け入れ基準

**GIVEN** `arch-allowlist.ts` に `DSM-adapter-domain-*` の tracking エントリが 12 件存在する  
**WHEN** T-02〜T-09 の共有型降格と import 張り替えが完了し T-10 の allowlist 削除を適用した後  
**THEN** `arch-allowlist.ts` に `DSM-adapter-domain` を含む行が 0 件である

---

### TC-002: DSM allowlist — DSM-ports-domain エントリが 0 件

**Category**: integration  
**Priority**: must  
**Source**: T-10 / 受け入れ基準

**GIVEN** `arch-allowlist.ts` に `DSM-ports-domain-*` の tracking エントリが 4 件存在する  
**WHEN** T-02・T-03・T-04・T-05 の共有型降格が完了し T-10 の allowlist 削除を適用した後  
**THEN** `arch-allowlist.ts` に `DSM-ports-domain` を含む行が 0 件である

---

### TC-003: DSM allowlist — 新エントリが追加されていない（削除のみ）

**Category**: integration  
**Priority**: must  
**Source**: T-10 / ratchet 規約

**GIVEN** allowlist のエントリ件数が削除前に N 件である  
**WHEN** T-10 の allowlist 削除を適用した後  
**THEN** allowlist のエントリ件数が N - 16 件であり、削除前より増えている行が 0 件である

---

### TC-004: DSM closure test — 実違反が 16 件減少して green

**Category**: integration  
**Priority**: must  
**Source**: T-11 / 受け入れ基準

**GIVEN** allowlist 削除前の DSM closure test で §3 違反が allowlist によって凍結されている  
**WHEN** 共有型の kernel 降格・import 張り替え・allowlist 削除が全て完了した後に `bun run test` を実行したとき  
**THEN** DSM closure test が pass し、実違反 16 件が解消されている

---

### TC-005: liveness guard — allowlist に dead エントリが存在しない

**Category**: integration  
**Priority**: must  
**Source**: T-11 / 受け入れ基準

**GIVEN** allowlist から 16 件を削除した後、残存する各エントリは実違反を指している  
**WHEN** `bun run test` を実行したとき  
**THEN** liveness guard が pass し、実違反のない dead エントリが 0 件であることが確認される

---

### TC-006: kernel/agent-definition.ts — 全型を named export している

**Category**: unit  
**Priority**: must  
**Source**: T-02 / design D1

**GIVEN** T-02 の移動作業が完了している  
**WHEN** `src/kernel/agent-definition.ts` の export 一覧を検査したとき  
**THEN** `AgentDefinition`・`ToolSpec`・`AgentToolsetSpec`・`CustomToolSpec`・`AgentCapabilities`・`AGENT_TOOLSET_TYPE` が全て named export されている

---

### TC-007: kernel/agent-definition.ts — state/schema のみに依存（下方向のみ）

**Category**: unit  
**Priority**: must  
**Source**: T-02 Acceptance Criteria / design D1

**GIVEN** `src/kernel/agent-definition.ts` が作成されている  
**WHEN** そのファイルの import 一覧を静的に検査したとき  
**THEN** `state/schema.js` 以外の import が 0 件であり、`core/` への参照が存在しない

---

### TC-008: core/agent/definition.ts — re-export barrel になっている

**Category**: unit  
**Priority**: must  
**Source**: T-02

**GIVEN** T-02 完了後の `src/core/agent/definition.ts`  
**WHEN** そのファイルを読み込んだとき  
**THEN** `export * from "../../kernel/agent-definition.js"` のみ（または同等の re-export）で構成されており、型定義本体が含まれない

---

### TC-009: domain 内の既存 import site — agent/definition barrel 経由でコンパイル成功

**Category**: integration  
**Priority**: must  
**Source**: T-02 Acceptance Criteria

**GIVEN** `core/step/*.ts` 等の domain ファイルが `../agent/definition.js` を import している（変更なし）  
**WHEN** `bun run typecheck` を実行したとき  
**THEN** これらのファイルを一切変更することなくコンパイルが成功する

---

### TC-010: kernel/event-types.ts — ports への import が 0 件（kernel 内完結）

**Category**: unit  
**Priority**: must  
**Source**: T-03 Acceptance Criteria 注意事項

**GIVEN** `core/event/types.ts` が `core/port/report-result.js` から `BaseReportResult` を import していた  
**WHEN** T-03 で `kernel/event-types.ts` に移動し、import を `kernel/report-result.js` 直参照に変更した後  
**THEN** `kernel/event-types.ts` に `core/port/` への import が 0 件である

---

### TC-011: kernel/tool-types.ts — 外部 import が 0 件（self-contained）

**Category**: unit  
**Priority**: must  
**Source**: T-04 Acceptance Criteria

**GIVEN** `src/core/tools/types.ts` の内容を `src/kernel/tool-types.ts` に移動した後  
**WHEN** `kernel/tool-types.ts` の import 一覧を検査したとき  
**THEN** import 文が 0 件（完全 self-contained）である

---

### TC-012: kernel/step-types.ts — kernel 内 + shared-kernel のみに依存

**Category**: unit  
**Priority**: must  
**Source**: T-05 Acceptance Criteria

**GIVEN** `src/kernel/step-types.ts` が作成されている  
**WHEN** その import 一覧を検査したとき  
**THEN** `kernel/`・`state/`・`parser/`・`git/`・`util/` への import のみ存在し、`core/` への import が 0 件である

---

### TC-013: kernel/step-types.ts — ReportToolSpec が kernel/report-result.js 経由で解決される

**Category**: integration  
**Priority**: must  
**Source**: T-05 前提条件

**GIVEN** T-05 の前提手順として `kernel/report-result.ts` に `ReportToolSpec` 定義が移動されている  
**WHEN** `kernel/step-types.ts` が `./report-result.js` を import した状態で `bun run typecheck` を実行したとき  
**THEN** `AgentStep.reportTool?: ReportToolSpec<BaseReportResult>` がコンパイルエラーなしで解決される

---

### TC-014: kernel/step-context.ts — ports への import が 0 件

**Category**: unit  
**Priority**: must  
**Source**: T-06 Acceptance Criteria

**GIVEN** `StepContext` interface が `src/kernel/step-context.ts` に切り出されている  
**WHEN** そのファイルの import 一覧を検査したとき  
**THEN** `config/schema.js`・`parser/request-md.js`・`git/dynamic-context.js`・`./github-client.js` のみが import されており、`core/port/` への import が 0 件である

---

### TC-015: kernel/github-client.ts — GitHubClient interface が存在し外部 import が 0 件

**Category**: unit  
**Priority**: must  
**Source**: T-06

**GIVEN** T-06 の前提手順として `src/kernel/github-client.ts` が新規作成されている  
**WHEN** そのファイルを読み込んだとき  
**THEN** `GitHubClient` interface が定義されており、`core/` や `ports/` 等への import が 0 件である

---

### TC-016: core/port/github-client.ts — re-export barrel になっている

**Category**: unit  
**Priority**: must  
**Source**: T-06

**GIVEN** T-06 完了後の `src/core/port/github-client.ts`  
**WHEN** そのファイルを読み込んだとき  
**THEN** `export type { GitHubClient } from "../../kernel/github-client.js"` の re-export のみで構成されており、interface 定義本体が含まれない

---

### TC-017: core/types.ts — PipelineDeps が barrel 経由の StepContext を継承してコンパイル成功

**Category**: integration  
**Priority**: must  
**Source**: T-06 Acceptance Criteria

**GIVEN** `core/types.ts` が `export type { StepContext } from "../kernel/step-context.js"` を追加し `PipelineDeps extends StepContext` を保持している  
**WHEN** `bun run typecheck` を実行したとき  
**THEN** `core/types.ts` とその参照先がコンパイルエラーなしで成功する

---

### TC-018: kernel/diagnostic.ts — logger/stdout と util/env-filter のみに依存

**Category**: unit  
**Priority**: must  
**Source**: T-07 Acceptance Criteria

**GIVEN** `src/kernel/diagnostic.ts` が作成されている  
**WHEN** その import 一覧を検査したとき  
**THEN** `logger/stdout.js` と `util/env-filter.js` 以外の import が 0 件である

---

### TC-019: kernel/error-helpers.ts — state/schema のみに依存

**Category**: unit  
**Priority**: must  
**Source**: T-08 Acceptance Criteria

**GIVEN** `throwWrappedError` と `attachStateAndRethrow` が `src/kernel/error-helpers.ts` に切り出されている  
**WHEN** そのファイルの import 一覧を検査したとき  
**THEN** `state/schema.js` の type import のみ存在し、他の import が 0 件である

---

### TC-020: executor-helpers.ts — failStepWithError が kernel の throwWrappedError を利用してコンパイル成功

**Category**: integration  
**Priority**: must  
**Source**: T-08

**GIVEN** `core/step/executor-helpers.ts` が `throwWrappedError` を自前定義せず `kernel/error-helpers.js` から import している  
**WHEN** `bun run typecheck` を実行したとき  
**THEN** `executor-helpers.ts` がコンパイルエラーなしで成功し `failStepWithError` が型解決される

---

### TC-021: adapter/managed-agent/anthropic-client.ts — core/agent/definition.js への import が 0 件

**Category**: unit  
**Priority**: must  
**Source**: T-02

**GIVEN** `src/adapter/managed-agent/anthropic-client.ts` が `core/agent/definition.js` を import していた  
**WHEN** T-02 の import 張り替えを適用した後  
**THEN** そのファイルに `core/agent/definition.js` への import が 0 件であり `kernel/agent-definition.js` を参照している

---

### TC-022: core/port/anthropic-client.ts — core/agent/definition.js への import が 0 件

**Category**: unit  
**Priority**: must  
**Source**: T-02

**GIVEN** `src/core/port/anthropic-client.ts` が `../agent/definition.js` を import していた  
**WHEN** T-02 の import 張り替えを適用した後  
**THEN** そのファイルに `../agent/definition.js` への import が 0 件であり `kernel/agent-definition.js` を参照している

---

### TC-023: adapter/claude-code/agent-runner.ts — core/event/types.js への import が 0 件

**Category**: unit  
**Priority**: must  
**Source**: T-03

**GIVEN** `src/adapter/claude-code/agent-runner.ts` が `core/event/types.js` を import していた  
**WHEN** T-03 の import 張り替えを適用した後  
**THEN** そのファイルに `core/event/types.js` への import が 0 件であり `kernel/event-types.js` を参照している

---

### TC-024: core/port/agent-runner.ts — core/event/types.js および core/step/types.js への import が 0 件

**Category**: unit  
**Priority**: must  
**Source**: T-03 / T-05

**GIVEN** `src/core/port/agent-runner.ts` が `../event/types.js` と `../step/types.js` を import していた  
**WHEN** T-03・T-05 の import 張り替えを適用した後  
**THEN** そのファイルに `../event/types.js` / `../step/types.js` への import が 0 件であり `kernel/event-types.js` / `kernel/step-types.js` を参照している

---

### TC-025: adapter/managed-agent/sse-stream.ts — core/tools/types.js への import が 0 件

**Category**: unit  
**Priority**: must  
**Source**: T-04

**GIVEN** `src/adapter/managed-agent/sse-stream.ts` が `core/tools/types.js` を import していた  
**WHEN** T-04 の import 張り替えを適用した後  
**THEN** そのファイルに `core/tools/types.js` への import が 0 件であり `kernel/tool-types.js` を参照している

---

### TC-026: adapter/managed-agent/session-client.ts — core/tools/types.js への import が 0 件

**Category**: unit  
**Priority**: must  
**Source**: T-04

**GIVEN** `src/adapter/managed-agent/session-client.ts` が `core/tools/types.js` を import していた  
**WHEN** T-04 の import 張り替えを適用した後  
**THEN** そのファイルに `core/tools/types.js` への import が 0 件であり `kernel/tool-types.js` を参照している

---

### TC-027: core/port/session-client.ts — core/tools/types.js への import が 0 件

**Category**: unit  
**Priority**: must  
**Source**: T-04

**GIVEN** `src/core/port/session-client.ts` が `../tools/types.js` を import していた  
**WHEN** T-04 の import 張り替えを適用した後  
**THEN** そのファイルに `../tools/types.js` への import が 0 件であり `kernel/tool-types.js` を参照している

---

### TC-028: adapter 3 ファイル — StepContext が kernel/step-context.js から参照されている

**Category**: unit  
**Priority**: must  
**Source**: T-06

**GIVEN** `adapter/claude-code/agent-runner.ts`・`adapter/codex/agent-runner.ts`・`adapter/managed-agent/agent-runner.ts` が `StepContext` を `core/types.js` から import していた  
**WHEN** T-06 の import 張り替えを適用した後  
**THEN** 3 ファイルそれぞれで `StepContext` が `kernel/step-context.js` から参照されており、`core/types.js` からの `StepContext` import が 0 件である

---

### TC-029: adapter/claude-code/agent-runner.ts — core/lifecycle/diagnostic.js への import が 0 件

**Category**: unit  
**Priority**: must  
**Source**: T-07

**GIVEN** `src/adapter/claude-code/agent-runner.ts` が `core/lifecycle/diagnostic.js` を import していた  
**WHEN** T-07 の import 張り替えを適用した後  
**THEN** そのファイルに `core/lifecycle/diagnostic.js` への import が 0 件であり `kernel/diagnostic.js` を参照している

---

### TC-030: adapter/managed-agent/agent-runner.ts および error-helpers.ts — core/step/executor-helpers.js への import が 0 件

**Category**: unit  
**Priority**: must  
**Source**: T-08

**GIVEN** 両ファイルが `throwWrappedError` / `attachStateAndRethrow` を `core/step/executor-helpers.js` から import していた  
**WHEN** T-08 の import 張り替えを適用した後  
**THEN** 両ファイルで `throwWrappedError` / `attachStateAndRethrow` が `kernel/error-helpers.js` から参照されており、`core/step/executor-helpers.js` からのこれらの関数の import が 0 件である

---

### TC-031: adapter/managed-agent/agent-runner.ts — core/step/step-names.js への import が 0 件

**Category**: unit  
**Priority**: must  
**Source**: T-09

**GIVEN** `src/adapter/managed-agent/agent-runner.ts` が `core/step/step-names.js` を import していた  
**WHEN** T-09 の import 張り替えを適用した後  
**THEN** そのファイルに `core/step/step-names.js` への import が 0 件であり `kernel/step-names.js` を直参照している

---

### TC-032: implementation-notes.md — 全 import site が記録されており allowlist 16 件と対応している

**Category**: manual  
**Priority**: must  
**Source**: T-01 / 受け入れ基準

**GIVEN** T-01 で grep scan を実施した  
**WHEN** `implementation-notes.md` を読み込んだとき  
**THEN** adapter→domain / ports→domain の対象 import site が全件列挙されており、allowlist の 16 件エントリと 1:1 対応している記録が存在する

---

### TC-033: core-invariants.test.ts — B-1〜B-9 が無改変で green

**Category**: integration  
**Priority**: must  
**Source**: T-11 / 受け入れ基準

**GIVEN** `core-invariants.test.ts` の B-1〜B-9 describe ブロックが実装前と同一内容（変更なし）である  
**WHEN** `bun run test` を実行したとき  
**THEN** B-1〜B-9 の全 describe ブロックが pass し、失敗が 0 件である

---

### TC-034: 標準 verification — bun run build && typecheck && lint && test が全 green

**Category**: integration  
**Priority**: must  
**Source**: T-11 / 受け入れ基準

**GIVEN** T-02〜T-10 の全タスクが完了している  
**WHEN** `bun run build && bun run typecheck && bun run lint && bun run test` を実行したとき  
**THEN** 4 コマンド全てが exit code 0 で終了する

---

### TC-035: スコープ外 — core/runtime/ が変更されていない

**Category**: manual  
**Priority**: should  
**Source**: request.md スコープ外

**GIVEN** `src/core/runtime/` 配下はスコープ外と明示されている  
**WHEN** 全タスク完了後に `src/core/runtime/` 配下のファイル変更差分を確認したとき  
**THEN** `core/runtime/` 配下のファイルに変更が 0 件である

---

### TC-036: スコープ外 — core/types.ts の RuntimeStrategy / PipelineDeps 領域が変更されていない

**Category**: manual  
**Priority**: should  
**Source**: request.md スコープ外 / design 並行非干渉

**GIVEN** `core/types.ts` の `RuntimeStrategy` import と `PipelineDeps.runtimeStrategy` フィールドは並行 change の領分である  
**WHEN** 全タスク完了後に `core/types.ts` の差分を確認したとき  
**THEN** `RuntimeStrategy` import と `PipelineDeps.runtimeStrategy` フィールドに変更が 0 件であり `StepContext` 定義領域の切り出し以外の変更が存在しない

---

### TC-037: kernel 循環 import なし — kernel→domain / kernel→ports の逆方向 import が存在しない

**Category**: unit  
**Priority**: should  
**Source**: design Risks / Trade-offs

**GIVEN** kernel モジュール群（agent-definition / event-types / tool-types / step-types / step-context / diagnostic / error-helpers）が作成されている  
**WHEN** これらのファイルの import 一覧を網羅的に検査したとき  
**THEN** いずれのファイルも `src/core/` への import を持たず、循環 import が 0 件である

---

### TC-038: re-export barrel の連鎖 — domain 内 import が barrel 経由で正常に型解決される

**Category**: integration  
**Priority**: should  
**Source**: design D1 Rationale

**GIVEN** `core/step/types.ts`・`core/agent/definition.ts`・`core/event/types.ts`・`core/tools/types.ts` が kernel への re-export barrel になっている  
**WHEN** domain 内の既存 import site を含む `bun run typecheck` を実行したとき  
**THEN** barrel 経由の型解決でコンパイルエラーが発生せず、全 domain ファイルが成功する

---

### TC-039: core/step/executor-helpers.ts — throwWrappedError / attachStateAndRethrow が re-export になっている

**Category**: unit  
**Priority**: should  
**Source**: T-08

**GIVEN** T-08 完了後の `src/core/step/executor-helpers.ts`  
**WHEN** そのファイルを読み込んだとき  
**THEN** `throwWrappedError` と `attachStateAndRethrow` の関数本体が削除されており `export { throwWrappedError, attachStateAndRethrow } from "../../kernel/error-helpers.js"` の re-export になっている

---

### TC-040: core/lifecycle/diagnostic.ts — re-export barrel になっている

**Category**: unit  
**Priority**: should  
**Source**: T-07

**GIVEN** T-07 完了後の `src/core/lifecycle/diagnostic.ts`  
**WHEN** そのファイルを読み込んだとき  
**THEN** `export * from "../../kernel/diagnostic.js"` のみで構成されており、関数定義本体が含まれない

---

### TC-041: core/step/step-names.ts — re-export barrel を維持している

**Category**: unit  
**Priority**: should  
**Source**: T-09 / design D5

**GIVEN** `core/step/step-names.ts` は既に R3 で `kernel/step-names.ts` の re-export barrel として存在している  
**WHEN** T-09 完了後にそのファイルを読み込んだとき  
**THEN** re-export barrel の状態が維持されており、ファイルが変更されていない場合は問題なし

---

### TC-042: implementation-notes.md — T-01 scan 結果が DSM allowlist 16 件と 1:1 対応

**Category**: manual  
**Priority**: should  
**Source**: T-01 Acceptance Criteria

**GIVEN** T-01 の grep scan で adapter→domain / ports→domain の import site が列挙されている  
**WHEN** `implementation-notes.md` の scan 結果と `arch-allowlist.ts` の削除前 16 件を突合したとき  
**THEN** scan で列挙されたファイル・行と allowlist エントリが 1:1 に対応しており、漏れが 0 件である

---

### TC-043: kernel/report-result.ts — ReportToolSpec 定義が移動され core/port/report-result.ts が barrel になっている

**Category**: unit  
**Priority**: should  
**Source**: T-05 前提条件

**GIVEN** T-05 の前提手順として `core/port/report-result.ts` の `ReportToolSpec` 定義が `kernel/report-result.ts` に移動されている  
**WHEN** `core/port/report-result.ts` を読み込んだとき  
**THEN** `export type { ReportToolSpec } from "../../kernel/report-result.js"` の re-export のみで構成されており `ReportToolSpec` 定義本体が含まれない

---

## Result

```yaml
result: completed
total: 43
automated: 36
manual: 7
must: 34
should: 9
could: 0
blocked_reasons: []
```
