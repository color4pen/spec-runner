# Test Cases: operator-commit-adoption

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
- **Automated** (unit/integration): 15
- **Manual**: 0
- **Priority**: must: 13, should: 3, could: 0

---

### TC-001: Unknown committed commit halts before any step executes

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume reconciles the publish range against the ledger before any step runs > Scenario: unknown committed commit halts before any step executes

---

### TC-002: Empty publish range leaves resume behavior unchanged

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume reconciles the publish range against the ledger before any step runs > Scenario: empty publish range leaves resume behavior unchanged

---

### TC-003: Escalation names the commit and offers three fixes

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: flag-less halt presents each unknown commit and the three resolution options > Scenario: escalation names the commit and offers three fixes

---

### TC-004: Adopted OID is recorded in persisted state

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume --adopt-commits records unknown OIDs then launches the pipeline > Scenario: adopted OID is recorded in persisted state

---

### TC-005: Persist failure prevents pipeline launch

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: resume --adopt-commits records unknown OIDs then launches the pipeline > Scenario: persist failure prevents pipeline launch

---

### TC-006: --apply-canon alone still halts on a committed operator commit

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: --apply-canon does not adopt committed operator commits > Scenario: --apply-canon alone still halts on a committed operator commit

---

### TC-007: In-pipeline egress halt message lists the three options

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: egressUnknownCommitError names the three resolution options > Scenario: in-pipeline egress halt message lists the three options

---

### TC-008: detectUnadoptedCommits returns empty array when all publish-range OIDs are in the ledger

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 (TC-U1), tasks.md T-05

**GIVEN** a real tmp git repo with a bare origin, and every commit in the publish range (`git rev-list HEAD --not --remotes=origin`) is already present in the supplied `ledger`
**WHEN** `detectUnadoptedCommits(gitDir, ledger, spawnFn)` is called
**THEN** the function returns an empty array (`[]`)

---

### TC-009: detectUnadoptedCommits returns populated UnadoptedCommit entries for unknown OIDs

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 (TC-U2), tasks.md T-05

**GIVEN** a real tmp git repo with one commit added after the ledger snapshot (the new commit's OID is NOT in the ledger and IS in the publish range)
**WHEN** `detectUnadoptedCommits(gitDir, ledger, spawnFn)` is called with the stale ledger
**THEN** the function returns exactly one `UnadoptedCommit` whose `shortSha`, `subject`, `author`, and `paths` are populated from the commit (not empty/fallback values)

---

### TC-010: detectUnadoptedCommits throws with exit code in message on non-zero git rev-list exit

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02 (TC-U4), tasks.md T-05

**GIVEN** a `spawnFn` mock that resolves with a non-zero exit code (e.g., exit 1) for `git rev-list`
**WHEN** `detectUnadoptedCommits` is called
**THEN** the function throws an `Error` whose message contains the exit code (e.g., the substring `"exit 1"`)

---

### TC-011: Null runStore prevents pipeline launch when --adopt-commits is given

**Category**: integration
**Priority**: must
**Source**: tasks.md T-04, tasks.md T-06 (TC-I4b)

**GIVEN** a job whose worktree has an unknown commit in the publish range
**AND** no `runStore` is available (the store reference is null inside `prepare()`)
**WHEN** `prepare()` is called with `adoptCommits: true`
**THEN** `prepare()` throws `PrepareError(1)` and the pipeline is not launched

---

### TC-012: exit-128 is treated as empty publish range; any other git failure is fail-closed

**Category**: integration
**Priority**: should
**Source**: tasks.md T-06 (TC-I7), design.md D3

**GIVEN** `detectUnadoptedCommits` rejects with an error whose message contains `"exit 128"` (simulating a non-git directory such as a test/dev environment)
**WHEN** `prepare()` is called without `--adopt-commits`
**THEN** `prepare()` resolves and the resume proceeds as if the publish range were empty

**AND** (companion)

**GIVEN** `detectUnadoptedCommits` rejects with an error whose message does NOT contain `"exit 128"`
**WHEN** `prepare()` is called
**THEN** `prepare()` throws `PrepareError(1)` (fail-closed — an unverifiable publish range must not launch a pipeline)

---

### TC-013: --apply-canon and --adopt-commits flags are composable; apply-canon OID is not re-adopted

**Category**: integration
**Priority**: should
**Source**: tasks.md T-06 (TC-I-combined), design.md D4

**GIVEN** a job with dirty protected canon paths AND a separate unknown operator commit in the publish range
**AND** both `applyCanon: true` and `adoptCommits: true` are set
**WHEN** `prepare()` is called
**THEN** the dirty canon paths are committed as an operator-apply commit (apply-canon OID `"apply-oid-abc"` is appended to the ledger)
**AND** `detectUnadoptedCommits` is called with the post-apply-canon ledger that already contains `"apply-oid-abc"` — so it returns only the remaining unknown OID `"operator-oid-xyz"`
**AND** `synthesizedCommits` contains both `"apply-oid-abc"` and `"operator-oid-xyz"` in the persisted state
**AND** `"apply-oid-abc"` appears exactly once in the ledger (not re-adopted)
**AND** `prepare()` resolves and the pipeline launches

---

### TC-014: --adopt-commits CLI flag is parsed and forwarded to runResume

**Category**: unit
**Priority**: should
**Source**: tasks.md T-07

**GIVEN** the CLI receives `job resume <slug> --adopt-commits`
**WHEN** the command is parsed and `runResume` is invoked
**THEN** `runResume` receives `adoptCommits: true`

**AND** (companion)

**GIVEN** the CLI receives `job resume <slug>` without `--adopt-commits`
**WHEN** the command is parsed and `runResume` is invoked
**THEN** `runResume` receives a falsey `adoptCommits` value

**AND** (no-regression)

**GIVEN** the CLI receives `job resume <slug> --adopt-commits --apply-canon --force`
**WHEN** the command is parsed and `runResume` is invoked
**THEN** all three flags (`adoptCommits: true`, `applyCanon: true`, `force: true`) reach `runResume` correctly

---

### TC-015: egressResolutionOptions output contains all three resolution options

**Category**: unit
**Priority**: must
**Source**: tasks.md T-01

**GIVEN** `egressResolutionOptions(slugLabel)` is called with a slug label string
**WHEN** the returned string is inspected
**THEN** it contains the substring `"--adopt-commits"`
**AND** it references pushing the commit(s) to origin
**AND** it references removing or reverting the commit(s) (e.g., `git reset` / `git revert`)
**AND** `egressUnknownCommitError("abc", "b").hint` also embeds all three references (via the shared helper)
**AND** `egressUnknownCommitError` keeps `code === "EGRESS_UNKNOWN_COMMIT"` and the existing detail message unchanged

---

### TC-016: typecheck and test suite pass with no pre-existing test modification

**Category**: gate
**Priority**: must
**Source**: tasks.md T-09

Verification phase: `bun run typecheck` exits 0, then `bun run test` exits 0. No pre-existing test in the resume / egress / apply-canon suites is modified to accommodate the empty-range normal path.

---

## Result

```yaml
result: completed
total: 16
automated: 15
manual: 0
must: 13
should: 3
could: 0
blocked_reasons: []
```
