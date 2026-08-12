# Test Cases: liveness 生存判定の sidecar pid 採用に jobId 照合を追加する

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
  生成時に一度だけ書かれ、後続ステップ（test-materialize を含む）は更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 16 cases
- **Automated** (unit/integration): 14
- **Manual**: 0
- **Priority**: must: 15, should: 1, could: 0

---

### TC-001: isStaleRunning — jobId 一致の sidecar pid を持つプロセスが生存中

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: isStaleRunning は jobId 一致の sidecar pid のみ生存証拠として採用する > Scenario: jobId 一致の sidecar pid を持つプロセスが生存中

---

### TC-002: isStaleRunning — jobId 不一致の sidecar pid

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: isStaleRunning は jobId 一致の sidecar pid のみ生存証拠として採用する > Scenario: jobId 不一致の sidecar pid

---

### TC-003: isStaleRunning — sidecar に jobId フィールドが存在しない（legacy sidecar）

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: isStaleRunning は jobId 一致の sidecar pid のみ生存証拠として採用する > Scenario: sidecar に jobId フィールドが存在しない（legacy sidecar）

---

### TC-004: job wait — jobId 一致の sidecar pid でプロセス生存中

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: job wait の sidecar pid 採用も jobId 照合を要求する > Scenario: jobId 一致の sidecar pid でプロセス生存中

---

### TC-005: job wait — jobId 不一致の sidecar pid

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: job wait の sidecar pid 採用も jobId 照合を要求する > Scenario: jobId 不一致の sidecar pid

---

### TC-006: job wait — jobId フィールドなしの sidecar（legacy）

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: job wait の sidecar pid 採用も jobId 照合を要求する > Scenario: jobId フィールドなしの sidecar（legacy）

---

### TC-007: isStaleRunning が resolveJobPid を経由して jobId 照合を行う

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: sidecar pid 採用判定を resolveJobPid に集約する > Scenario: isStaleRunning が resolveJobPid を経由して jobId 照合を行う

---

### TC-008: job wait poll ループが resolveJobPid を経由して jobId 照合を行う

**Category**: unit  
**Priority**: must  
**Source**: spec.md > Requirement: sidecar pid 採用判定を resolveJobPid に集約する > Scenario: job wait poll ループが resolveJobPid を経由して jobId 照合を行う

---

### TC-009: isStaleRunning — jobId 一致の sidecar pid かつプロセス死亡

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-03 > TC-S02

**GIVEN** `state.status === "running"`, `state.pid` が null, sidecar に `{ pid: 1234, jobId: "job-A" }` が存在し、プロセス 1234 が死亡している  
**WHEN** `isStaleRunning(state, sidecarPath)` を呼ぶ（`state.jobId === "job-A"`）  
**THEN** `true` を返す（stale）

---

### TC-010: isStaleRunning — sidecar に pid フィールドが存在しない

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-03 > TC-S05

**GIVEN** `state.status === "running"`, `state.pid` が null, sidecar に `{ jobId: "job-A" }` のみ存在する（`pid` フィールドなし）  
**WHEN** `isStaleRunning(state, sidecarPath)` を呼ぶ（`state.jobId === "job-A"`）  
**THEN** `true` を返す（stale）

---

### TC-011: isStaleRunning — sidecar ファイル不在

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-03 > TC-S06

**GIVEN** `state.status === "running"`, `state.pid` が null, sidecar ファイルが存在しない  
**WHEN** `isStaleRunning(state, sidecarPath)` を呼ぶ  
**THEN** `true` を返す（stale）

---

### TC-012: isStaleRunning — state.pid 存在時は Priority 1 が sidecar より優先される

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-03 > TC-S07

**GIVEN** `state.status === "running"`, `state.pid === 4567`（非 null）, sidecar に jobId 不一致の `{ pid: 9999, jobId: "job-B" }` が存在  
**WHEN** `isStaleRunning(state, sidecarPath)` を呼ぶ  
**THEN** `state.pid`（4567）のみで生存 probe を行い、sidecar の pid 9999 は採用されない

---

### TC-013: realReadSidecarPid — SidecarContent 形式（{ pid, jobId }）を返す

**Category**: unit  
**Priority**: must  
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** sidecar ファイルに `{ pid: 54321, jobId: "job-abc-0001", session: "s1", worktreePath: "/tmp/x" }` が存在する  
**WHEN** `realReadSidecarPid(sidecarAbsPath)` を呼ぶ  
**THEN** `{ pid: 54321, jobId: "job-abc-0001" }` を含む `SidecarContent` を返す（`number` を直接返さない）

---

### TC-014: typecheck が pass する

**Category**: gate  
**Priority**: must  
**Source**: tasks.md > T-05

`bun run typecheck`（verification phase: typecheck）で exit code 0 が返ること。

---

### TC-015: 全テストが green となる

**Category**: gate  
**Priority**: must  
**Source**: tasks.md > T-05

`bun run test`（verification phase: test）で exit code 0 が返ること（既存テスト含む全テスト green）。

---

### TC-016: isStaleRunning — state.jobId が undefined の場合は stale 側に倒れる

**Category**: unit  
**Priority**: should  
**Source**: design.md > Risks / Trade-offs

**GIVEN** `state.status === "running"`, `state.pid` が null, `state.jobId` が `undefined`（旧 state schema）, sidecar に `{ pid: 9999, jobId: "job-A" }` が存在  
**WHEN** `isStaleRunning(state, sidecarPath)` を呼ぶ  
**THEN** `true` を返す（stale）。`undefined === "job-A"` は false となり sidecar pid を採用しない。安全な方向に倒れる。

---

## Result
```yaml
result: completed
total: 16
automated: 14
manual: 0
must: 15
should: 1
could: 0
blocked_reasons: []
```
