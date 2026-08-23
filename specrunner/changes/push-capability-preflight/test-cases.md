# Test Cases:

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

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

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 40 cases
- **Automated** (unit/integration): 37
- **Manual**: 0
- **Priority**: must: 28, should: 10, could: 2

---

## Capability Detection (Requirement 1)

### TC-001: Actions with installation token declares the workflows pattern

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall detect an unpushable-path capability constraint from the runtime environment > Scenario: Actions with an installation token declares the workflows pattern

### TC-002: Actions with an explicit PAT in GH_TOKEN declares nothing

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall detect an unpushable-path capability constraint from the runtime environment > Scenario: Actions with an explicit PAT in GH_TOKEN declares nothing

### TC-003: Local run declares nothing

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall detect an unpushable-path capability constraint from the runtime environment > Scenario: Local run declares nothing

### TC-004: Actions with a non-installation token declares nothing

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall detect an unpushable-path capability constraint from the runtime environment > Scenario: Actions with a non-installation token declares nothing

### TC-020: Undefined token input produces no declaration

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria (`token` が undefined → `patterns` は空)

**GIVEN** `GITHUB_ACTIONS` is `"true"`, `GH_TOKEN` is unset, and the resolved token is `undefined`
**WHEN** `detectPushCapability(env, undefined)` is called
**THEN** the returned `PushCapability.patterns` is empty

### TC-021: matchUnpushablePaths with undefined capability returns empty

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria (`matchUnpushablePaths([...], undefined)` が `[]` を返す)

**GIVEN** a list of paths including `.github/workflows/ci.yml`
**WHEN** `matchUnpushablePaths(paths, undefined)` is called
**THEN** the result is `[]` without any git or I/O operation

### TC-022: matchUnpushablePaths with empty-patterns capability returns empty

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria (patterns 空の capability が `[]` を返す)

**GIVEN** a `PushCapability` with `patterns: []`
**And** a list of paths including `.github/workflows/ci.yml`
**WHEN** `matchUnpushablePaths(paths, capability)` is called
**THEN** the result is `[]`

### TC-023: matchUnpushablePaths correctly matches and excludes paths

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria (`matchUnpushablePaths` が `.github/workflows/ci.yml` に一致し `src/foo.ts` に一致しない)

**GIVEN** a `PushCapability` declaring `.github/workflows/**`
**And** paths `[".github/workflows/ci.yml", "src/foo.ts"]`
**WHEN** `matchUnpushablePaths(paths, capability)` is called
**THEN** the result contains `.github/workflows/ci.yml` and does NOT contain `src/foo.ts`

### TC-024: DSM constraint: push-capability.ts imports only node:* and src/util/*

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria (import は `node:*` と `src/util/*` のみ) / design.md > D1

**GIVEN** `src/git/push-capability.ts` is the new shared-kernel module
**WHEN** `tests/unit/architecture/core-invariants.test.ts` runs
**THEN** no import from `src/core/**`, `src/adapter/**`, or other non-leaf layers is detected

---

## Publishable Path Enumeration (Requirement 3)

### TC-008: Worktree changes are included in the publishable path set

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall enumerate the paths a push would publish from the real repository state > Scenario: Worktree changes are included

### TC-009: A reverted unpushed commit path is still included in the publishable path set

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The system shall enumerate the paths a push would publish from the real repository state > Scenario: A path touched by an unpushed commit and reverted later is still included

### TC-010: Already-pushed commits with clean worktree yields empty path set

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: The system shall enumerate the paths a push would publish from the real repository state > Scenario: Already-pushed commits are excluded

### TC-025: Untracked files are included via --untracked-files=all

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria (untracked ファイルが `--untracked-files=all` 経由で含まれる)

**GIVEN** an untracked new file `.github/workflows/new.yml` in the worktree
**And** no unpushed commits and no other worktree modifications
**WHEN** `collectPublishablePaths(spawnFn, cwd)` is called
**THEN** `.github/workflows/new.yml` appears in the returned path set

### TC-026: Rename notation extracts both old and new paths

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-02 Acceptance Criteria (rename 表記から old / new 両方が抽出される)

**GIVEN** `git status --porcelain` output includes `R  old-name.ts -> new-name.ts`
**WHEN** `collectPublishablePaths(spawnFn, cwd)` parses the status output
**THEN** the path set includes both `old-name.ts` and `new-name.ts`

### TC-027: collectPublishablePaths invokes exactly the three expected git command types

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-02 Acceptance Criteria (呼び出される git コマンドが上記の 3 種類のみであることを spawn 呼び出し履歴で確認)

**GIVEN** a worktree with one modified file and one unpushed commit
**WHEN** `collectPublishablePaths(spawnFn, cwd)` runs to completion
**THEN** the spawn call history contains exactly: `git status --porcelain --untracked-files=all`, `git rev-list HEAD --not --remotes=origin`, and `git diff-tree --no-commit-id --name-only -r <oid>`; no other git commands appear

---

## Capability Notice in Agent Context (Requirement 2)

### TC-005: Notice appended for the implementer under a declaring environment

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall notify the capability constraint into agent context without gating on predictions > Scenario: Notice appended for the implementer under a declaring environment

### TC-006: Predicted touchedFiles match produces a warning in the message but no interruption

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall notify the capability constraint into agent context without gating on predictions > Scenario: Predicted touchedFiles match produces a warning but no interruption

### TC-007: No notice under an undeclared environment

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall notify the capability constraint into agent context without gating on predictions > Scenario: No notice under an undeclared environment

### TC-031: Request-review message also receives the capability notice when patterns are declared

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria (request-review のメッセージにも patterns があるときのみ通知が付く)

**GIVEN** `deps.pushCapability` declares `.github/workflows/**`
**WHEN** the request-review step's `buildMessage(state, deps)` is called
**THEN** the returned message contains the declared pattern and the constraint note
**And** the function does not read `process.env` or perform I/O (purity maintained)

---

## StepContext Integration (T-03)

### TC-028: pushCapability is resolved exactly once per run

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria (deps.pushCapability が 1 run につき 1 回だけ解決される)

**GIVEN** a pipeline run spanning multiple steps
**WHEN** the per-run initialization in `runner.ts` completes
**THEN** `detectPushCapability` was called exactly once (spy count = 1)
**And** the resolved value is shared across all steps via `deps.pushCapability`

### TC-029: PushCapability type contains no raw token field

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria (生のトークン文字列が `PushCapability` に含まれない)

**GIVEN** the `PushCapability` type definition in `src/git/push-capability.ts`
**WHEN** TypeScript compiles the module
**THEN** no property named `token` or containing raw credential data exists on `PushCapability`
**And** the only fields are `patterns: string[]` and `source: string`

---

## Output Contract: unpushable-path kind (Requirement 4)

### TC-013: No unpushable-path contract is declared under an undeclared environment

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall send exactly one follow-up to the live implementer session when the real diff matches a declared pattern > Scenario: No contract is declared under an undeclared environment

### TC-030: buildOutputFollowUpPrompt generates a path-listing section for unpushable-path violations

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria (`buildOutputFollowUpPrompt` が `unpushable-path` 違反に対し、一致パスを列挙した専用セクションを出力する)

**GIVEN** an `OutputViolation` of kind `"unpushable-path"` with `detail: [".github/workflows/ci.yml"]`
**WHEN** `buildOutputFollowUpPrompt([violation])` is called
**THEN** the returned string contains `.github/workflows/ci.yml`
**And** the string instructs the agent to either remove the change or satisfy the requirement without modifying that path

---

## Follow-up: exactly one turn (Requirement 4)

### TC-011: Follow-up resolves the violation and the step proceeds to commit/push

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall send exactly one follow-up to the live implementer session when the real diff matches a declared pattern > Scenario: Follow-up resolves the violation and the step proceeds

### TC-012: At most one follow-up is sent even when the violation persists

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall send exactly one follow-up to the live implementer session when the real diff matches a declared pattern > Scenario: At most one follow-up is sent even when the violation persists

---

## ManagedRuntime: skip unpushable-path (T-07)

### TC-019: Managed runtime reports no violation for the unpushable-path contract

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall leave behavior unchanged when no pattern is declared or no path matches > Scenario: Managed runtime reports no violation for the contract

### TC-032: ManagedRuntime with branch=undefined does not produce an unpushable-path violation

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria (`branch` が undefined の状態でも `unpushable-path` の違反が出ない)

**GIVEN** the ManagedRuntime's `validateStepOutputs` receives an `unpushable-path` contract
**And** `branch` is `undefined` (no branch available to managed runtime)
**WHEN** output validation runs
**THEN** the result contains zero violations of kind `"unpushable-path"`
**And** the skip occurs **before** the `!branch` early-return guard for other contract kinds

---

## Follow-up Limit: maxAttempts=1 (T-08)

### TC-033: unpushable-path contract sets maxAttempts to 1

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08 Acceptance Criteria (unpushable-path を含む場合の上限が 1)

**GIVEN** the implementer step has an `unpushable-path` contract in its follow-up contract list
**WHEN** `buildStepContext` / `stepContextBuilder` resolves `outputVerification.maxAttempts`
**THEN** the resolved value is `1`
**And** the repair loop sends at most one follow-up turn for this contract

### TC-034: Contracts without unpushable-path retain the default maxAttempts of 2

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08 Acceptance Criteria (`unpushable-path` を含まない契約集合では `maxAttempts` が従来どおり 2)

**GIVEN** the implementer step has follow-up contracts that do NOT include `unpushable-path`
**WHEN** `buildStepContext` resolves `outputVerification.maxAttempts`
**THEN** the resolved value is `2` (the existing `OUTPUT_FOLLOWUP_MAX_ATTEMPTS` default)

---

## Escalation Halt: awaiting-resume (Requirement 5)

### TC-014: Persisting violation after follow-up halts as awaiting-resume

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall escalate when a declared path remains after the follow-up > Scenario: Persisting violation halts as awaiting-resume

### TC-035: Non-unpushable-path halt violations use the existing STEP_OUTPUT_MISSING failed halt

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09 Acceptance Criteria (`unpushable-path` 以外の halt 違反では従来どおり `STEP_OUTPUT_MISSING` の `failed` halt になる)

**GIVEN** the executor's output gate receives a halt-policy violation of kind `"produced"`
**WHEN** `partitionByPolicy` routes the violation to the halt side
**THEN** the step result has kind `"halt"` and the halt type is `"failed"` with code `STEP_OUTPUT_MISSING`
**And** `makeUnpushablePathHalt` is NOT invoked

### TC-036: Halt reason includes uncommitted worktree note and operator choices

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09 Acceptance Criteria / design.md > D8 (理由文の必須要素)

**GIVEN** `makeUnpushablePathHalt` is called with matching paths `[".github/workflows/ci.yml"]`
**WHEN** the `StepHalt` object is constructed
**THEN** the halt reason text includes a statement that changes remain uncommitted in the worktree
**And** the reason text names at least one operator action (e.g. revising the requirement, providing a PAT with workflows permission, or applying the change manually)

---

## Layer 2 Deterministic Backstop (Requirement 6)

### TC-015: Push is never attempted for a matching path

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall block the push deterministically before commit when a declared path would be published > Scenario: Push is never attempted for a matching path

### TC-016: The rejection reason names the path and the environment constraint

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall block the push deterministically before commit when a declared path would be published > Scenario: The rejection reason names the path and the constraint

### TC-037: Layer 2 backstop raises an error with code UNPUSHABLE_PATH_BLOCKED

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-10 Acceptance Criteria (throw されたエラーの `code` が `UNPUSHABLE_PATH_BLOCKED`)

**GIVEN** `commitAndPush` runs with `deps.pushCapability` declaring `.github/workflows/**`
**And** `collectPublishablePaths` returns `[".github/workflows/ci.yml"]`
**WHEN** the Layer 2 backstop check executes inside `commitAndPush`
**THEN** an error is thrown whose `.code` property equals `"UNPUSHABLE_PATH_BLOCKED"`
**And** the error message contains `.github/workflows/ci.yml` and the environment constraint

> Note: TC-015 verifies no push/commit git commands are invoked; TC-037 verifies the specific error code used to route the failure to `makeUnpushablePathHalt`.

---

## Unchanged Behavior (Requirement 7)

### TC-017: No capability git commands execute in an undeclared environment

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall leave behavior unchanged when no pattern is declared or no path matches > Scenario: No capability git commands in an undeclared environment

### TC-018: Declared patterns with a non-matching diff allow commit and push to proceed normally

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The system shall leave behavior unchanged when no pattern is declared or no path matches > Scenario: Declared patterns with a non-matching diff proceed normally

---

## Gate Tests

### TC-038: typecheck passes with no errors

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-11 Acceptance Criteria (`npm run typecheck` がエラー 0 で終了する)

Verification: `npm run typecheck` exits with code 0. No new TypeScript errors are introduced by the new module `src/git/push-capability.ts`, the `StepContext.pushCapability?` field, the new `OutputContractKind` variant `"unpushable-path"`, or any other change.

### TC-039: No .github/workflows/** files are modified by this change

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-11 Acceptance Criteria (`git diff --name-only` の結果に `.github/` 配下のファイルが 1 件も含まれない) / request.md 実装範囲 1

Verification: `git diff --name-only origin/main...HEAD` contains no path matching `.github/**`. This confirms the implementation is self-hostable under Actions GITHUB_TOKEN without triggering the chicken-and-egg push rejection.

### TC-040: All existing tests pass without modification to their source files

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-11 Acceptance Criteria (既存テストファイルへの変更が 0 件 / `npm test` が全件 green)

Verification: `npm test` exits with code 0. No existing test file is modified (only new test files are added). In particular, `tests/unit/architecture/core-invariants.test.ts`, `tests/unit/step/output-verify.test.ts`, `tests/unit/step/executor-output-gate.test.ts`, `tests/unit/step/commit-and-push.test.ts`, and `tests/unit/step/pipeline-sole-committer-*.test.ts` remain green without changes.

---

## Result

```yaml
result: completed
total: 40
automated: 37
manual: 0
must: 28
should: 10
could: 2
blocked_reasons: []
```
