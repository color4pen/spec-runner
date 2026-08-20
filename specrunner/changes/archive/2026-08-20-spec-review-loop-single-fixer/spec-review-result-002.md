# Spec Review Result — Round 002

**Slug**: spec-review-loop-single-fixer
**Reviewer**: spec-review

---

## 検証した項目

### 前周指摘の解消確認

| 前周指摘 | 対象 | 状態 |
|---------|------|------|
| [high] spec-review-fixer-routing.test.ts が T-08 の更新対象に含まれていない | tasks.md T-08 | ✅ 解消済み — T-08 に `src/core/step/__tests__/spec-review-fixer-routing.test.ts` の 3 箇所（makeCanonScope() / TC-013 verdict / TC-013 completion verdict）が明示された |
| [medium] src/prompts/rules.ts が T-01 の更新対象に含まれていない | tasks.md T-01 | ✅ 解消済み — T-01 に `src/prompts/rules.ts` の責任範囲テーブル更新が明示された |
| [low] spec-observation.ts の specReviewHasRoutableFixables JSDoc が T-01 更新対象に含まれていない | tasks.md T-04 | ✅ 解消済み — T-04（spec-observation.ts を touch する task）に JSDoc 更新が移動・明示された |

### 仕様内容の検証

- **request.md**: 削除対象・非変更対象の境界が明確。スコープ外（resume/apply-canon 変更なし）が正しく定義されている。
- **design.md**: D1〜D5 の設計判断にすべて Rationale と Alternatives considered が記載されており設計根拠が追跡可能。D3 で `specFixerNeedsFixForward` が dead export になる理由が明示されている。
- **spec.md**: 4 Requirement すべてに SHALL/MUST と Given/When/Then 形式の Scenario が含まれており spec 記法に適合している。
- **test-cases.md**: 18 cases（must:16, should:2）。Summary の集計は正確。TC-006（#1015 の歯）と TC-007（予算枯渇）が integration/must として正しく配置されている。
- **tasks.md**: T-01〜T-09 の実装順序と Acceptance Criteria が整合している。

### コードとの照合

以下のコード事実を実ファイルで確認した:

| 確認事項 | ファイル:行 | 状態 |
|---------|-----------|------|
| canon-write-scope.ts spec-fixer エントリは {spec.md, design.md, tasks.md}（test-cases.md 未追加） | canon-write-scope.ts:43 | 実装前の基底線として正確 |
| testCaseGenEffectiveFixer は canon-escalation.ts:63 に存在する | canon-escalation.ts:63 | 削除前の状態として正確 |
| specFixerNeedsFixForward（line 103）, specReviewNeedsFixIsTcOnly（line 129）は spec-observation.ts に存在する | spec-observation.ts:103,129 | 削除前の状態として正確 |
| loopIntermediateSteps は registry.ts:87 / types.ts:156 / pipeline.ts:99,113,126,527 / run.ts:72 に存在する | 各ファイル | T-05 の line 参照と一致する |
| STANDARD_TRANSITIONS は 47 行（TC-only 行:262 と TC 再生成行:270 が削除対象） | types.ts:246〜 | 確認済み |
| step-completion.ts の dual-resolver（211-218 行）は testCaseGenEffectiveFixer を使用している | step-completion.ts:215-218 | T-03 の単純化対象として正確 |
| T-08 の line 参照（spec-fixer-tasks-md-writable TC-002/TC-005 等）が実ファイルと一致 | 各テストファイル | 確認済み |
| spec-fixer-system.ts の Contract に test-cases.md の記述がない（T-01 で追加が必要） | spec-fixer-system.ts:18-31 | T-01 AC との整合を確認 |
| rules.ts の spec-fixer 行に test-cases.md がない（T-01 で追加が必要） | rules.ts:48 | T-01 AC との整合を確認 |

### シンボル参照の網羅確認

削除対象シンボルを参照するテストファイル（grep 結果）:

| ファイル | T-08 掲載 |
|---------|----------|
| tests/unit/pipeline/transition-when.test.ts | ✅ |
| tests/unit/core/pipeline/test-case-gen-design-phase.test.ts | ✅ |
| tests/unit/core/pipeline/spec-observation-autofix.test.ts | ✅ |
| tests/unit/core/pipeline/registry-invariants.test.ts | ✅ |

**シンボルを参照しないが count test で影響を受けるファイルの追加確認**（下記 Finding 参照）:

- `tests/unit/core/pipeline/pipeline.transitions.test.ts:277` — シンボル参照なし、count test のみ
- `tests/unit/core/pipeline/spec-observation-autofix.test.ts:1510` — TC-029（count test）は T-08 TC-009/TC-010 の指示に含まれない
- `tests/unit/core/pipeline/test-case-gen-design-phase.test.ts:1411` — TC-026（count test）は T-08 の TC 更新リストに含まれない
- `tests/unit/pipeline/transition-when.test.ts:199` — count 変更が T-08 の vague 指示に含まれない

---

## 検証できなかった項目

- T-07 で新規追加される integration test（#1015 の歯・TC-006）の内容妥当性は実装前のため確認不可。テスト内容の検証はコードレビュー段階に委ねる。
- `tests/pipeline-integration.test.ts` TC-012 が loopIntermediateSteps 削除後も正しく動作するか（mock client の test-case-gen 処理）は完全追跡していない。T-07 の「維持/更新で満たしてよい」指示でカバーされている。

---

## Findings 詳細

### [medium / fixable] T-08 が STANDARD_TRANSITIONS.length の count 変化を pin する 3〜4 テストを列挙していない

**ファイル**: `specrunner/changes/spec-review-loop-single-fixer/tasks.md`

T-04 で 2 transition（`SPEC_REVIEW → TEST_CASE_GEN` guarded by specReviewNeedsFixIsTcOnly / `SPEC_FIXER → TEST_CASE_GEN` guarded by specFixerNeedsFixForward）を削除すると `STANDARD_TRANSITIONS.length` は 47 → 45 になる。

以下のテストがこのカウントを pin しているが、T-08 の更新対象として明示されていない:

| テスト | ファイル:行 | T-08 の状況 |
|------|-----------|------------|
| TC-030 | `tests/unit/core/pipeline/pipeline.transitions.test.ts:277` | **このファイルが T-08 に全く登場しない**。削除対象シンボルへの参照もなく T-08 末尾の grep 確認でも発見されない |
| TC-029 | `tests/unit/core/pipeline/spec-observation-autofix.test.ts:1510` | T-08 で TC-009/TC-010 の更新は指示されているが TC-029（count test）は言及なし |
| TC-026 | `tests/unit/core/pipeline/test-case-gen-design-phase.test.ts:1411` | T-08 で TC-008/TC-017 等の更新は指示されているが TC-026（count test）は言及なし |
| TC-WHEN-02 | `tests/unit/pipeline/transition-when.test.ts:199` | 「削除 transition を参照する assertion を除去・更新する」の vague 指示に含まれる可能性があるが count 変更が明示されていない |

これら 3〜4 テストは T-09 gate（`bun run test`）で失敗する。特に `pipeline.transitions.test.ts` は本 request で一切言及されておらず、T-08 末尾の grep 確認でも検出できない（シンボル参照がないため）。プロジェクトの "Enumerate default-pin tests" 原則に反する。

**修正方法**（tasks.md T-08 への追記）:

1. `tests/unit/core/pipeline/pipeline.transitions.test.ts`（TC-030）を T-08 の更新対象として追記し、`STANDARD_TRANSITIONS.length` の期待値を 47 → 45 に更新する旨を明示する。
2. `tests/unit/core/pipeline/spec-observation-autofix.test.ts`（TC-029: line 1510）の count 更新を TC-009/TC-010 の指示に追加する。
3. `tests/unit/core/pipeline/test-case-gen-design-phase.test.ts`（TC-026: line 1411）の count 更新を TC-008 等の指示に追加する。
4. `tests/unit/pipeline/transition-when.test.ts`（TC-WHEN-02: line 199）の count 変更（47→45）を明示する。
