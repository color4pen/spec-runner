# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. 現状コードの前提（request.md 記載の 6 点）

- `REQUEST_REVIEW_REPORT_TOOL.zodSchema`（`src/core/step/report-tool.ts:231-242`）— evidence フィールドなし ✓
- `RequestReviewReportResult` インターフェース（`src/core/port/report-result.ts:393-397`）— evidence フィールドなし ✓
- `parseRequestReviewReportInput` — findings 任意・evidence 強制なし ✓
- `deriveRequestReviewVerdict`（`judge-verdict.ts:158-170`）— `(findings, ok)` 2 引数のみ ✓
- `request-review-system.ts` import 行（line 13）— `EVIDENCE_COUNTS_DEFINITION` 未インポート ✓
- `step-completion.ts:146` — `deriveRequestReviewVerdict(undecidedFindings, tr.ok)` 呼び出し（evidence 未渡し） ✓

### 2. 再利用対象の既存資産の存在確認

- `parseEvidence`（`src/core/port/report-result.ts:147-164`）— 非負整数 3 フィールドの hand-written parse、export 済み ✓
- `evidenceSchema`（`src/core/step/report-tool.ts:83-87`）— `object({ checked, skipped, unverified: number() })`、同ファイル内 const ✓
- `EVIDENCE_COUNTS_DEFINITION`（`src/prompts/judge-rules.ts:88-99`）— provider-neutral fragment、export 済み ✓
- `Evidence` 型（`src/kernel/report-result.ts:81-88`）— `port/report-result.ts` で re-export 済み ✓
- `judge-verdict.ts:9` — `import type { ..., Evidence } from ...` 済み（追加 import 不要） ✓
- 永続化スキーマ: `StepOutcome.toolResult`（`state/schema/types.ts:132`）と `StepResultInput.toolResult`（`state/helpers.ts:71`）— 両方とも `evidence?: Evidence` を既に含む ✓

### 3. 設計判断（D1–D7）の整合性

- D1（`evidence?: Evidence` optional 追加）— `JudgeReportResult` の型 optional・parse 必須の二層構造と対称 ✓
- D2（`parseEvidence` 再利用による parse 必須化）— `parseJudgeReportInput` の enforcement 機構と同型 ✓
- D3（`zodSchema` に `optional(evidenceSchema)` 追加）— `toCustomToolSpec` 経由で local/managed 双方に反映 ✓
- D4（vacuous check を `!ok` 直後・blocking 前に挿入）— `deriveJudgeVerdict` の優先順序と対称 ✓
- D5（`step-completion.ts` で evidence 受け渡し・`checked===0` 診断）— conformance/judge 分岐（lines 151-166）と同型 ✓
- D6（`EVIDENCE_COUNTS_DEFINITION` 注入）— 単一ソース原則と整合、文言複製なし ✓
- D7（後方互換）— 型 optional + parse 強制は live call のみ + `evidence===undefined` fallback — 状態スキーマ既対応により追加コード不要 ✓

### 4. spec.md シナリオと実装実現可能性

- parse 必須化（evidence なし reject・負値・非整数 reject・ok=false 免除）— `parseJudgeReportInput` の既存実装をテンプレートに実現可能 ✓
- vacuous check（checked=0 → needs-discussion、checked>0 → approve、undefined → legacy）— `deriveJudgeVerdict` と同型 ✓
- 旧 record 後方互換（evidence なし record の読み取り・resume 正常動作）— スキーマが `evidence?` optional のため追加コード不要 ✓
- prompt 要件（`EVIDENCE_COUNTS_DEFINITION` 含有・複製なし）— TC-016/TC-018 パターンと同型 ✓

### 5. drift-guard 反転対象テストの存在確認

- TC-023（`report-tool-evidence-schema.test.ts`）— `not.toHaveProperty("evidence")` アサートを確認 ✓
- TC-006（`evidence-enforcement.test.ts`）— request-review の `ok:true` で parse 成功アサートを確認 ✓
- TC-018（`evidence-fragment-coverage.test.ts`）— `REQUEST_REVIEW_SYSTEM_PROMPT` が `not.toContain(EVIDENCE_COUNTS_DEFINITION)` アサートを確認 ✓

### 6. e2e fixture 位置確認

- `tests/helpers/pipeline-mock-client.ts:266` — `{ ok: true, verdict: "approve", findings: [] }`（evidence なし）確認 ✓
- `tests/reviewer-activation-e2e.test.ts:155` — 同上確認 ✓
- `tests/custom-reviewers-e2e.test.ts:301` — 同上確認 ✓

## 検証できなかった項目

1. **T-07「追随の監査」の網羅性** — tasks.md が名指しした 3 箇所以外に request-review `ok:true` mock 入力が存在するかを全 test ファイルで走査することは、実装後の test run で初めて確認できる。本レビューでは名指し 3 箇所のみ確認。

2. **`typecheck && test` の green** — 実装前のため検証不可。

## Findings 詳細

### F-001: `buildRequestReviewInitialMessage` の step 6 フォーマットが evidence を未指示

`buildRequestReviewInitialMessage`（`src/prompts/request-review-system.ts:168`）が出力する初期メッセージの step 6 が以下のフォーマットを明示している:

```
6. Report your completion result with { ok: true, findings: [...] }
```

T-05 は `REQUEST_REVIEW_BASE`（システムプロンプト本体）の Completion 節に `EVIDENCE_COUNTS_DEFINITION` を追加することを定めているが、`buildRequestReviewInitialMessage` の step 6 フォーマット文字列の更新は tasks.md のいかなるタスクにも明示されていない。

適用後の不整合:
- システムプロンプト Completion 節: evidence 記入指示あり（`EVIDENCE_COUNTS_DEFINITION` 注入後）
- 初期メッセージ step 6: evidence なし（変更されないまま）

エージェントが初期メッセージ step 6 の形式を優先して evidence を含まない報告をした場合、`parseRequestReviewReportInput` は `{ ok: false, missingFields: ["evidence"] }` を返す。最終的に null-toolResult フォールバック → `needs-discussion` になるため「確認ゼロ approve」という安全上の後退は発生しない。しかし不要な follow-up リトライサイクルが増加し、エスカレーション率が上昇するという信頼性ギャップとなる。

修正: T-05（または T-04）のスコープに `buildRequestReviewInitialMessage` の step 6 フォーマット文字列を更新するサブタスクを追加する。

変更前: `` { ok: true, findings: [...] } ``
変更後: `` { ok: true, findings: [...], evidence: { checked: N, skipped: 0, unverified: 0 } } ``
