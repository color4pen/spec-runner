# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Tasks（完了確認）

tasks.md の全チェックボックスが [x] であることを確認した。T-01〜T-06 全タスク完了済み。

### Design Decisions

| ID | 実装箇所 | 確認内容 |
|----|---------|---------|
| D1 | `canon-escalation.ts:56` | `specReviewEffectiveFixer: () => "spec-fixer"` — 常に spec-fixer を返す 1-line const。既存 `judgeEffectiveFixer` / `conformanceEffectiveFixer` と同節に配置。 |
| D2 | `judge-verdict.ts:84-106` | `deriveSpecReviewVerdict` の判定順: 1.ok=false 2.vacuous 3.decision-needed 4a.unroutable→escalation 4b.routable→needs-fix 5.critical\|high→needs-fix 6.approved。4a が 4b より前に評価されることを確認。 |
| D3 | `spec-review.ts:71` | `judgeVerdictFn: deriveSpecReviewVerdict` を SpecReviewStep に追加。`reportTool: JUDGE_REPORT_TOOL` は変更なし（isJudgeStep 判定・canonScope 第4引数渡しが維持される）。 |
| D4 | `step-completion.ts:157,192,208-210,314` | `lastIsConformancePath` boolean を廃止し `lastCanonResolver` で置換。conformance branch → `conformanceEffectiveFixer` を捕捉、judge branch → `spec-review` なら `specReviewEffectiveFixer` それ以外なら `judgeEffectiveFixer` を捕捉。escalationReason 計算は `lastCanonResolver` を直接使用。単一選択点による drift 構造排除を確認。 |
| D5 | `types.ts:234` | 遷移表に変更なし（コメントのみ更新）。`spec-review needs-fix → spec-fixer` / `spec-fixer approved → spec-review` のエッジは既存のまま。 |
| D6 | design.md / tasks.md | ADR path の記載なし。adr-gen に委任済み。 |

### Spec Requirements（全 Scenario 確認）

**Req 1: spec-fixer-writable canon file への fixable finding を severity 非依存で needs-fix に routing する**

- Scenario「medium fixable on spec.md → needs-fix」: TC-001 で `deriveSpecReviewVerdict` の返り値 `needs-fix` を確認済み。
- Scenario「low fixable on design.md → needs-fix」: TC-002 で確認済み。
- `STANDARD_TRANSITIONS` に `spec-review + needs-fix → spec-fixer` 行が存在することも TC-001 で動的 import + find で確認済み。

**Req 2: spec-fixer が書けない canon file への fixable finding は escalation かつ escalationReason 設定**

- Scenario「fixable on request.md → escalation + CANON_FINDING_ESCALATION」: TC-003 で `deriveStepCompletion` 経由の verdict と escalationReason を確認済み。
- Scenario「unroutable と routable 共存時 → escalation 優先」: TC-004 で確認済み。

**Req 3: verdict 導出と escalationReason 計算が同一 resolver を参照する**

- Scenario「routable spec.md finding → needs-fix ∧ escalationReason 未設定」: TC-005 で確認済み。
- Scenario「unroutable request.md finding → escalation ∧ escalationReason 設定」: TC-006 で確認済み。
- drift-guard: `lastCanonResolver` が verdict 導出地点で捕捉され、escalationReason 計算もこれを使う単一選択点構造。TC-018（ok:false → escalationReason 未設定）・TC-019（conformance 経路では conformanceEffectiveFixer が使われる）で確認済み。

**Req 4: 非 canon finding の既存挙動を保持**

- TC-007: medium fixable on `src/example.ts` → approved ✅
- TC-008: decision-needed → escalation ✅
- TC-014: ok:false → escalation ✅
- TC-015: vacuous check (checked=0) → escalation ✅
- TC-016: critical/high on non-canon → needs-fix ✅

**Req 5: loop が既存 exhaustion 上限で有界**

- TC-009: maxIterations=2 で `SPEC_REVIEW_RETRIES_EXHAUSTED` / `status: awaiting-resume` に落ちることを Pipeline 統合テストで確認済み。CODE_REVIEW_RETRIES_EXHAUSTED 等の他コードが出ないことも確認。

**Req 6: 他ステップの verdict 導出挙動は変更なし**

- `deriveJudgeVerdict` / `deriveConformanceVerdict` / `deriveRegressionGateVerdict` / `deriveRequestReviewVerdict` — git diff で変更なし（追加のみ）を確認。
- TC-010: code-review + fixable on spec.md → escalation（judgeEffectiveFixer が使われる。specReviewEffectiveFixer が誤って使われると needs-fix になるため、escalation は正しい resolver の証拠）。
- TC-019: conformance + fixable on spec.md（fixTarget:code-fixer）→ escalation（conformanceEffectiveFixer が使われる）。

### Acceptance Criteria（request.md）

| AC | テスト | 結果 |
|----|-------|------|
| spec.md medium fixable → needs-fix ∧ spec-fixer に到達 | TC-001 | ✅ |
| request.md fixable → escalation ∧ escalationReason に CANON_FINDING_ESCALATION | TC-003, TC-006 | ✅ |
| verdict 導出と escalationReason 計算が同一 resolver（drift-guard） | TC-005, TC-006, TC-018, TC-019 | ✅ |
| spec-review→spec-fixer 反復が既存 exhaustion 上限で有界 | TC-009 | ✅ |
| judge / conformance / regression-gate / request-review の既存テストが無変更で green | 9364 tests passed | ✅ |
| typecheck && test が green | typecheck clean, 9364 tests pass | ✅ |

### スコープ外への変更がないことの確認

git diff main...HEAD で変更されたソースファイルは以下のみ:

- `src/core/step/canon-escalation.ts` — 新規 export 追加（既存関数変更なし）
- `src/core/step/judge-verdict.ts` — `deriveSpecReviewVerdict` 追加（既存関数変更なし）
- `src/core/step/spec-review.ts` — `judgeVerdictFn` フィールド追加
- `src/core/step/step-completion.ts` — `lastIsConformancePath` → `lastCanonResolver` 置換
- `src/core/step/__tests__/spec-review-fixer-routing.test.ts` — 新規テストファイル
- `src/core/pipeline/types.ts` — コメント更新のみ
- `src/core/pipeline/run.ts` — コメント更新のみ

遷移表のエッジ・loopNames・loopFixerPairs・spec-fixer 書込集合・finding 網羅性・stale ファイル掃除への変更はなし。

### TC-017（配線 identity テスト）

`SpecReviewStep.judgeVerdictFn === deriveSpecReviewVerdict` の参照一致を TC-017 で固定済み。

### `typecheck && test`

- `bun run typecheck` → clean
- `bun run test` → 631 test files passed, 9364 passed, 1 skipped

## 検証できなかった項目

None。

## Findings 詳細

None。
