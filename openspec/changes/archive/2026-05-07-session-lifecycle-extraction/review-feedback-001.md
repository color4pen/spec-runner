# Code Review Feedback: session-lifecycle-extraction (iter 1)

## Summary

RuntimeStrategy + CommandRunner の設計は仕様通り実装されている。`config.runtime` 分岐は `createRuntime` ファクトリ 1 箇所に集約され、`run.ts`（46行）/ `resume.ts`（47行）は目標の 50 行以下を達成。全 1048 テスト pass、typecheck green。コード品質は全体的に高く、CRITICAL/HIGH の指摘はない。

- **verdict**: approved

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 8 | 0.25 | 2.00 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.05** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | src/core/types.ts:53 | `runner?: AgentRunner` が optional のため、`pipeline/run.ts:33` と `:103` で null 合体 + IIFE throw のフォールバックが必要になっている。`buildDeps()` が常に runner を注入する設計なので `runner` は required にすべき。optional のままだと型安全性が弱く、将来 `buildDeps()` を経由しない構築パスが生まれたとき runtime error になる | `PipelineDeps.runner` を required (`runner: AgentRunner`) に変更し、既存テストの mock deps にも `runner` を必須で追加する。pipeline/run.ts のフォールバック IIFE を削除する |
| 2 | MEDIUM | maintainability | src/cli/resume.ts:20-36, src/core/command/resume.ts:7,171 | `loadConfig()` が `resume.ts` (L22) と `ResumeCommand.prepare()` (L171) の 2 箇所で呼ばれる。implementation-notes #3 で認識済みだが、`resume.ts` で load した config を `ResumeCommand` のコンストラクタに渡す設計にすれば 1 回で済む | `ResumeCommand` のコンストラクタに `config: SpecRunnerConfig` を追加し、`resume.ts` が `loadConfig()` → `createRuntime(config, ...)` → `new ResumeCommand(runtime, slug, config, options)` とする。prepare() 内の `loadConfig()` を削除 |
| 3 | MEDIUM | architecture | src/core/command/resume.ts:50-60 | `ResumeCommand.execute()` が `super.execute()` を override して `PrepareError` を catch している。Template Method の `execute()` を override 不可にする設計方針（design D5: "prepare() 以外は override 不可"）と矛盾する。`CommandRunner.execute()` 自体が prepare() の throw を catch して exit code を返す仕組みにすべき | `CommandRunner.execute()` で prepare() の throw を catch し、`PrepareError` ならその exitCode を返す汎用ハンドリングを追加。`ResumeCommand` の execute() override を削除 |
| 4 | LOW | maintainability | src/core/runtime/local.ts:211 | signal handler 内で `process.exit(130)` を直接呼んでいる。テストでは signal handler の登録/解除のみ検証しているが、process.exit の直接呼び出しはテスタビリティを下げる | `process.exit` を constructor で DI 可能にする（`exitFn?: (code: number) => never`）。ただし refactoring scope を考慮し、次の request で対応でも可 |
| 5 | LOW | testing | tests/unit/core/command/runner.test.ts | `PipelineRunCommand` と `ResumeCommand` の unit test がない（`runner.test.ts` は `CommandRunner` 抽象クラスのみ）。prepare() のロジック（slug 導出、safety gate、status transition）が直接テストされていない | `pipeline-run.test.ts` と `resume-command.test.ts` を追加し、prepare() の各分岐をテストする |
| 6 | LOW | maintainability | src/core/runtime/local.ts:22-38 | `makeHandle` / `getInternals` の `as unknown as` ダブルキャストは branded type の制約を完全にバイパスしている。安全ではあるが、`CleanupHandle` を `symbol` ベースの WeakMap lookup にするとより型安全 | `WeakMap<CleanupHandle, LocalCleanupInternals>` を使い、makeHandle で登録、getInternals で lookup する。ただし現状でも動作に問題はない |

## Acceptance Criteria Check

| Criterion | Status | Evidence |
|-----------|--------|----------|
| `config.runtime` if/else が factory の 1 箇所のみ | PASS | `src/core/runtime/factory.ts:31` のみ。`rm.ts` / `rm/runner.ts` はスコープ外 |
| `RuntimeStrategy.query()` プリミティブあり | PASS | `strategy.ts:77` に定義。placeholder 実装だが interface contract は満たす |
| `run.ts` 50 行以下 | PASS | 46 行 |
| `resume.ts` 50 行以下 | PASS | 47 行 |
| `LocalRuntime` が worktree lifecycle を一元管理 | PASS | `setupWorkspace` + `registerCleanup` + `teardown` |
| `ManagedRuntime` が worktree 処理を含まない | PASS | 全 workspace/cleanup が no-op |
| pipeline/run.ts の runtime 分岐解消 | PASS | `deps.runner` 経由。`config.runtime` 参照なし |
| `CleanupHandle` が opaque | PASS | branded type。CommandRunner は内部にアクセスしない |
| 振る舞い不変（既存テスト pass） | PASS | 118 files, 1048 tests passed |
| `bun run typecheck && bun run test` green | PASS | 確認済み |

## Test Coverage (Scenario Coverage)

| Test Case | Status | File |
|-----------|--------|------|
| TC-LR-001: setupWorkspace(run) | covered | local.test.ts |
| TC-LR-002: setupWorkspace(resume/reuse) | covered | local.test.ts |
| TC-LR-003: setupWorkspace(resume/recreate) | covered | local.test.ts |
| TC-LR-004: setupWorkspace(resume/null) | covered | local.test.ts |
| TC-LR-005: registerCleanup/teardown signal | covered | local.test.ts |
| TC-LR-006: teardown cleanup on failure | covered | local.test.ts |
| TC-LR-007: buildDeps | covered | local.test.ts |
| TC-MR-001 ~ TC-MR-004 | covered | managed.test.ts |
| TC-RT-001 ~ TC-RT-003 | covered | factory.test.ts |
| TC-CR-001 ~ TC-CR-005 | covered | runner.test.ts |
| PipelineRunCommand.prepare() | NOT covered | finding #5 |
| ResumeCommand.prepare() | NOT covered | finding #5 |
