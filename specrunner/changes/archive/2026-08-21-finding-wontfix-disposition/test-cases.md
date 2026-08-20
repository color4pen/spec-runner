# Test Cases: fixable finding への operator 不採用裁定を decisions 台帳の一般化で機械尊重する

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

- **Total**: 18 cases
- **Automated** (unit/integration): 17
- **Manual**: 0
- **Priority**: must: 16, should: 2, could: 0

---

### TC-001: kind 無しの既存 decisions が option として読める

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: DecisionRecord は option / disposition の 2 arm を後方互換で保持する > Scenario: kind 無しの既存 decisions が option として読める

---

### TC-002: disposition record が必須 field を持つ

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: DecisionRecord は option / disposition の 2 arm を後方互換で保持する > Scenario: disposition record が必須 field を持つ

---

### TC-003: --wontfix が発生 step 由来の disposition record を永続する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job resume --wontfix は disposition record を decisions へ記録してから resume する > Scenario: --wontfix が発生 step 由来の disposition record を永続する

---

### TC-004: 同一 fingerprint を複数 step が報告した場合は各 step につき 1 record

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: job resume --wontfix は disposition record を decisions へ記録してから resume する > Scenario: 同一 fingerprint を複数 step が報告した場合は各 step につき 1 record

---

### TC-005: --prompt と --wontfix は併用できる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: job resume --wontfix は disposition record を decisions へ記録してから resume する > Scenario: --prompt と --wontfix は併用できる

---

### TC-006: regression-gate 未実行で exit code 2

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 解決不能な --wontfix は exit code 2 で停止し decisions を変更しない > Scenario: regression-gate 未実行

---

### TC-007: 番号が範囲外で exit code 2

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 解決不能な --wontfix は exit code 2 で停止し decisions を変更しない > Scenario: 番号が範囲外

---

### TC-008: reason 欠落で exit code 2

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 解決不能な --wontfix は exit code 2 で停止し decisions を変更しない > Scenario: reason 欠落

---

### TC-009: wontfix 済み finding が computeRegressionLedger から消える

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: disposition 済み finding は regression-gate の active 入力から除外される > Scenario: wontfix 済み finding が computeRegressionLedger から消える

---

### TC-010: wontfix 1 件で livelock が解消する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: disposition 済み finding は regression-gate の active 入力から除外される > Scenario: wontfix 1 件で livelock が解消する

---

### TC-011: 除外は照合のみで履歴を変えない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: disposition 済み finding は regression-gate の active 入力から除外される > Scenario: 除外は照合のみで履歴を変えない

---

### TC-012: reviewer が wontfix 済み finding を再報告しても verdict が needs-fix にならない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 同一 findingKey の再報告は verdict を needs-fix にしない > Scenario: reviewer が wontfix 済み finding を再報告

---

### TC-013: --wontfix 無しの resume は挙動不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: --wontfix を指定しない resume は挙動不変 > Scenario: --wontfix 無しの resume

---

### TC-014: 非整数番号で exit code 2

**Category**: unit
**Priority**: must
**Source**: design.md > Decisions > D4: 記録は all-or-nothing、失敗は exit code 2 で decisions 無変化

**GIVEN** a job whose latest regression-gate StepRun reported at least one finding
**WHEN** the operator runs `job resume <slug> --wontfix "abc" --wontfix-reason "r"` (non-integer value)
**THEN** `resolveWontfixDispositions` returns an error (non-integer parse failure)
**AND** the command exits with code 2 and `JobState.decisions` is unchanged

---

### TC-015: 逆引き不能な fingerprint で exit code 2

**Category**: unit
**Priority**: must
**Source**: design.md > Decisions > D3: 解決源は「最新 regression-gate StepRun が報告した findings」、record 時に source step へ逆引きする

**GIVEN** a job whose latest regression-gate StepRun reported a finding whose fingerprint (`file|line|title`) matches no fixable finding in any StepRun of the impl reviewer chain
**WHEN** the operator runs `job resume <slug> --wontfix 1 --wontfix-reason "r"`
**THEN** `resolveWontfixDispositions` fails the reverse-lookup
**AND** the command exits with code 2 and `JobState.decisions` is unchanged

---

### TC-016: カンマ区切り番号列が正しく parse される

**Category**: unit
**Priority**: should
**Source**: design.md > Decisions > D2: `--wontfix` / `--wontfix-reason` は comma-separated string flag で受ける

**GIVEN** a job whose latest regression-gate StepRun reported at least 3 findings, and `--wontfix "1,3"` is supplied as a single string flag
**WHEN** `resolveWontfixDispositions` parses the value
**THEN** the number list resolves to indices [1, 3] (1-based)
**AND** disposition records are generated for findings at positions 1 and 3, with no error

---

### TC-017: 重複・空要素を含む番号列でエラー

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02: wontfix 解決・逆引きの純関数を追加する

**GIVEN** the operator passes `--wontfix "1,,1"` (empty element and duplicate index) with a valid `--wontfix-reason`
**WHEN** `resolveWontfixDispositions` parses the number list
**THEN** parsing fails due to the empty element and/or duplicate
**AND** the command exits with code 2 and `JobState.decisions` is unchanged

---

### TC-018: typecheck && test が green

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06: 後方互換とフルグリーンを固定する

verification フェーズ（`typecheck && test`）で green を確認する。

---

## Result

```yaml
result: completed
total: 18
automated: 17
manual: 0
must: 16
should: 2
could: 0
blocked_reasons: []
```
