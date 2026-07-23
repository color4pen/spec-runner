# Spec Review: spec-review-fixer-routing (attempt 2)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### Spec ファイル精読

- `request.md` — 背景・要件（R1〜R5）・受け入れ基準・architect 評価済み設計判断を精読
- `design.md` — D1〜D6 全判断・根拠・代替案却下理由を精読し、request.md 要件との対応を確認
- `spec.md` — 全 Requirement・Scenario を精読し、request.md 受け入れ基準との網羅性を照合
- `tasks.md` — T-01〜T-06 の実装指示・受け入れ基準を精読

### 前回指摘（F-001〜F-003）の解消確認

- **F-001**（tasks.md: T-05 に identity assertion が明示されていない）→ T-05 末尾に「配線 identity テスト: `SpecReviewStep.judgeVerdictFn === deriveSpecReviewVerdict` の参照一致を専用ケースで固定する（regression-gate の先例に倣う）」が追加されていることを確認 ✓
- **F-002**（spec.md: coexistence シナリオに escalationReason 検証がない）→ Scenario "escalation-and-routable coexistence prefers escalation" に `**And** escalationReason is set and contains CANON_FINDING_ESCALATION (referencing the unroutable request.md finding)` が追加されていることを確認 ✓
- **F-003**（tasks.md: T-04 に TypeScript null-safety パターンが未指定）→ T-04 に「参照時は non-null assertion（`!`）ではなく明示的 null ガード（`if (lastCanonResolver !== null)`）を用い、invariant 違反時は安全に no-op へ倒す」が追加されていることを確認 ✓

### ソースコード前提の実地検証

- `src/core/step/canon-escalation.ts` — `judgeEffectiveFixer`（常に `"code-fixer"` を返す）・`conformanceEffectiveFixer`・`selectUnroutableCanonFindings`・`buildCanonEscalationReason` の実装を確認。`specReviewEffectiveFixer` / `selectRoutableCanonFindings` は未定義（実装待ち）を確認 ✓
- `src/core/step/judge-verdict.ts` — `deriveJudgeVerdict`（L53: canon 判定が critical|high 判定より前段）・`deriveConformanceVerdict`（L111: `conformanceEffectiveFixer` 使用）を確認。`deriveSpecReviewVerdict` は未定義（実装待ち）を確認 ✓
- `src/core/step/spec-review.ts` — `SpecReviewStep` が `reportTool: JUDGE_REPORT_TOOL` を持ち `judgeVerdictFn` が未定義であることを確認 ✓
- `src/core/step/step-completion.ts:306` — `const resolver = lastIsConformancePath ? conformanceEffectiveFixer : judgeEffectiveFixer;` の現行 boolean 方式を確認。D4 の `lastCanonResolver` 捕捉への置換方針と整合することを確認 ✓
- `src/core/step/canon-write-scope.ts:51` — spec-fixer の書込可能集合が `{spec.md, design.md}`、code-fixer が `∅` であることを確認 ✓
- `src/core/pipeline/types.ts:234,241` — `spec-review needs-fix → spec-fixer`（L234）・`spec-fixer approved → spec-review`（L241）の遷移が既存であることを確認 ✓
- `src/core/pipeline/registry.ts` — `loopFixerPairs[SPEC_REVIEW] = SPEC_FIXER` が既存であることを確認 ✓
- `src/core/step/regression-gate.ts:98` — `judgeVerdictFn: deriveRegressionGateVerdict` の配線パターン（D3 参照先）が存在することを確認 ✓
- `src/kernel/step-names.ts` — import 文なし（完全な leaf モジュール）。T-04 で `step-completion.ts` から import しても import cycle が発生しないことを確認 ✓
- `src/core/port/step-types.ts:284-289` — `AgentStep.judgeVerdictFn` の型シグネチャが `(findings, ok, evidence?, canonScope?) => "approved" | "needs-fix" | "escalation"` であることを確認。`deriveSpecReviewVerdict` が代入可能であることを型レベルで確認 ✓

### Spec → Tasks → Design の整合性確認

- Req 1（routable canon fixable → needs-fix 非 severity 依存）: D1+D2+D3 で実現、T-01+T-02+T-03 でカバー ✓
- Req 2（unroutable canon fixable → escalation + escalationReason）: D2(4a)+D4 で実現、T-02+T-04 でカバー ✓
- Req 3（verdict と escalationReason が同一 resolver）: D4 の `lastCanonResolver` 捕捉で実現、T-04 でカバー ✓
- Req 4（非 canon の挙動保持）: D2 の priority 1〜3・5〜6 で明示、T-02 の test cases でカバー ✓
- Req 5（loop 有界性）: D5（遷移表変更なし・既存 loop exhaustion 流用）で担保、T-05 有界性テストでカバー ✓
- Req 6（他 step 挙動不変）: D4 の捕捉方式が既存 resolver を保持、T-06 検証でカバー ✓

### spec.md Scenario 網羅性確認

- spec.md medium fixable → needs-fix ✓（Req 1, Scenario 1）
- design.md low fixable → needs-fix ✓（Req 1, Scenario 2）
- request.md fixable → escalation + escalationReason ✓（Req 2, Scenario 1）
- unroutable + routable coexistence → escalation + escalationReason ✓（Req 2, Scenario 2）
- routable spec.md → no escalationReason ✓（Req 3, Scenario 1）
- unroutable request.md → escalationReason set ✓（Req 3, Scenario 2）
- 非 canon medium fixable → approved ✓（Req 4, Scenario 1）
- decision-needed → escalation ✓（Req 4, Scenario 2）
- loop bounded → SPEC_REVIEW_RETRIES_EXHAUSTED ✓（Req 5, Scenario）
- code-review canon escalation unchanged ✓（Req 6, Scenario）

### セキュリティ検討

本変更は純粋な内部 routing ロジック変更（外部入力処理・認証・I/O 変更なし）であり、OWASP Top 10 の適用対象外であることを確認。

## 検証できなかった項目

- T-05 で追加予定のテストコード（未実装のため）の正確な assert 内容
- ADR の最終文面（adr-gen step に委任するため）

## Findings 詳細

None — 前回の F-001〜F-003 はすべて解消されており、新規の blocking finding は検出されなかった。

---

### 観察事項（非ブロッキング）

**T-05 の単体テストリストに `ok:false → escalation` と `vacuous → escalation` が明示されていない**

D2 の priority 1 と priority 2 に相当するテストケースが T-05 の「deriveSpecReviewVerdict の単体テスト」リストに明示されていない。ただし:
- これらは `deriveJudgeVerdict` と同一の先行ロジックであり、既存テストで動作が保証されている
- D2 の priority list に明記されており、実装者が見落とす可能性は低い
- spec.md Req 4 の要件テキストには `ok: false` と `vacuous check` が言及されている

実装上の誤りを引き起こす可能性は低く、非ブロッキングとして扱う。
