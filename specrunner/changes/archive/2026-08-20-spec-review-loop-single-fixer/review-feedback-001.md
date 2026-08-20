# Review Feedback — spec-review-loop-single-fixer — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` で変更範囲を確認（src/ 14 ファイル + tests/ 10 ファイル）
- 削除対象シンボル grep: `specReviewNeedsFixIsTcOnly` / `testCaseGenEffectiveFixer` / `specFixerNeedsFixForward` / `loopIntermediateSteps` → src/ 0 件
- STANDARD_TRANSITIONS: `to === TEST_CASE_GEN` 行を確認 → `DESIGN → TEST_CASE_GEN` の 1 本のみ（SPEC_REVIEW / SPEC_FIXER → TEST_CASE_GEN は削除済み）
- pipeline.ts の newEpisode ロジック変更（`!this.loopIntermediateSteps.has(currentStep)` 除去）を確認し、初回 test-case-gen → spec-review エントリへの影響を追跡
- spec-fixer write scope: `writableByFixer["spec-fixer"]` に test-cases.md 追加、`SpecFixerStep.writes()` に test-cases.md 追加、drift-guard 整合確認
- T-07 integration test（pipeline-integration.test.ts L1793–1829）を精読
- TC-012 budget exhaustion test（pipeline-integration.test.ts L393–446）を確認
- T-07 transition pin tests（pipeline.transitions.test.ts L368+）を確認
- spec-fixer-system.ts / rules.ts の prompt / 責任表更新を確認
- test-case-gen.ts の finding 注入除去を確認
- 旧挙動 pin の期待更新をすべてのテストファイルで確認
- verification-result.md: build/typecheck/test/lint/changed-line-coverage すべて passed（11802 tests, 791 files）

## 検証できなかった項目

- spec-fixer が実際に test-cases.md を targeted に修正する挙動（mocked pipeline では agent が file を書かないため E2E 検証不可）
- TC-009（should）として定義された SPEC_FIXER_SYSTEM_PROMPT の内容 assert — テストが実装されていないため実行確認不可

## Findings 詳細

### F-001 [medium / fixable]: TC-006 (#1015 歯) のテストが behavioral でなく structural proxy に留まる

**対象ファイル**: `tests/pipeline-integration.test.ts` L1793–1829（T-07 describe block）

受け入れ基準の文言:
> 「operator 編集済み test-cases.md（finding と無関係の変更を含む）を持つ状態で spec-review → spec-fixer → spec-review の一巡を回し、finding と無関係の operator 編集が test-cases.md に保存されることがテストで pin される」

実装した T-07 テストは:
1. GIVEN 条件「test-cases.md に operator 編集が含まれる」を設定しない
2. THEN「operator 編集が保存されたまま残る」を観測せず
3. `result.steps?.["test-case-gen"]?.length === 1`（loop 中 test-case-gen が走らない）のみを assert

structural proxy（wholesale 再生成 step が loop にない）で behavioral requirement（ファイル内容が保存される）を代用している。

**設計の意図**: design.md Risk セクションが「根本原因はループ内の wholesale 再生成。歯は transition 検証 + spec-fixer route 検証で構造的に pin する」と明記しており、意図的な選択。

**残存リスク**: spec-fixer が test-cases.md を受け取って wholesale で書き直す挙動を取った場合、現テストはそれを検出できない。prompt に「targeted 修正・再生成はしない」を追記したが、prompt の drift を検出する歯がない。

**修正案**: TC-009（should, 未実装）を追加してこの gap を部分的に閉じる:
```ts
// tests/unit/core/step/spec-fixer-tasks-md-writable.test.ts などに追記
it("TC-009: SPEC_FIXER_SYSTEM_PROMPT contains test-cases.md and no-regeneration instruction", () => {
  expect(SPEC_FIXER_SYSTEM_PROMPT).toContain("test-cases.md");
  expect(SPEC_FIXER_SYSTEM_PROMPT).toContain("再生成はしない");
});
```

これで「spec-fixer が targeted 修正を指示されている」ことを structural に pin できる。

---

### Non-Findings（確認済み・問題なし）

- **削除対象消去**: 4 シンボルすべて src/ から 0 件 ✅
- **STANDARD_TRANSITIONS 行数**: 45 行（-2 行）正確 ✅
- **spec-fixer write scope**: writableByFixer["spec-fixer"] = {spec.md, design.md, tasks.md, test-cases.md}、writes() と一致 ✅
- **drift-guard TC-029**: writes() ∩ canonPaths = 4 ファイルで map と整合 ✅
- **spec-review → spec-fixer routing**: medium test-cases.md finding → approved（escalation なし）✅
- **high test-cases.md finding → needs-fix**: TC-017 in test-case-gen-design-phase.test.ts で確認 ✅
- **request.md → escalation 維持**: TC-006 in spec-fixer-tasks-md-writable.test.ts で確認 ✅
- **T-07 transition pin**: SPEC_REVIEW → SPEC_FIXER（unconditional）存在、SPEC_FIXER → SPEC_REVIEW（unconditional）存在、双方向で TEST_CASE_GEN 行なし ✅
- **TC-012 収束予算枯渇**: needs-fix 継続 → SPEC_REVIEW_RETRIES_EXHAUSTED（loopIntermediateSteps 削除後も green）✅
- **newEpisode ロジック**: test-case-gen → spec-review（初回）で newEpisode=true（budget reset）。初回エントリーは iter=0 なので機能上無害 ✅
- **test-case-gen.ts finding 注入除去**: testCaseGenEffectiveFixer / selectRoutableCanonFindings 参照削除済み ✅
- **rules.ts + spec-fixer-system.ts**: spec-fixer 行に test-cases.md 追記、targeted 修正・再生成禁止の instruction 追記済み ✅
- **旧挙動 pin 更新**: TC-005/006/008/009/010/017/018/019/022/026/028/029/030/WHEN-02 すべて新挙動で更新済み ✅
- **design → test-case-gen 初回経路**: 変更なし、既存テストは green ✅
- **exempt type bypass**: 変更なし、既存テストは green ✅
- **bun run typecheck / bun run test**: verification-result.md で両方 passed ✅
