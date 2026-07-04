# Test Cases: reject-duplicate-slug-run

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
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
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 20 cases
- **Automated** (unit/integration): 17
- **Manual**: 3
- **Priority**: must: 17, should: 3, could: 0

---

## Guard Behavior – pure helper (`checkDuplicateLiveJob`)

### TC-001: live pid → DUPLICATE_LIVE_JOB throw

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: live な先行 job があるとき同一 slug の run を拒否する > Scenario: slug S に live な先行 job がある

---

### TC-002: dead pid → 許容（通常起動）

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: stale / 不在時は通常起動する > Scenario: liveness.json が stale（pid が dead）

---

### TC-003: sidecar 不在 → 許容

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: stale / 不在時は通常起動する > Scenario: liveness.json が不在

---

### TC-004: JSON 破損 → 許容

**Category**: unit  
**Priority**: must  
**Source**: design.md § D4 / tasks.md § T-07 TC-04

**GIVEN** `readFile` が JSON として不正な文字列 `"{ not json"` を返す  
**WHEN** `checkDuplicateLiveJob(repoRoot, "S", deps)` を呼ぶ  
**THEN** throw せず resolve する  
**THEN** `isAlive` は呼ばれない

---

### TC-005: pid フィールドが number でない → 許容

**Category**: unit  
**Priority**: must  
**Source**: design.md § D4 / tasks.md § T-07 TC-05

**GIVEN** `readFile` が `{"jobId":"job-A"}` を返す（`pid` フィールドなし）、`isAlive: () => true`  
**WHEN** `checkDuplicateLiveJob(repoRoot, "S", deps)` を呼ぶ  
**THEN** throw せず resolve する（`typeof pid !== "number"` で live 判定に進まない）

---

### TC-006: live pid・jobId 欠如 → 拒否（null 経路）

**Category**: unit  
**Priority**: should  
**Source**: design.md § D5 / tasks.md § T-07 TC-06

**GIVEN** `readFile` が `{"pid":4242}` を返す（`jobId` フィールドなし）、`isAlive: () => true`  
**WHEN** `checkDuplicateLiveJob(repoRoot, "S", deps)` を呼ぶ  
**THEN** `DUPLICATE_LIVE_JOB` の `SpecRunnerError` が throw される  
**THEN** error の `hint` に `specrunner job list` の案内が含まれる

---

## Error Content

### TC-007: 拒否エラーに先行 jobId と対処手段が含まれる

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: 拒否エラーは先行 jobId と対処手段を含む > Scenario: 拒否エラーの内容

---

### TC-008: duplicateLiveJobError factory – code / exitCode 検証

**Category**: unit  
**Priority**: must  
**Source**: tasks.md § T-01 AC

**GIVEN** `duplicateLiveJobError("foo", "abcd1234")` を呼ぶ  
**WHEN** 返り値を検査する  
**THEN** `code === "DUPLICATE_LIVE_JOB"`  
**THEN** `exitCode === 2`（`EXIT_CODE.ARG_ERROR` に対応）  
**THEN** `message` に slug `"foo"` と先行 jobId `"abcd1234"` が含まれる  
**THEN** `hint` に `specrunner job cancel abcd1234` と完了待ち（wait / re-running）の対処が含まれる

---

### TC-009: priorJobId=null 時の hint に job list 案内が含まれる

**Category**: unit  
**Priority**: should  
**Source**: design.md § D5 / tasks.md § T-01

**GIVEN** `duplicateLiveJobError("foo", null)` を呼ぶ  
**WHEN** 返り値を検査する  
**THEN** `hint` に `specrunner job list` の案内が含まれる  
**THEN** `hint` に cancel するか完了を待つ旨が含まれる  
**THEN** `code === "DUPLICATE_LIVE_JOB"`、`exitCode === 2`

---

## Call-site Integration (pipeline-run.ts)

### TC-010: ガード throw → prepare() reject / bootstrapJob 未呼び出し

**Category**: integration  
**Priority**: must  
**Source**: tasks.md § T-08 TC-GUARD-01

**GIVEN** fake runtime の `assertNoDuplicateLiveJob` が `duplicateLiveJobError("test-slug", "job-A")` を throw する  
**WHEN** `PipelineRunCommand` の `prepare()` 相当を呼ぶ  
**THEN** `prepare()` が `DUPLICATE_LIVE_JOB` エラーで reject する  
**THEN** `runtime.bootstrapJob` が一切呼ばれていない（job state 未生成）

---

### TC-011: ガード resolve → bootstrapJob 呼び出し

**Category**: integration  
**Priority**: must  
**Source**: tasks.md § T-08 TC-GUARD-02

**GIVEN** fake runtime の `assertNoDuplicateLiveJob` が resolve する  
**WHEN** `PipelineRunCommand` の `prepare()` 相当を呼ぶ  
**THEN** `prepare()` が成功し `runtime.bootstrapJob` が 1 回呼ばれる

---

### TC-012: 既存 gate test fake（本メソッド未実装）が green

**Category**: integration  
**Priority**: must  
**Source**: tasks.md § T-08 AC

**GIVEN** `pipeline-run-gate.test.ts` の既存 fake runtime（`assertNoDuplicateLiveJob` を実装しない）  
**WHEN** 既存テストをそのまま実行する  
**THEN** 全テストが green（`?.` optional-call によりガード呼び出しがスキップされる）

---

## LocalRuntime Wiring (real fs)

### TC-013: LocalRuntime 実配線 – live pid → 拒否

**Category**: integration  
**Priority**: must  
**Source**: tasks.md § T-09 TC-LR-01

**GIVEN** temp dir を `repoRoot` として `.specrunner/local/<slug>/liveness.json` に `{"pid": <process.pid>, "jobId":"job-A", "worktreePath":"/wt", "session":null}` を書く（`process.pid` は必ず生存）  
**WHEN** `LocalRuntime.assertNoDuplicateLiveJob(repoRoot, slug)` を呼ぶ  
**THEN** `DUPLICATE_LIVE_JOB` が throw され、`job-A` がエラーに含まれる

---

### TC-014: LocalRuntime 実配線 – sidecar 不在 → 許容

**Category**: integration  
**Priority**: must  
**Source**: tasks.md § T-09 TC-LR-02

**GIVEN** temp dir を `repoRoot` として `.specrunner/local/<slug>/liveness.json` が存在しない  
**WHEN** `LocalRuntime.assertNoDuplicateLiveJob(repoRoot, slug)` を呼ぶ  
**THEN** throw せず resolve する

---

## Managed Runtime (no-op)

### TC-015: managed runtime では duplicate-live-job ガードが発火しない

**Category**: integration  
**Priority**: must  
**Source**: spec.md > Requirement: managed runtime はガード対象外（no-op） > Scenario: managed runtime では発火しない

---

## Type System (compile-time)

### TC-016: RuntimeStrategy 型 fake（本メソッド未実装）がコンパイル通過

**Category**: manual  
**Priority**: must  
**Source**: tasks.md § T-03 AC

**GIVEN** `RuntimeStrategy` として型付けされたテスト fake オブジェクト（`assertNoDuplicateLiveJob` を実装しない）  
**WHEN** `bun run typecheck` を実行する  
**THEN** コンパイルエラーなし（optional メソッドのため未実装でも型安全）

---

### TC-017: RealRuntimeStrategy 実装クラスでメソッド欠如 → コンパイルエラー

**Category**: manual  
**Priority**: must  
**Source**: tasks.md § T-03 AC

**GIVEN** `RealRuntimeStrategy` を満たすと宣言したクラスで `assertNoDuplicateLiveJob` を実装しない  
**WHEN** `bun run typecheck` を実行する  
**THEN** コンパイルエラーが発生する（required-on-`RealRuntimeStrategy` により型違反を検出）

---

### TC-018: 実 runtime 2 クラスに seam 実装済み

**Category**: manual  
**Priority**: must  
**Source**: tasks.md § T-10

**GIVEN** `src/` を対象に `grep -rn "implements RealRuntimeStrategy"` を実行する  
**WHEN** 結果を確認する  
**THEN** `LocalRuntime` と `ManagedRuntime` の 2 クラスのみがヒットする  
**THEN** どちらも `assertNoDuplicateLiveJob` を実装している

---

## Regression

### TC-019: pid 生存判定の一貫性（isProcessAlive 再利用）

**Category**: unit  
**Priority**: should  
**Source**: spec.md > Requirement: 生存判定は既存 isProcessAlive を再利用する > Scenario: pid 生存判定の一貫性

---

### TC-020: 既存 cancel / resume / inbox テスト無変更 green

**Category**: integration  
**Priority**: must  
**Source**: tasks.md § T-10 AC / request.md § 受け入れ基準

**GIVEN** cancel / resume / inbox に関連する既存テストファイルを無変更のまま  
**WHEN** `bun run test` を実行する  
**THEN** 既存テストが全て green（optional port + `?.` 呼び出しにより既存 fake が壊れない）

---

## Result

```yaml
result: completed
total: 20
automated: 17
manual: 3
must: 17
should: 3
could: 0
blocked_reasons: []
```
