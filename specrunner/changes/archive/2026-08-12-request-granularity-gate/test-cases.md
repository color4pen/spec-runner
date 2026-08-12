# Test Cases: 過大 request の粒度ゲート

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

- **Total**: 14 cases
- **Automated** (unit/integration): 13
- **Manual**: 0
- **Priority**: must: 12, should: 2, could: 0

---

### TC-001: validate — 15 項目以上で stderr 警告・exit 0 を維持する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request validate は過大な受け入れ基準に非ブロッキング警告を出す > Scenario: 15 項目以上で警告し exit 0 を維持する

---

### TC-002: validate — 14 項目以下では stderr 警告が出ない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request validate は過大な受け入れ基準に非ブロッキング警告を出す > Scenario: 14 項目以下では警告しない

---

### TC-003: request-review system prompt に縫い目判定観点・3 基準・実測較正値が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review は縫い目判定観点を持つ > Scenario: system prompt に縫い目判定観点・3 基準・較正値が含まれる

---

### TC-004: request-review system prompt に分割検討済み宣言尊重ルールが含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 分割検討済み宣言は縫い目 finding を抑制する > Scenario: 宣言尊重ルールが system prompt に含まれる

---

### TC-005: docs/request-authoring.md の粒度節に実測値と宣言規約が記載される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: authoring guidance が崖の実測と宣言規約を記載する > Scenario: docs に実測値と宣言規約が記載される

---

### TC-006: request template の受け入れ基準コメントに規模目安と宣言への言及が含まれる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: authoring guidance が崖の実測と宣言規約を記載する > Scenario: request template が規模目安と宣言への言及を含む

---

### TC-007: countTopLevelAcceptanceCriteria — 15 項目の受け入れ基準で 15 を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: 受け入れ基準の top-level 項目数カウント（純関数）> Acceptance Criteria

**GIVEN** `受け入れ基準` 節に行頭無インデントの `-` マーカー項目が 15 行ある request.md 内容
**WHEN** `countTopLevelAcceptanceCriteria(content)` を呼ぶ
**THEN** 戻り値は 15

---

### TC-008: countTopLevelAcceptanceCriteria — インデント済みネスト項目を数えない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: 受け入れ基準の top-level 項目数カウント（純関数）> Acceptance Criteria

**GIVEN** `受け入れ基準` 節に top-level 項目 3 行 + 2 スペースインデントのサブ項目 5 行がある内容
**WHEN** `countTopLevelAcceptanceCriteria(content)` を呼ぶ
**THEN** 戻り値は 3（インデント行はカウントしない）

---

### TC-009: countTopLevelAcceptanceCriteria — HTML コメント内のリスト行を数えない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: 受け入れ基準の top-level 項目数カウント（純関数）> Acceptance Criteria

**GIVEN** `受け入れ基準` 節に top-level 項目 2 行 + `<!-- - コメント内の項目 -->` を含む内容
**WHEN** `countTopLevelAcceptanceCriteria(content)` を呼ぶ
**THEN** 戻り値は 2（HTML コメント内の行はカウントしない）

---

### TC-010: countTopLevelAcceptanceCriteria — 受け入れ基準節が無いとき 0 を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01: 受け入れ基準の top-level 項目数カウント（純関数）> Acceptance Criteria

**GIVEN** `受け入れ基準` 見出しを含まない request.md 内容
**WHEN** `countTopLevelAcceptanceCriteria(content)` を呼ぶ
**THEN** 戻り値は 0

---

### TC-011: validate 警告文に実測根拠・宣言案内・docs 参照が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02: executeValidate に規模警告を追加（非ブロッキング）> Acceptance Criteria

**GIVEN** 受け入れ基準が 15 項目の妥当な request.md ファイル
**WHEN** `executeValidate(filePath)` を実行する
**THEN** stderr に書き出された文字列に実測根拠（`8%` または `23%` を含む数値）が含まれる
**AND** `## 分割検討済み` または「分割検討」への言及が含まれる
**AND** `docs/request-authoring.md` への参照が含まれる

---

### TC-012: request-review system prompt に Method 6 が独立した観点として存在し、既存 Method 1–5 が保持される

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03: request-review system prompt に縫い目判定 Method を追加 > Acceptance Criteria

**GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT`
**WHEN** その内容を検査する
**THEN** Method 6 または「Granularity Seam」相当の縫い目判定見出しが含まれる
**AND** 既存の read-only 制約（ファイル編集禁止）および approve / needs-discussion / reject の verdict 導出が保持されている

---

### TC-013: typecheck && test が green（全テスト通過・既存テスト無改変）

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-06: 全体検証 > Acceptance Criteria

verification フェーズの `bun run typecheck` および `bun run test` コマンドで充足を確認する。
既存テスト TC-REQ-004（受け入れ基準 1 項目 → stderr 無出力）および TC-RIA-02（template checkbox 数固定）が
無改変で green であることを含む。

---

### TC-014: countTopLevelAcceptanceCriteria — `-` / `*` / `+` / `1.` / `1)` の各マーカーを top-level として認識する

**Category**: unit
**Priority**: should
**Source**: design.md > D3: 規模カウントは extract-section.ts の純関数、しきい値は request.ts のコード定数

**GIVEN** `受け入れ基準` 節に `-` 1行・`*` 1行・`+` 1行・`1.` 1行・`1)` 1行（計 5 行、いずれも行頭無インデント）がある内容
**WHEN** `countTopLevelAcceptanceCriteria(content)` を呼ぶ
**THEN** 戻り値は 5（各マーカー形式を top-level 項目として認識する）

---

## Result

```yaml
result: completed
total: 14
automated: 13
manual: 0
must: 12
should: 2
could: 0
blocked_reasons: []
```
