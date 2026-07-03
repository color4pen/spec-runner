# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | maintainability | `src/templates/step-output-templates.ts` | `SPEC_EXEMPT_NOTE` の本文に型名 "chore" がハードコードされている（2 箇所）。現状は chore のみ spec-exempt なので実害はないが、将来 spec-exempt 型が追加された際にノート文言が古くなる。 | 型名をハードコードせず「この変更は request 型が spec 対象外のため…」のように型非依存の表現にする（または `state.request.type` を受け取って動的に埋める）。現時点ではスコープ外なので no でよい。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 9 | 0.10 |

- **total**: 9.45

## Summary

設計（D1–D4）どおりの実装で、受け入れ基準をすべて満たしている。

**正しかった点**

- **D1 / T-01**: `TypeConfigEntry.specRequired` + `isSpecRequired()` を追加し、未知型は `true` にフォールバック（fail-closed）。既存ヘルパ（`getBranchPrefix` / `getConventionalPrefix`）と同じ規約で統一されている。
- **D2 / T-03**: `DesignStep.writes()` で `verify: isSpecRequired(deps.request.type)` を設定し、contract 構築層（`producedContractsFromWrites`）で chore の spec.md を produced contract から除外。`local.ts` / `managed.ts` の `validateStepOutputs` は一切変更されておらず、要件 5（runtime 非依存）を満たす。
- **D3 / T-02**: `SPEC_EXEMPT_MARKER` を単一定数として export し、`SPEC_EXEMPT_NOTE` と下流プロンプト（spec-review / conformance / design）がこれを import 共有。文言ドリフトをテストで固定している。
- **D4 / T-05**: spec-review・conformance・design の各プロンプトに marker 認識ガイダンスを追加。spec-exempt な spec.md を vacuously satisfied として扱い、Requirement 欠如を finding にしないよう明示。
- **テスト**: "must" の 12 ケースがすべて自動テストで固定されており、ManagedRuntime は mock `getRawFile` で実コードを検証、LocalRuntime は契約構築層の構造証明でカバー（`spec.md` が contracts に無いため runtime が読む機会がない）。verification-result.md で 428 test files / 5791 tests が全 green。

**設計上の注意点（スコープ外）**

- `spec-fixer.ts:99–105` の `writes()` は chore でも spec.md を produced 宣言したまま（`verify: false` 未適用）だが、design doc が分析しているとおり: (a) spec-fixer には spec.md テンプレートが無く scaffold 比較が起きない、(b) SPEC_EXEMPT_NOTE は非空なので「欠落・空」違反にならない、(c) chore では spec-review lightweight が approve するため spec-fixer は通常起動しない。本 request の明示スコープ外であり問題なし。
- `design-system.ts` の "bug-fix / refactoring 等の場合（= spec.md 不要）" ラベルは pre-existing コードで本 PR が導入したものではない。

**verdict**: approved — 実装は設計どおり、全受け入れ基準をクリア、CI green。
