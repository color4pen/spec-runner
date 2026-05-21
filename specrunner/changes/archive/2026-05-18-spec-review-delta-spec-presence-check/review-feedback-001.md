# Code Review Feedback — spec-review-delta-spec-presence-check — iter 1

- **verdict**: approved

---

## Summary

実装は設計通りで正確。3 ファイルの変更がいずれも tasks.md に厳密に従っており、verification も green。MEDIUM 1 件（must テスト未実装）、LOW 2 件（must TC の間接カバー）を記録するが、いずれも動作上のバグではないため `approved`。

---

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | completeness | `tests/prompts/spec-review-system.test.ts` | test-cases.md TC-PC-006 (must) が未実装。「Delta Spec Presence Check の出現位置が Baseline Spec Consistency Check の出現位置より前」を検証するテストがない。実装順序は現在正しい（L59 vs L73）が、将来のリファクタで逆転しても検知されない。 | `expect(SPEC_REVIEW_SYSTEM_PROMPT.indexOf("Delta Spec Presence Check")).toBeLessThan(SPEC_REVIEW_SYSTEM_PROMPT.indexOf("Baseline Spec Consistency Check"))` を追加する。 |
| 2 | LOW | completeness | `tests/prompts/spec-review-system.test.ts` | test-cases.md TC-TR-001 (must) が直接テストされていない。`SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE` に `{{REQUEST_TYPE}}` プレースホルダが含まれることを明示的に grep していない。TC-019/TC-021 の既存テストが `requestType` フローを間接的に証明しているため実害は低い。 | `expect(SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE).toContain("{{REQUEST_TYPE}}")` を追加する。 |
| 3 | LOW | completeness | `src/core/step/spec-review.ts` | test-cases.md TC-TR-002 (must) が直接テストされていない。`requestType: state.request.type` の代入を明示確認するテストがない。TC-021 が同フローを exercising しているため実害は低い。 | `buildMessage` の結果に `Request type: <type>` が含まれることを確認する TC を追加する。 |

---

## Positive Notes

- **prompt 配置** (design.md D2): `## Delta Spec Presence Check`（L59）が `## Baseline Spec Consistency Check`（L73）の前に正しく配置されている。存在 check → 整合 check の論理順序に合致。
- **prompt 内容** (Task 1): セクションヘッダ・spec-change/new-feature・HIGH severity・bug-fix/refactoring skip・dsv independence のすべてが tasks.md 指定通りに含まれている。
- **TC-PC-003 regex**: `/specs\/.*directory.*empty.*missing.*HIGH/s` は実際のプロンプト文字列（`` `specs/` directory is empty or missing ... HIGH severity finding ``）に対して正しくマッチする。
- **spec authority**: `specrunner/specs/spec-review-session/spec.md` に Requirement + 3 Scenarios が追加。delta spec も `changes/.../specs/spec-review-session/spec.md` で ADDED 形式に準拠。
- **検証 green**: 2051 tests / 171 test files すべて pass。typecheck clean。
- **pipeline routing は既存テストでカバー済み** (design.md D5): TC-PR-001〜TC-PR-003 を意図的に省略した判断は妥当。routing ロジックは変更されておらず、既存 TC-010〜TC-013 が十分な証明をしている。
