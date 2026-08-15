# Test Cases: test-materialize step の廃止 — テスト実体化を implementer に統合する

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

- **Total**: 19 cases
- **Automated** (unit/integration): 17
- **Manual**: 0
- **Priority**: must: 18, should: 1, could: 0

---

### TC-001: 非免除 type は spec-review 承認から implementer へ直行する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-phase 承認は全 type で implementer へ収束する > Scenario: 非免除 type は spec-review 承認から implementer へ直行する

---

### TC-002: 免除 type も spec-review 承認から implementer へ直行する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-phase 承認は全 type で implementer へ収束する > Scenario: 免除 type も spec-review 承認から implementer へ直行する

---

### TC-003: 遷移表に test-materialize 行が存在しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-phase 承認は全 type で implementer へ収束する > Scenario: 遷移表に test-materialize 行が存在しない

---

### TC-004: spec-fixer の観測 auto-fix は implementer へ forward する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: spec-phase 承認は全 type で implementer へ収束する > Scenario: spec-fixer の観測 auto-fix は implementer へ forward する

---

### TC-005: implementer prompt が全 must TC の実体化責務を明示する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: implementer は test-cases.md を正典としてテストと実装を一体で行う > Scenario: implementer prompt が全 must TC の実体化責務を明示する

---

### TC-006: implementer message は test-materialize 実行歴に依存しない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: implementer は test-cases.md を正典としてテストと実装を一体で行う > Scenario: implementer message は test-materialize 実行歴に依存しない

---

### TC-007: gate は test-materialize run 無しで red→green 判定に到達する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: materialized test file の同定は Evidence Base 参照と candidate の diff で行う > Scenario: gate は test-materialize run 無しで red→green 判定に到達する

---

### TC-008: archive floor は baseOid 無しで判定に到達する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: materialized test file の同定は Evidence Base 参照と candidate の diff で行う > Scenario: archive floor は baseOid 無しで判定に到達する

---

### TC-009: --from test-materialize は implementer に解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize の resume 互換は legacy alias で担保される > Scenario: --from test-materialize は implementer に解決される

---

### TC-010: resumePoint.step が test-materialize でも implementer に解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize の resume 互換は legacy alias で担保される > Scenario: resumePoint.step が test-materialize でも implementer に解決される

---

### TC-011: test-materialize 実行歴を含む legacy state が読み込み・fold で壊れない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-materialize の resume 互換は legacy alias で担保される > Scenario: test-materialize 実行歴を含む legacy state が読み込み・fold で壊れない

---

### TC-012: 免除 type は test-case-gen と bite-evidence を通らない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: test-gen 免除の制御対象は 2 箇所に縮退する > Scenario: 免除 type は test-case-gen と bite-evidence を通らない

---

### TC-013: listChangedFilesBetweenCommits が LocalRuntime に実装され path フィルタなしで動作する

**Category**: unit
**Priority**: must
**Source**: design.md > D3: file-set 同定の Evidence Base ネイティブ化 / tasks.md > T-05

**GIVEN** `LocalRuntime` の `listChangedFilesBetweenCommits(baseOid, headOid, cwd)` 実装
**WHEN** 2 つの commit OID と作業ディレクトリを渡して呼び出す
**THEN** `git diff --name-only <baseOid> <headOid>` を pathspec フィルタなしで実行し変更ファイル一覧を `ChangedFilesResult` として返す。exit 0 → success、非 0 / spawn エラー → unavailable

---

### TC-014: ManagedRuntime は listChangedFilesBetweenCommits で unavailable を返す

**Category**: unit
**Priority**: should
**Source**: design.md > D3: file-set 同定の Evidence Base ネイティブ化 / tasks.md > T-05

**GIVEN** `ManagedRuntime` の `listChangedFilesBetweenCommits` 実装
**WHEN** 任意の引数で呼び出す
**THEN** 他の ManagedRuntime メソッドと同じく構造的に unavailable を返す

---

### TC-015: scenario 凍結が intact なら testDerivation は frozen

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: testDerivation は scenario 凍結として判定される > Scenario: scenario 凍結が intact なら testDerivation は frozen

---

### TC-015a: materializedTestFiles が空でも testDerivation は frozen（D4 独立性）

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: testDerivation は scenario 凍結として判定される > Scenario: materializedTestFiles が空でも testDerivation は frozen（D4 独立性）

---

### TC-016: scenario がすり替えられたら testDerivation は absent

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: testDerivation は scenario 凍結として判定される > Scenario: scenario がすり替えられたら testDerivation は absent

---

### TC-017: bun run typecheck が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-11: 全体緑を確認する

`bun run typecheck`

---

### TC-018: bun run test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-11: 全体緑を確認する

`bun run test`

---

## Result

```yaml
result: completed
total: 19
automated: 17
manual: 0
must: 18
should: 1
could: 0
blocked_reasons: []
```
