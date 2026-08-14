# Review Feedback: test-case-gen-design-phase — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `specrunner/changes/test-case-gen-design-phase/design.md` — D1〜D7 の設計決定を精読
- `specrunner/changes/test-case-gen-design-phase/tasks.md` — T-01〜T-12 のタスクと受け入れ基準を照合
- `specrunner/changes/test-case-gen-design-phase/test-cases.md` — TC-001〜TC-032 の設計意図を確認
- `specrunner/changes/test-case-gen-design-phase/spec.md` — 全 Requirement/Scenario を確認
- `src/core/pipeline/types.ts` — STANDARD_TRANSITIONS 組み替え（D1）を確認、length === 52
- `src/core/pipeline/spec-observation.ts` — guard 3 件（specFixerObservationForward / specFixerNeedsFixForward / specReviewNeedsFixIsTcOnly）を実装と設計 D2/D4 と照合
- `src/core/step/judge-verdict.ts` — `deriveSpecReviewVerdict` の優先順（D3-4a/b/c）を実装と照合
- `src/core/step/canon-write-scope.ts` — test-case-gen エントリ追加（D3-2）を確認
- `src/core/step/canon-escalation.ts` — `testCaseGenEffectiveFixer` 追加（D3-1）を確認
- `src/core/step/spec-review.ts` — reads() の条件付き test-cases.md 追加（D6）を確認
- `src/core/step/test-case-gen.ts` — buildMessage の finding 注入（D5）を実装と照合
- `src/prompts/spec-review-system.ts` — TC 照合観点 3 点の追加（D6）を確認
- `src/prompts/test-case-gen-system.ts` — 振る舞いレベル指示・責務固定・pipeline 位置（D7）を確認
- `src/kernel/report-result.ts` — FixTarget union に "test-case-gen" 追加（D3-1）を確認
- `tests/unit/core/pipeline/test-case-gen-design-phase.test.ts` — 全実装 TC（21 件）と受け入れ基準の対応を確認
- `bun run typecheck && bun run test` — 765 test files, 11487 tests が green であることを実測確認

## 検証できなかった項目

- in-flight job（awaiting-resume 中の job が新遷移で resume されるケース）は実環境での確認不可（設計上の migration plan は問題なしと確認）

## Findings 詳細

### Finding 1: `specReviewNeedsFixIsTcOnly` が非 canon critical/high finding を考慮しない

**File**: `src/core/pipeline/spec-observation.ts` L128–136  
**Severity**: high / fixable

設計 D4 の定義:
```
nonCanon = findings.filter(critical|high AND file ∉ canonPaths)
return spec.length === 0 && nonCanon.length === 0
```

実装は `specRoutable.length === 0` のみチェックし、`nonCanon` チェックが欠落している。

spec Scenario「TC のみの needs-fix は test-case-gen へ直行する」GIVEN も「非 canon の critical/high finding が無い」を条件として明示している。

**影響**: spec-review が TC finding と非 canon critical/high finding を同時に出すと guard が誤って `true` を返す。その後:
1. test-case-gen 再生成 → spec-review（非 canon finding 残存） → needs-fix
2. `specReviewNeedsFixIsTcOnly` false → spec-fixer（非 canon は書けない）→ approved
3. `specFixerNeedsFixForward`: latest spec-review = needs-fix → true → test-case-gen へ
4. 1 に戻る（SPEC_REVIEW_RETRIES_EXHAUSTED まで繰り返し）

**修正**:
```typescript
const nonCanon = findings.filter(
  (f) => (f.severity === "critical" || f.severity === "high") && !canonScope.canonPaths.has(f.file),
);
return specRoutable.length === 0 && nonCanon.length === 0;
```

TC-028 に「TC + 非 canon critical finding 混在で false」のテストケースを追加すると完全になる。

---

### Finding 2: `TestCaseGenStep.buildMessage` が TC finding のみでなく全 spec-review finding を注入する

**File**: `src/core/step/test-case-gen.ts` L84–88  
**Severity**: medium / fixable

設計 D5: `test-cases.md`（test-case-gen writable set に属す）への finding のみ埋め込む。

実装は `getLatestJudgeFindings` で取得した全 spec-review finding を `buildFindingsBlock` に渡す。
混在ケース（spec-fixer 修正後）では spec.md / design.md への finding（spec-fixer がすでに対処済み）も注入される。

system prompt の write-set 制約（"test-cases.md のみ"）により agent は非 TC finding を無視するため、即時の正確性への影響は低い。ただし設計意図と乖離しており、TC-018 テストも「含まれること」のみ検証し「含まれないこと」は検証していない。

**修正**:
```typescript
const allFindings = getLatestJudgeFindings(state, STEP_NAMES.SPEC_REVIEW);
const canonScope = buildCanonWriteScopeFromState(state);
const tcFindings = allFindings
  ? selectRoutableCanonFindings(allFindings, canonScope, testCaseGenEffectiveFixer)
  : null;
const specReviewFindingsBlock =
  tcFindings && tcFindings.length > 0
    ? buildFindingsBlock(tcFindings, "spec-review")
    : undefined;
```

TC-018 に「spec.md finding が message に含まれないこと」のネガティブケースを追加すると完全になる。

---

### Observation: `test-case-gen.ts` の doc コメントのパイプライン位置が旧モデルのまま

**File**: `src/core/step/test-case-gen.ts` L39  
**Severity**: low（ブロックしない）

```
 * Position in pipeline: spec-review:approved → test-case-gen → implementer
```

`src/prompts/test-case-gen-system.ts` L14 は正しく "design → test-case-gen → spec-review" に更新されている。
task T-08 は `test-case-gen.ts` の doc 更新を明示していたが、`test-case-gen.ts` 側のみ未修正。

---

## 受け入れ基準の充足確認

| 受け入れ基準 | 固定テスト | 状態 |
|---|---|---|
| 通常 type: design → test-case-gen → spec-review → test-materialize | TC-001, TC-002, TC-003 | ✓ |
| needs-fix ループ: spec-fixer → test-case-gen → spec-review | TC-006, TC-007 | ✓ |
| 観察 pass 後 spec-review 再実行なし | TC-010, TC-011 | ✓ |
| 免除 type: design → spec-review 直行 | TC-004, TC-005 | ✓ |
| spec-review 入力に test-cases.md | TC-012 | ✓ |
| spec-review prompt に TC 照合観点 | TC-014 | ✓ |
| test-case-gen prompt に振る舞いレベル指示 | TC-015 | ✓ |
| TC finding → needs-fix（escalation でない） | TC-017, TC-018 | ✓ |
| TC-only needs-fix → test-case-gen 直行 | TC-008 | ✓ |
| 承認後 test-cases.md finding → operator 保護 | TC-019 | ✓ |
| 遷移表 pin テスト更新列挙 | design.md 記載 + gate tests | ✓ |
| typecheck && test green | 実測 (765 files, 11487 tests) | ✓ |
