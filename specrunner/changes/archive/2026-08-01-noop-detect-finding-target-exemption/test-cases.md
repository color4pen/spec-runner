# Test Cases:

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
- **Manual**: 2
- **Priority**: must: 12, should: 4, could: 0

---

## Spec Scenario 由来 TC（GWT 省略）

### TC-001: finding が change folder doc を名指しし fixer がその doc のみを修正した（#927 実例）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: no-op 検知は finding が名指しした path への変更を仕事として数える > Scenario: finding が change folder doc を名指しし fixer がその doc のみを修正した（#927 実例）

---

### TC-002: finding が名指ししない change folder ファイルのみの変更（従来どおり no-op）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: no-op 検知は finding が名指しした path への変更を仕事として数える > Scenario: finding が名指ししない change folder ファイルのみの変更（従来どおり no-op）

---

### TC-003: finding がソースを名指しし変更もソースのみの通常ケース（免除の影響なし）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: no-op 検知は finding が名指しした path への変更を仕事として数える > Scenario: finding がソースを名指しし変更もソースのみの通常ケース（免除の影響なし）

---

### TC-004: finding が state.json を名指しても needs-fix（pipelineManagedPaths 上限）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: pipelineManagedPaths は finding が名指ししても仕事に数えない > Scenario: finding が state.json を名指しても needs-fix

---

### TC-005: 導出は active reviewer の finding を含む

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: 免除集合は「当該 fixer run に routing された findings」から機械的に導出される > Scenario: 導出は active reviewer の finding を含む

---

### TC-006: 非 code-fixer step では免除集合が空

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 免除集合は「当該 fixer run に routing された findings」から機械的に導出される > Scenario: 非 code-fixer step では免除集合が空

---

### TC-007: artifact のみの変更で finding が名指ししない（#734 escalate 維持）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の no-op 挙動を保存する > Scenario: artifact のみの変更で finding が名指ししない（#734 escalate 維持）

---

### TC-008: approved findings-routing no-op は従来どおり抑止される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 既存の no-op 挙動を保存する > Scenario: approved findings-routing no-op は従来どおり抑止される

---

## 非 Scenario 由来 TC（GWT 付き）

### TC-009: collectRoutedFixerFindings — conformance 分岐（branch 1）で implementation-notes.md が免除される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04（conformance 分岐シナリオ）

**GIVEN** code-review が `approved`（fixable finding あり）で、conformance が `needs-fix:code-fixer` で実行済み（endedAt が code-review より後）、conformance の finding が `specrunner/changes/example/implementation-notes.md` を名指しし、`listChangedFiles` が `["specrunner/changes/example/implementation-notes.md"]` のみを返す

**WHEN** StepExecutor が code-fixer step（`noOpDetect: true`）を実行する

**THEN** `collectRoutedFixerFindings` が branch 1（conformance）を通り、記録 verdict が `approved`（no-op 発火せず、override なし）

---

### TC-010: collectRoutedFixerFindings — coordinator-loop 分岐（branch 2）で implementation-notes.md が免除される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04（coordinator-loop 分岐シナリオ）

**GIVEN** custom reviewer が 1 件登録され、`custom-reviewers` ステップに `needs-fix` verdict run があり、当該 custom reviewer ステップの finding が `specrunner/changes/example/implementation-notes.md` を名指しし、conformance 未起動・regression-gate 未起動で、`listChangedFiles` が `["specrunner/changes/example/implementation-notes.md"]` のみを返す

**WHEN** StepExecutor が code-fixer step（`noOpDetect: true`）を実行する

**THEN** `collectRoutedFixerFindings` が branch 2（coordinator-loop）を通り、記録 verdict が `approved`（no-op 発火せず、override なし）

---

### TC-011: detectNoOp — findingTargetPaths / pipelineManagedPaths 両 param 省略時は従来と同一 verdict

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02（Acceptance Criteria）/ design.md > D2

**GIVEN** `detectNoOp` を `findingTargetPaths` と `pipelineManagedPaths` をいずれも指定せず呼び出す（省略 = exempt 集合が空）

**WHEN** `changedFiles` が artifact prefix 配下のみ（例: `["specrunner/changes/example/state.json"]`）で `findingsRoutingApproved` が `false`

**THEN** `detectNoOp` は `"needs-fix"` を返す（param 導入前と完全一致。exempt=∅ により既存挙動が保存されている）

---

### TC-012: executor — noOpDetect !== true の step では collectRoutedFixerFindings を呼ばない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03（Acceptance Criteria）

**GIVEN** `noOpDetect` が `false`（または `undefined`）の AgentStep と、active reviewer の finding が存在する state

**WHEN** StepExecutor が当該 step を実行する

**THEN** `collectRoutedFixerFindings` は呼び出されず（routing 導出をスキップ）、`listChangedFiles` も呼ばれず、verdict は `approved` のまま（non-code-fixer step への副作用がない）

---

### TC-013: code-fixer.buildMessage / reads の出力が isCoordinatorLoopActive / getNeedsFixMembers 移設後も不変

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-01（Acceptance Criteria）/ design.md > D1

**GIVEN** `code-fixer.ts` が `isCoordinatorLoopActive` / `getNeedsFixMembers` のローカル定義を `routed-findings.ts` から import する形に変更されている

**WHEN** 既存の code-fixer 関連テスト（`fixer-reviewer.test.ts` / `custom-reviewer-step.test.ts` 等）を実行する

**THEN** buildMessage の prose・findingsPath・verdict・reads に用いる result file のいずれも変更されておらず、全テストが green（移設による挙動後退なし）

---

### TC-014: ARTIFACT_PREFIXES / pipelineManagedPaths の定義に変更がない

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-05（Acceptance Criteria）

**GIVEN** 本変更の実装が適用されている

**WHEN** `src/core/step/no-op-detect.ts` の `ARTIFACT_PREFIXES` と `src/core/pipeline/round-git-scope.ts` の `pipelineManagedPaths` 列挙を確認する

**THEN** `ARTIFACT_PREFIXES = ["specrunner/changes/", ".specrunner/"]` の定義が変更されておらず（縮小・置換なし）、`pipelineManagedPaths` の個別列挙（state.json / events.jsonl / usage.json / bite-evidence-result.md / pr-create-result.md）が不変である（point 免除であり prefix 縮小ではないことを確認）

---

### TC-015: bun run typecheck が green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05（Acceptance Criteria）

**GIVEN** T-01〜T-04 の全実装が適用されている

**WHEN** `bun run typecheck` を実行する

**THEN** TypeScript の型エラーがゼロで完了する

---

### TC-016: bun run test — 既存テスト全ケースが無変更で green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05（Acceptance Criteria）/ tasks.md > T-04（既存 6 ケースは無変更）

**GIVEN** T-01〜T-04 の全実装が適用されており、`executor-no-op.test.ts` の既存 6 ケース（no source / artifact only / source changed / noOpDetect false / undefined / runtimeStrategy 無し）および Req 1-4 の 4 ケースが無変更のまま存在する

**WHEN** `bun run test` を実行する

**THEN** 新規追加した 6 シナリオ（TC-001〜TC-004 相当の active-reviewer 4 件 + TC-009 conformance 1 件 + TC-010 coordinator-loop 1 件）を含む全テストが green で完了し、既存テストに後退がない

---

## Result

```yaml
result: completed
total: 16
automated: 14
manual: 2
must: 12
should: 4
could: 0
blocked_reasons: []
```
