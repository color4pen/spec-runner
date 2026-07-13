# Spec:

<!-- SPEC WRITING GUIDANCE

This file is the self-contained spec for this change.
Write Layer-1 behaviors — choices the structure/types/FSM do not enforce automatically.

════════════════════════════════════════════════════════
REQUIREMENT FORMAT
════════════════════════════════════════════════════════

### Requirement: <name>

Each requirement describes a behavior this change introduces or modifies.
The body MUST contain a normative keyword: SHALL or MUST (English).

At least one Scenario per Requirement (Given/When/Then format):

#### Scenario: <name>

**Given** <preconditions>
**When** <action>
**Then** <expected result>

════════════════════════════════════════════════════════
EXAMPLE
════════════════════════════════════════════════════════

## Requirements

### Requirement: The system shall place spec.md before the design step

The system SHALL place a spec.md scaffold in the change folder before the design
agent runs, so the agent has a pre-structured output destination.

#### Scenario: spec.md exists before design agent starts

**Given** the pipeline is about to execute the design step
**When** the executor calls writeOutputTemplates for the design step
**Then** spec.md exists in the change folder at specrunner/changes/<slug>/spec.md

-->

## Requirements

### Requirement: 構造抽出後も挙動は変化しない

本 change は純粋な構造抽出である。`StepExecutor` の外部から観測可能な振る舞いは変化してはならない。

The executor MUST produce identical observable behavior before and after this refactoring: verdict values, `JobState` contents, history entry order, and Git diff output SHALL be equivalent.

#### Scenario: agent step が成功する場合

**Given** agent step が成功（`completionReason: "success"`）で完了する
**When** `StepExecutor.execute()` を呼び出す
**Then** 返却される `JobState` の `steps[stepName]` 末尾エントリの `verdict` が、リファクタリング前と同じ値である

#### Scenario: agent step が timeout する場合

**Given** `AgentRunResult.completionReason === "timeout"`
**When** `StepExecutor.execute()` を呼び出す
**Then** `JobState.status` が `"awaiting-resume"` になり、`resumePoint.reason` が `"timeout"` であり、`attachStateAndRethrow` が呼ばれる（リファクタリング前と同じ経路）

#### Scenario: main-checkout drift が検出される場合

**Given** `guardBefore` / `guardAfter` の差分が `drifted: true`
**When** `StepExecutor.execute()` を呼び出す
**Then** `JobState.status` が `"awaiting-resume"` になり、`mainCheckoutDrift` フィールドが設定され、`MAIN_CHECKOUT_WRITE_DETECTED` コードで `attachStateAndRethrow` が呼ばれる

### Requirement: `StepHalt` は値として定義され、適用は executor 内に留まる

各 failure guard は `StepHalt` を**構築**する。構築した halt 値の適用（persist / transition / rethrow）は `StepExecutor` 内で行われ、factory 関数が副作用を起こしてはならない。

Each `StepHalt` factory function SHALL return a value and MUST NOT call `store.persist`, `store.fail`, `transitionJob`, or `attachStateAndRethrow`.

#### Scenario: factory 関数を呼び出す

**Given** 任意の `makeXxxHalt(...)` factory 関数
**When** 引数を渡して呼び出す
**Then** `StepHalt` 型の値が返るのみであり、`store.persist` / `store.fail` / `transitionJob` 等の副作用は発生しない

### Requirement: `buildStepContext` は `AgentRunContext` を返し副作用を持たない

`buildStepContext` は `AgentRunContext` を組み立てて返す。state を書き換えず、`store.fail` / `store.persist` / `attachStateAndRethrow` を呼ばない。

`buildStepContext` SHALL return a complete `AgentRunContext` and MUST NOT mutate `state` or invoke any store write operations.

#### Scenario: `buildStepContext` を呼び出す

**Given** 有効な `step`, `state`, `deps`, `cwd`, `emitFn` 引数
**When** `buildStepContext` を呼び出す
**Then** 完全な `AgentRunContext` が返る。呼び出し後も `state` の内容は変わらない。例外を投げない（I/O エラーを除く）

