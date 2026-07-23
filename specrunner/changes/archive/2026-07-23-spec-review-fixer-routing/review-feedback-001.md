# Review Feedback — spec-review-fixer-routing — Iteration 1

## 検証した項目

| 対象 | 確認方法 |
|------|----------|
| `canon-escalation.ts` | コード精読 — `specReviewEffectiveFixer` / `selectRoutableCanonFindings` の追加、既存 export 無変更を確認 |
| `judge-verdict.ts` | コード精読 — `deriveSpecReviewVerdict` の優先順位 (1→2→3→4a→4b→5→6) が設計 D2 と一致することを確認 |
| `spec-review.ts` | コード精読 — `judgeVerdictFn: deriveSpecReviewVerdict` が `regression-gate.ts` と同型で配線されていることを確認 |
| `step-completion.ts` | diff 精読 — `lastIsConformancePath` が完全除去され `lastCanonResolver` 捕捉方式に置換されたことを確認 |
| 受け入れ基準 × テスト対応 | `test-cases.md` の TC-001〜TC-020 全件と実装テストの対応を突合 |
| テスト実行 (新規) | `bun test src/core/step/__tests__/spec-review-fixer-routing.test.ts` → 45 pass / 0 fail |
| テスト実行 (既存 step) | `bun test src/core/step/__tests__/` → 416 pass / 0 fail（回帰なし） |
| typecheck | `bun run typecheck` → エラーなし |
| CanonWriteScope 整合 | `buildCanonWriteScope` と `makeCanonScope()` fixture の対応を確認（spec-fixer → {spec.md, design.md}、implementer → {tasks.md}、code-fixer → ∅） |
| 補集合性検証 | TC-012 が `routable.length + unroutable.length === canonFixable.length` かつ重複なしを検証していることを確認 |
| 共存優先順位 | TC-004 で request.md（unroutable）+ spec.md（routable）共存時に escalation 優先を確認 |
| drift-proof 検証 | TC-005・TC-006・TC-010・TC-019 で verdict と escalationReason が同一 resolver を参照することを確認 |
| loop 有界性 | TC-009 で maxIterations=2 時に SPEC_REVIEW_RETRIES_EXHAUSTED で停止することを確認 |

## 検証できなかった項目

None

## Findings 詳細

### [low] テストファイル冒頭コメントが実装完了後も RED phase 表記のまま

**File**: `src/core/step/__tests__/spec-review-fixer-routing.test.ts:1–14`

実装前の "RED phase: these tests are intentionally red before implementation" コメントおよび T-01〜T-04 のペンディングタスク列挙が実装完了後も残っている。テスト自体は全件グリーンであり動作に影響はないが、このファイルを後から読む開発者に誤解を与える可能性がある。

---

## テストカバレッジ サマリー

| TC | 優先度 | 結果 |
|----|--------|------|
| TC-001: spec.md medium fixable → needs-fix | must | ✅ |
| TC-002: design.md low fixable → needs-fix | must | ✅ |
| TC-003: request.md fixable → escalation + CANON_FINDING_ESCALATION | must | ✅ |
| TC-004: unroutable + routable 共存 → escalation 優先 | must | ✅ |
| TC-005: spec.md routable → needs-fix かつ escalationReason 未設定 | must | ✅ |
| TC-006: request.md unroutable → escalation + escalationReason（同一 resolver） | must | ✅ |
| TC-007: 非 canon medium fixable → approved | must | ✅ |
| TC-008: decision-needed → escalation | must | ✅ |
| TC-009: loop 有界性 → SPEC_REVIEW_RETRIES_EXHAUSTED | must | ✅ |
| TC-010: code-review が judgeEffectiveFixer を使うことを確認 | must | ✅ |
| TC-011: specReviewEffectiveFixer 常に "spec-fixer" を返す | must | ✅ |
| TC-012: selectRoutableCanonFindings が補集合性を満たす | must | ✅ |
| TC-013: tasks.md / test-cases.md fixable → escalation | must | ✅ |
| TC-014: ok:false → escalation | should | ✅ |
| TC-015: vacuous check (checked=0) → escalation | should | ✅ |
| TC-016: 非 canon critical/high → needs-fix | must | ✅ |
| TC-017: SpecReviewStep.judgeVerdictFn === deriveSpecReviewVerdict（参照一致） | must | ✅ |
| TC-018: ok:false escalation → escalationReason 未設定 | should | ✅ |
| TC-019: conformance が conformanceEffectiveFixer を継続使用 | should | ✅ |
| TC-020: typecheck && test smoke | must | ✅ |

新規テスト: 45 pass / 0 fail  
既存 step テスト: 416 pass / 0 fail（回帰なし）

## 補記

- `lastIsConformancePath` boolean は `step-completion.ts` から完全除去済み。conformance branch が `lastCanonResolver = conformanceEffectiveFixer` を捕捉し、judge branch が `step.name === SPEC_REVIEW ? specReviewEffectiveFixer : judgeEffectiveFixer` を捕捉する設計（D4）を実装が正確に反映している。
- ローカル環境で全体テスト実行時に 1670 件の失敗が見られるが、これは `vi.mocked is not a function`（vitest バージョン不一致）に起因する既存の環境起因の失敗であり、本 branch の変更対象ファイルとは無関係。CI の verification-result.md（iter 1）では 9364 pass / 1 skip を確認。
