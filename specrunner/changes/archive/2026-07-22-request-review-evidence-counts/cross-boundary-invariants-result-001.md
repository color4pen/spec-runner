# Cross-Boundary Invariants Review — request-review-evidence-counts — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### レビュー観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

### 検証した不変条件リスト

#### 1. `isJudgeStep` と `isRequestReviewStep` の排他性（step-completion.ts:120–124）

```
const isJudgeStep =
  stepReportTool === JUDGE_REPORT_TOOL ||
  stepReportTool === CODE_REVIEW_REPORT_TOOL ||
  isConformanceStep;
const isRequestReviewStep = stepReportTool === REQUEST_REVIEW_REPORT_TOOL;
```

`REQUEST_REVIEW_REPORT_TOOL` は `JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` / `CONFORMANCE_REPORT_TOOL` とは別物のため、両フラグが同時に true になることはない。
→ **変更後も同一オブジェクト参照が使われていることを確認（変更なし）。不変条件 PRESERVED。**

#### 2. `computeExtraScopeFindings` が request-review に適用されないこと

```javascript
const extraScopeFindings = (isJudgeStep || isConformanceStep)
  ? await computeExtraScopeFindings(...)
  : [];
```

`isRequestReviewStep` は `isJudgeStep | isConformanceStep` に含まれないため、request-review には scope finding が合成されない。この行は本 PR で変更されていない。
→ **不変条件 PRESERVED。**

#### 3. null-toolResult フォールバックが request-review → needs-discussion を維持すること

```javascript
} else {
  // Null toolResult (no-tool-call proceed path)
  if (isRequestReviewStep) {
    verdict = "needs-discussion";
  }
```

この経路は本 PR で変更されていない。
→ **不変条件 PRESERVED。**

#### 4. 後方互換：永続 record の evidence 欠落は再評価されないこと

`parseRequestReviewReportInput` は live tool call の入力にのみ適用される。永続 record の読み取り（`getLatestStepResult`）は parse を経由しない。`RequestReviewReportResult` の `evidence?` は optional 型のため、旧 record のデシリアライズ時に型エラーが起きない。
→ TC-009 / TC-010 が この経路を coverage。**不変条件 PRESERVED。**

#### 5. post-verdict finding ref verification が request-review にも適用されること

```javascript
if ((isJudgeStep || isRequestReviewStep) && deps.runtimeStrategy) {
```

この行は本 PR で変更されていない。request-review の blocking findings に存在しないファイル参照があると verdict が "escalation" に上書きされる（既存挙動）。
→ **不変条件 PRESERVED。**

#### 6. `deriveJudgeVerdict` / `deriveConformanceVerdict` / `deriveRegressionGateVerdict` が変更されていないこと

`judge-verdict.ts` diff を確認。`deriveRequestReviewVerdict` のみ変更。他の判定関数は一行も変更されていない。
→ **不変条件 PRESERVED。**

#### 7. e2e / integration fixture の網羅的追随

以下の ok=true request-review 入力が evidence なしで parse 失敗するリスクを確認:

- `tests/helpers/pipeline-mock-client.ts:268` — `evidence: { checked: 5, ... }` 追加済み ✓
- `tests/reviewer-activation-e2e.test.ts:157` — 追加済み ✓
- `tests/custom-reviewers-e2e.test.ts:303` — 追加済み ✓
- `tests/unit/core/port/report-result-findings.test.ts` — ok=true 系全ケースに evidence 追加済み ✓
- `tests/unit/core/port/report-result-observations.test.ts` — 同上 ✓

テスト全体検索（`ok.*true.*verdict.*approve` を evidence なしで含む箇所）: 0 件。網羅的。
→ **e2e 退行リスク NONE。**

#### 8. evidence の persistToolResult への伝搬

`step-completion.ts` の request-review 分岐で `extraScopeFindings.length > 0` は常に false（scope finding は計算されない）。このため:

```javascript
const effectiveToolResult = (toolResult as BaseReportResult & { findings?: Finding[] });
```

この型キャストは `BaseReportResult & { findings?: Finding[]; evidence?: Evidence }` 型の変数に代入されるが、`evidence?` は optional のため TypeScript 上も問題なし。実行時は `toolResult` の実体が `RequestReviewReportResult`（evidence を保持）であるため spread で evidence は保持される。TC-020 がこの経路を coverage。
→ **不変条件 PRESERVED。**

#### 9. 診断 stderrWrite のトリガー条件

```javascript
if (tr.evidence?.checked === 0) {
  stderrWrite(`...`);
}
verdict = deriveRequestReviewVerdict(undecidedFindings, tr.ok, tr.evidence);
```

`tr.evidence` は `parseRequestReviewReportInput` の `ok=false` 分岐では設定されない（parse 内の evidence 必須化は `if (result.ok)` ブロック内）。したがって `ok=false` 時に stderrWrite が誤発火することはない。
→ **不変条件 PRESERVED。**

---

## 検証できなかった項目

なし（すべての不変条件について実装・テストの確認を完了）。

---

## 注記事項（非ブロッキング）

### N-01: `VERDICT_BLOCKING_RULES` fragment は request-review における critical/high の verdict を誤記する

`judge-rules.ts:114–118` の共有 fragment（本 PR で変更なし）:

```
- `critical` または `high` ≥ 1 → `needs-fix`
```

これは judge 系 step では正確だが、`request-review-system.ts` に inject されると不正確になる。`deriveRequestReviewVerdict` は critical/high を `needs-discussion`（not `needs-fix`）にマップする。また、同ファイル L98 のインライン記述も同様に `needs-fix` と記載している。

影響: agent-declared `verdict` フィールドは CLI ルーティングに使われない（本 PR 変更なし）。エージェントが `verdict: "needs-fix"` を result file に書いても、CLI の verdict 導出は findings から行われ、routing は変わらない。**runtime 影響なし。**

本 PR の変更範囲外（既存の不正確さ）であり、blocking 指摘とはしない。

### N-02: `REQUEST_REVIEW_REPORT_TOOL.description` における findings の記述と parse 動作の非対称

description は "REQUIRED when ok=true: provide a 'findings' array" と記述するが、`parseRequestReviewReportInput` は findings 欠落を受理する（findings は任意）。evidence は description も parse も必須で一致。この非対称は本 PR で変更なし。

影響: agents は description を読み findings を含める方向に誘導される。含めなくても parse は通る。evidence との違いを混同するリスクがあるが、runtime behavior の変化はなし。**runtime 影響なし。**

本 PR はこの pre-existing 非対称を修正していないが、scope 内の変更（evidence 必須化）は正確に実装されている。

---

## Findings 詳細

blocking 指摘なし。上記 N-01 / N-02 はいずれも pre-existing かつ runtime 影響なしのため、typed findings として報告しない。
