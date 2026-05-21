# Test Cases: spec-review delta spec presence check

## Overview

本変更のテスト証明軸は 3 層:
1. **Prompt Content** — system prompt に check 段が含まれていることを grep で確認
2. **Pipeline Routing** — spec-review が needs-fix を返したとき spec-fixer に遷移することを mock で確認
3. **Spec Authority** — specrunner/specs の Requirement / Scenario が正しく追加されていることを確認

実 agent が prompt に従って HIGH severity を返すかの最終証明は dogfood (E2E) に委ねる。

---

## Category: Prompt Content

### TC-PC-001: system prompt に Delta Spec Presence Check セクションが含まれる

- **Priority**: must
- **Source**: tasks.md Task 2 / request.md 要件 3

**GIVEN** `src/prompts/spec-review-system.ts` の `SPEC_REVIEW_SYSTEM_PROMPT` 定数が存在する  
**WHEN** その文字列を grep する  
**THEN** `"Delta Spec Presence Check"` というセクションヘッダが含まれている

---

### TC-PC-002: system prompt が spec-change と new-feature の両方を条件に列挙している

- **Priority**: must
- **Source**: tasks.md Task 2 / request.md 要件 1

**GIVEN** `SPEC_REVIEW_SYSTEM_PROMPT` 定数が存在する  
**WHEN** その文字列を grep する  
**THEN** `"spec-change"` が含まれている  
**AND** `"new-feature"` が含まれている

---

### TC-PC-003: system prompt が HIGH severity を明記している

- **Priority**: must
- **Source**: tasks.md Task 2 / request.md 要件 1 / design.md D3

**GIVEN** `SPEC_REVIEW_SYSTEM_PROMPT` 定数が存在する  
**WHEN** その文字列を grep する  
**THEN** `specs/` ディレクトリが空または不在の場合に HIGH severity finding を報告する旨が記載されている

---

### TC-PC-004: system prompt が bug-fix と refactoring では check をスキップするよう指示している

- **Priority**: must
- **Source**: tasks.md Task 2 / request.md 要件 1

**GIVEN** `SPEC_REVIEW_SYSTEM_PROMPT` 定数が存在する  
**WHEN** その文字列を grep する  
**THEN** `"bug-fix"` が含まれている  
**AND** `"refactoring"` が含まれている  
**AND** これらの type では check をスキップすると記載されている

---

### TC-PC-005: system prompt が dsv との独立性を明記している

- **Priority**: should
- **Source**: tasks.md Task 2 / design.md D1

**GIVEN** `SPEC_REVIEW_SYSTEM_PROMPT` 定数が存在する  
**WHEN** その文字列を grep する  
**THEN** dsv との独立性（`independent.*dsv` または `dsv.*independent`）に関する記述が含まれている

---

### TC-PC-006: Delta Spec Presence Check セクションが Baseline Spec Consistency Check の前に配置されている

- **Priority**: must
- **Source**: tasks.md Task 1 / design.md D2

**GIVEN** `SPEC_REVIEW_SYSTEM_PROMPT` 定数文字列が存在する  
**WHEN** セクション順序を確認する  
**THEN** `"Delta Spec Presence Check"` の出現位置が `"Baseline Spec Consistency Check"` の出現位置より前である

---

### TC-PC-007: system prompt が finding の category: completeness を指定している

- **Priority**: should
- **Source**: request.md 要件 1 / design.md D3

**GIVEN** `SPEC_REVIEW_SYSTEM_PROMPT` 定数が存在する  
**WHEN** その文字列を grep する  
**THEN** `"completeness"` が含まれている

---

## Category: Type Reference Path

### TC-TR-001: SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE に {{REQUEST_TYPE}} プレースホルダが存在する

- **Priority**: must
- **Source**: request.md 要件 2 / design.md D4

**GIVEN** `src/prompts/spec-review-system.ts` の `SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE` 定数が存在する  
**WHEN** その文字列を確認する  
**THEN** `"{{REQUEST_TYPE}}"` または `"Request type:"` のプレースホルダが含まれている

---

### TC-TR-002: spec-review.ts が state.request.type を requestType として渡している

- **Priority**: must
- **Source**: request.md 要件 2 / design.md D4

**GIVEN** `src/core/step/spec-review.ts` が存在する  
**WHEN** そのコードを確認する  
**THEN** `requestType: state.request.type` または同等の代入が含まれており、request type が prompt に注入される経路が確立されている

---

## Category: Pipeline Routing

### TC-PR-001: type=spec-change で specs/ 不在 → spec-review が needs-fix → spec-fixer に遷移する

- **Priority**: must
- **Source**: request.md 要件 3 / design.md D3

**GIVEN** request type が `spec-change` である  
**AND** change folder の `specs/` ディレクトリが存在しないか空である  
**AND** spec-review agent が (mock で) HIGH severity finding + `needs-fix` verdict を返す  
**WHEN** pipeline が spec-review step を処理する  
**THEN** pipeline の次 step が `spec-fixer` である

---

### TC-PR-002: type=bug-fix で specs/ 不在 → spec-review が approved → 次の step に進む (regression なし)

- **Priority**: must
- **Source**: request.md 要件 3 / 受け入れ基準

**GIVEN** request type が `bug-fix` である  
**AND** change folder の `specs/` ディレクトリが存在しない  
**AND** spec-review agent が (mock で) `approved` verdict を返す  
**WHEN** pipeline が spec-review step を処理する  
**THEN** pipeline の次 step が `spec-fixer` ではなく、後続の正常 step（test-case-gen または implementer）である

---

### TC-PR-003: type=spec-change で specs/ 1 件以上 → spec-review が approved → 後続 step に進む

- **Priority**: must
- **Source**: request.md 要件 3 / 受け入れ基準

**GIVEN** request type が `spec-change` である  
**AND** change folder の `specs/<capability>/spec.md` に 1 件以上のファイルが存在する  
**AND** spec-review agent が (mock で) `approved` verdict を返す  
**WHEN** pipeline が spec-review step を処理する  
**THEN** pipeline が正常に後続 step（test-case-gen または implementer）に遷移する

---

### TC-PR-004: type=new-feature で specs/ 不在 → spec-review が needs-fix → spec-fixer に遷移する

- **Priority**: should
- **Source**: request.md 要件 1（new-feature も対象）/ design.md D3

**GIVEN** request type が `new-feature` である  
**AND** change folder の `specs/` ディレクトリが存在しないか空である  
**AND** spec-review agent が (mock で) HIGH severity finding + `needs-fix` verdict を返す  
**WHEN** pipeline が spec-review step を処理する  
**THEN** pipeline の次 step が `spec-fixer` である

---

### TC-PR-005: type=refactoring で specs/ 不在 → spec-review が approved → 正常続行 (regression なし)

- **Priority**: should
- **Source**: request.md 要件 1（refactoring は skip 対象）/ 受け入れ基準

**GIVEN** request type が `refactoring` である  
**AND** change folder の `specs/` ディレクトリが存在しない  
**AND** spec-review agent が (mock で) `approved` verdict を返す  
**WHEN** pipeline が spec-review step を処理する  
**THEN** pipeline が正常に後続 step に遷移し、`spec-fixer` へのリダイレクトは発生しない

---

## Category: Spec Authority

### TC-SA-001: spec-review-session/spec.md に delta spec presence の Requirement が追加されている

- **Priority**: must
- **Source**: tasks.md Task 3 / request.md 要件 4 / 受け入れ基準

**GIVEN** `specrunner/specs/spec-review-session/spec.md` が存在する  
**WHEN** そのファイルを確認する  
**THEN** `"spec-review は type=spec-change/new-feature のとき delta spec 存在を必須として check する"` に相当する Requirement が追加されている

---

### TC-SA-002: spec.md が type=spec-change で specs/ 不在のシナリオを含む

- **Priority**: must
- **Source**: tasks.md Task 3

**GIVEN** `specrunner/specs/spec-review-session/spec.md` が存在する  
**WHEN** そのファイルを確認する  
**THEN** `type=spec-change` かつ `specs/` 配下 0 件 → HIGH finding + `needs-fix` のシナリオが記載されている

---

### TC-SA-003: spec.md が type=bug-fix で specs/ 不在は対象外のシナリオを含む

- **Priority**: must
- **Source**: tasks.md Task 3

**GIVEN** `specrunner/specs/spec-review-session/spec.md` が存在する  
**WHEN** そのファイルを確認する  
**THEN** `type=bug-fix` かつ `specs/` 不在 → delta spec 存在 check はスキップのシナリオが記載されている

---

### TC-SA-004: spec.md が type=spec-change で specs/ 1 件以上のシナリオを含む

- **Priority**: must
- **Source**: tasks.md Task 3

**GIVEN** `specrunner/specs/spec-review-session/spec.md` が存在する  
**WHEN** そのファイルを確認する  
**THEN** `type=spec-change` かつ `specs/` 1 件以上 → check 通過のシナリオが記載されている

---

### TC-SA-005: spec.md が dsv との独立性を Requirement に明記している

- **Priority**: should
- **Source**: tasks.md Task 3 / design.md D1

**GIVEN** `specrunner/specs/spec-review-session/spec.md` が存在する  
**WHEN** そのファイルを確認する  
**THEN** dsv との独立性（冗長層として機能する旨）が Requirement に記載されている

---

## Category: Build / Type Check

### TC-BT-001: bun run typecheck が green

- **Priority**: must
- **Source**: tasks.md Task 4 / 受け入れ基準

**GIVEN** 実装変更が完了している  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で正常終了する

---

### TC-BT-002: bun run test が green (既存 regression なし + 新規テスト pass)

- **Priority**: must
- **Source**: tasks.md Task 4 / 受け入れ基準

**GIVEN** 実装変更と grep test 追加が完了している  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し、既存テストの regression が 0 件である  
**AND** 新規追加した 5 件の grep test も pass する

---

## Category: E2E / Dogfood (manual verification)

### TC-E2E-001: 本 request 自体を spec-review に通して HIGH finding が返る（dogfood）

- **Priority**: could
- **Source**: request.md 要件 3（E2E は dogfood に委ねる）

**GIVEN** 本 request（type=spec-change）の change folder の specs/ が存在しない  
**AND** 変更後の prompt が deploy されている  
**WHEN** 実 spec-review agent が change folder をレビューする  
**THEN** HIGH severity finding（category: completeness）が報告される  
**AND** verdict が `needs-fix` となる

*Note: この TC は自動テストではなく手動 dogfood で検証する。*

---

### TC-E2E-002: 本変更 merge 後、他の spec-change request で specs/ 不在が正しく検知される（dogfood）

- **Priority**: could
- **Source**: request.md 目的（防衛網 2 層目の実効性）

**GIVEN** 本変更が main に merge されている  
**AND** 別の spec-change request が specs/ なしで spec-review に入力される  
**WHEN** 実 spec-review agent がレビューを実行する  
**THEN** HIGH severity finding が報告され、`needs-fix` で spec-fixer に遷移する

*Note: この TC は merge 後の運用フェーズで観測する。*
