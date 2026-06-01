# Tasks: adapters / ports が domain 型を直参照しない — 共有型を shared-kernel へ降格

<!-- FORMAT REQUIREMENTS:
Task heading format: `## T-NN: <task name>` (2-digit zero-padded, e.g. T-01)
Sub-task format:     `- [ ] <implementation detail>` (checkbox)

Each task MUST end with an **Acceptance Criteria** section listing verifiable conditions.
Tasks must be granular enough for the implementer to execute without additional clarification.
-->

## T-01: scan — 対象 import site の全件列挙

実装者が grep で adapter→domain / ports→domain の全 import site を確定し、`implementation-notes.md` に記録する。

- [x] `src/adapter/` から `core/agent/definition`, `core/step/types`, `core/event/types`, `core/tools/types`, `core/types`, `core/step/executor-helpers`, `core/step/step-names`, `core/lifecycle/diagnostic` への import を grep で列挙
- [x] `src/core/port/` から `../agent/definition`, `../step/types`, `../event/types`, `../tools/types` への import を grep で列挙
- [x] 結果を `specrunner/changes/dsm-domain-type-demote/implementation-notes.md` に記録
- [x] allowlist の `DSM-adapter-domain-*` / `DSM-ports-domain-*` エントリ（16 件）と突合し、漏れがないことを確認

**Acceptance Criteria**:
- `implementation-notes.md` に全対象ファイル・import 行の一覧が記録されている
- allowlist 16 件と 1:1 対応している

## T-02: `kernel/agent-definition.ts` — agent/definition 型を kernel に降格

- [x] `src/core/agent/definition.ts` の全内容を `src/kernel/agent-definition.ts` に移動（AgentStepName は kernel 原則によりインライン展開）
- [x] `src/core/agent/definition.ts` を re-export barrel に書き換え: `export * from "../../kernel/agent-definition.js";`
- [x] `src/adapter/managed-agent/anthropic-client.ts` の import を `../../kernel/agent-definition.js` に変更（type import + value import の 2 行）
- [x] `src/core/port/anthropic-client.ts` の import を `../../kernel/agent-definition.js` に変更

**Acceptance Criteria**:
- `kernel/agent-definition.ts` が `state/schema.js` のみに依存（下方向のみ）
- `core/agent/definition.ts` は re-export barrel（1〜2 行）
- domain 内の既存 import site（`core/step/*.ts` の ~10 ファイル）が変更なしでコンパイル成功
- `bun run typecheck` が green

## T-03: `kernel/event-types.ts` — event/types を kernel に降格

- [x] `src/core/event/types.ts` の `DomainEvent` 型を `src/kernel/event-types.ts` に移動（kernel 原則: EventPayloadMap/Payload は domain に残す）
- [x] `src/core/event/types.ts` を DomainEvent の re-export barrel + EventPayloadMap/Payload の残留に書き換え
- [x] `src/adapter/claude-code/agent-runner.ts` の `core/event/types.js` import を `../../kernel/event-types.js` に変更
- [x] `src/core/port/agent-runner.ts` の `../event/types.js` import を `../../kernel/event-types.js` に変更

**Acceptance Criteria**:
- `kernel/event-types.ts` が `state/schema.js` と `core/port/report-result.js` のみに依存
- 注意: `kernel/event-types.ts` が `core/port/report-result.js` を import している（`BaseReportResult` 型）。これは kernel→ports 方向だが、`core/port/report-result.ts` は `kernel/report-result.js` を re-export しているだけなので、`kernel/event-types.ts` からは `kernel/report-result.js` を直接 import する形に変更して kernel 内完結にすること
- `bun run typecheck` が green

## T-04: `kernel/tool-types.ts` — tools/types を kernel に降格

- [x] `src/core/tools/types.ts` の全内容を `src/kernel/tool-types.ts` に移動
- [x] `src/core/tools/types.ts` を re-export barrel に書き換え: `export * from "../../kernel/tool-types.js";`
- [x] `src/adapter/managed-agent/sse-stream.ts` の `core/tools/types.js` import を `../../kernel/tool-types.js` に変更
- [x] `src/adapter/managed-agent/session-client.ts` の `core/tools/types.js` import を `../../kernel/tool-types.js` に変更
- [x] `src/core/port/session-client.ts` の `../tools/types.js` import を `../../kernel/tool-types.js` に変更

**Acceptance Criteria**:
- `kernel/tool-types.ts` は外部 import ゼロ（self-contained）
- `bun run typecheck` が green

## T-05: `core/port/step-types.ts` — step/types を port に降格

Note: kernel 原則（import ゼロ）により、kernel でなく port 層（core/port/step-types.ts）に移動。
ReviewScores/FindingSeverityCounts は kernel ファイル（import-free interfaces）に降格し、port が参照。

- [x] `src/kernel/review-scores.ts` / `src/kernel/review-findings.ts` を新規作成（import ゼロ）
- [x] `src/core/port/step-types.ts` を新規作成し AgentStep/CliStep/Step 等を定義
- [x] import path を調整: state/schema, port/step-context, util/spawn, kernel/tool-types, kernel/agent-definition, kernel/review-scores, kernel/review-findings, git/dynamic-context, port/report-result
- [x] `src/core/step/types.ts` を re-export barrel に書き換え: `export * from "../port/step-types.js";`
- [x] `src/adapter/managed-agent/agent-runner.ts` の `core/step/types.js` import を `../../core/port/step-types.js` に変更
- [x] `src/core/port/agent-runner.ts` の `../step/types.js` import を `./step-types.js` に変更

**注意**: T-05 は T-02（agent-definition）、T-04（tool-types）、T-06（step-context）に依存する。先に T-02, T-04, T-06 を完了すること。

**Acceptance Criteria**:
- `kernel/step-types.ts` が kernel 内 + shared-kernel（state, parser, git, util）のみに依存
- domain 内の `core/step/*.ts`（design.ts, spec-review.ts 等）が barrel 経由で変更なしコンパイル
- `bun run typecheck` が green

## T-06: `core/port/step-context.ts` — StepContext を port に切り出し

Note: kernel 原則（import ゼロ）により、kernel でなく port 層（core/port/step-context.ts）に移動。
GitHubClient は kernel（import-free pure interface）に降格。

- [x] `src/kernel/github-client.ts` を新規作成し `GitHubClient` interface 全体をコピーする
- [x] `src/core/port/github-client.ts` を `export type { GitHubClient } from "../../kernel/github-client.js";` の re-export barrel に書き換える
- [x] `src/core/port/step-context.ts` を新規作成し StepContext interface を定義（imports: config, parser, git = shared-kernel, kernel/github-client = leaf）
- [x] `src/core/types.ts` に `export type { StepContext } from "./port/step-context.js";` を追加（PipelineDeps 定義は残す）
- [x] `src/adapter/claude-code/agent-runner.ts` の `core/types.js` import を `../../core/port/step-context.js` に変更
- [x] `src/adapter/codex/agent-runner.ts` の `core/types.js` import を `../../core/port/step-context.js` に変更
- [x] `src/adapter/managed-agent/agent-runner.ts` の `core/types.js` import を `../../core/port/step-context.js` に変更

**Acceptance Criteria**:
- `kernel/github-client.ts` が存在し `GitHubClient` interface を定義している
- `core/port/github-client.ts` が `kernel/github-client.js` への re-export barrel になっている
- `kernel/step-context.ts` が shared-kernel 層（config, parser, git）+ `./github-client.js`（kernel 内）のみに依存（ports への import なし）
- `core/types.ts` の `PipelineDeps extends StepContext` が barrel 経由で変更なしコンパイル
- `bun run typecheck` が green

## T-07: `logger/diagnostic.ts` — lifecycle/diagnostic を shared-kernel に移動

Note: kernel 原則（import ゼロ）により、kernel でなく logger 層（src/logger/diagnostic.ts = shared-kernel）に移動。

- [x] `src/core/lifecycle/diagnostic.ts` の全内容を `src/logger/diagnostic.ts` に移動（import path 調整: stdout.js, env-filter.js）
- [x] `src/core/lifecycle/diagnostic.ts` を re-export barrel に書き換え: `export * from "../../logger/diagnostic.js";`
- [x] `src/adapter/claude-code/agent-runner.ts` の `core/lifecycle/diagnostic.js` import を `../../logger/diagnostic.js` に変更

**Acceptance Criteria**:
- `kernel/diagnostic.ts` が `logger/stdout.js`（shared-kernel）と `util/env-filter.js`（leaf）のみに依存
- `bun run typecheck` が green

## T-08: `core/port/error-helpers.ts` — throwWrappedError / attachStateAndRethrow を port に切り出し

Note: kernel 原則（import ゼロ）により、kernel でなく port 層（core/port/error-helpers.ts）に移動。

- [x] `src/core/step/executor-helpers.ts` から `throwWrappedError` と `attachStateAndRethrow` の 2 関数を `src/core/port/error-helpers.ts` に切り出す
- [x] `core/port/error-helpers.ts` には `state/schema.js` の `JobState` / `ErrorInfo` type import のみ含める（port→shared-kernel ✓）
- [x] `src/core/step/executor-helpers.ts` に `export { throwWrappedError, attachStateAndRethrow } from "../port/error-helpers.js";` を追加し、ファイル内の関数定義を削除
- [x] `executor-helpers.ts` 内の `failStepWithError` が port の `throwWrappedError` を import する形に更新
- [x] `src/adapter/managed-agent/agent-runner.ts` の `core/step/executor-helpers.js` import を `../../core/port/error-helpers.js` に変更
- [x] `src/adapter/managed-agent/error-helpers.ts` の `core/step/executor-helpers.js` import を `../../core/port/error-helpers.js` に変更

**Acceptance Criteria**:
- `kernel/error-helpers.ts` が `state/schema.js`（shared-kernel）のみに依存
- `core/step/executor-helpers.ts` の `failStepWithError` が正常にコンパイル
- `bun run typecheck` が green

## T-09: step-names — adapter の import を kernel 直参照に張り替え

- [x] `src/adapter/managed-agent/agent-runner.ts` の `core/step/step-names.js` import を `../../kernel/step-names.js` に変更

**Acceptance Criteria**:
- adapter から `core/step/step-names.js` への import が 0 件（grep 確認）
- `bun run typecheck` が green

## T-10: allowlist 削除 — DSM-adapter-domain / DSM-ports-domain エントリを全削除

- [x] `tests/unit/architecture/arch-allowlist.ts` から `tracking` が `DSM-adapter-domain-*` で始まる 12 エントリを削除
- [x] 同ファイルから `tracking` が `DSM-ports-domain-*` で始まる 4 エントリを削除
- [x] セクションコメント（`// ── A) adapters → domain` / `// ── B) ports → domain`）も削除対象であれば削除（`// ── C) domain → composition-root` は残す）

**Acceptance Criteria**:
- `DSM-adapter-domain` / `DSM-ports-domain` を含む行が `arch-allowlist.ts` に 0 件
- allowlist に新エントリが追加されていない（削除のみ）

## T-11: verification — 全テスト green 確認

- [x] `bun run build && bun run typecheck && bun run lint && bun run test` を実行
- [x] DSM closure test が green（実違反が 16 件減少していること）
- [x] liveness guard が維持されていること
- [x] `core-invariants.test.ts` の B-1〜B-9 が無改変で green

**Acceptance Criteria**:
- プロジェクト標準 verification が全 green
- DSM closure test pass（allowlist 16 件削除に対応する実違反解消）
- `core-invariants.test.ts` の既存 describe ブロック（B-1〜B-9）が無改変で green
