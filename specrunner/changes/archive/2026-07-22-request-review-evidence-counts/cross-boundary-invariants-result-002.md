# Cross-Boundary Invariants Review — request-review-evidence-counts — iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### レビュー観点

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

### Iter 1 検証済み不変条件の再確認

iter 1 で確認された不変条件 9 件（`isJudgeStep`/`isRequestReviewStep` 排他性、extraScopeFindings 非適用、null-toolResult フォールバック、後方互換、post-verdict finding ref check、他 judge 函数不変、e2e fixture 網羅、evidence 永続化、stderrWrite 誤発火なし）について、iter 2 で追加実装がないことを diff で確認した（`step-completion.ts` diff が 4 行、`judge-verdict.ts` diff が 9 行であり、iter 1 が確認した構造的不変条件は変更されていない）。すべて **PRESERVED**。

---

### 新規確認した不変条件（iter 2）

#### A. `filterUndecidedFindings` と vacuous check の干渉

vacuous check は `tr.evidence?.checked === 0`（生の tool result フィールド）に対して行われ、`filterUndecidedFindings` 適用後の `undecidedFindings` には依存しない。

```javascript
const undecidedFindings = filterUndecidedFindings(step.name, allFindings, state.decisions);
if (tr.evidence?.checked === 0) {
  stderrWrite(...);
}
verdict = deriveRequestReviewVerdict(undecidedFindings, tr.ok, tr.evidence);
```

`state.decisions` が既存 findings を全件 decided にしても vacuous check は火を吐く。これは意図的（「decisions で除外された」と「何も検証していない」は独立した判断）。
→ **不変条件 PRESERVED。**

#### B. `effectiveToolResult` 型キャストと evidence 伝搬

request-review では `extraScopeFindings.length === 0`（常）のため else 分岐を通る:

```javascript
const effectiveToolResult: BaseReportResult & { findings?: Finding[]; evidence?: Evidence } =
  ...
  : (toolResult as BaseReportResult & { findings?: Finding[] });
```

右辺キャストは `evidence` を含まないが、変数型宣言は `{ evidence?: Evidence }` を含み、実体は `RequestReviewReportResult`（evidence を保持）。TypeScript キャストは実行時にフィールドを削除しないため、`persistToolResult.evidence` は正常に保持される。
→ **不変条件 PRESERVED。**

#### C. findings 不正 + evidence 欠落の二重失敗

```javascript
if (result.ok) {
  if ("findings" in obj && obj["findings"] !== undefined) {
    const parsed = parseFindings(obj["findings"], true);
    if (!parsed.ok) {
      return { ok: false, missingFields: ["findings"], rawInput: raw };  // ← 先に返る
    }
  }
  const parsedEvidence = parseEvidence(obj["evidence"]);
  if (!parsedEvidence.ok) {
    return { ok: false, missingFields: ["evidence"], rawInput: raw };
  }
}
```

findings 不正 → evidence チェックより先に return するため、`missingFields: ["findings"]` のみ報告される（evidence は未チェック）。これは `parseJudgeReportInput` と同一パターン（一貫性 PRESERVED）。retry が findings を直すと次回 evidence チェックが通常通り動作する。
→ **不変条件 PRESERVED。**

#### D. `decision-ledger.ts` の evidence フィールド非参照

```typescript
const toolResult = latest.outcome?.toolResult as
  | { findings?: Finding[] }
  | null
  | undefined;
const allFindings: Finding[] = toolResult?.findings ?? [];
```

`findings-ledger` 系（`getStepDecisionFindings`）は `.findings` のみを読み `.evidence` を参照しない。request-review の `evidence` 追加はこの消費者に影響しない。
→ **不変条件 PRESERVED。**

#### E. `buildRequestReviewInitialMessage` ステップ 6 フォーマットの陳腐化（新規指摘）

`buildRequestReviewInitialMessage`（本 PR で変更なし）の ステップ 6:

```typescript
// src/prompts/request-review-system.ts:170（変更なし）
6. Report your completion result with { ok: true, findings: [...] }
```

本 PR 以前: `findings` が ok=true の実質的な新規要求フィールドだったため、このフォーマット例は完全だった。
本 PR 以後: `parseRequestReviewReportInput` が `evidence` を ok=true で必須化したため、このフォーマット例は不完全になった。

エージェントがステップ 6 を文字通りに実行すると `{ ok: true, findings: [...] }` のみ（evidence なし）の tool call になる → parse 失敗 → follow-up retry が `missingFields: ["evidence"]` を提示 → agent が evidence を追加して再実行 → 成功。

runtime 経路上の最終的な正確性は保たれる（parse が enforce し retry が補完）が、**すべての request-review セッションで必ず 1 回余分な round-trip が発生する**。

system prompt（`REQUEST_REVIEW_BASE`）の Completion 節には `EVIDENCE_COUNTS_DEFINITION` が注入済みであり（T-05）、evidence 記入指示は存在する。initial message のステップ 6 例は補助的な位置付けだが、judge 系の initial message が tool call フォーマット例を持たない（spec-review 初期メッセージはフォーマット例を示さない）のと比較して、request-review だけが具体的なフォーマット例を示しており、その例が新規要求を反映していない。

影響: correctness 影響なし（retry 機構が安全網）。usability 影響: 余分 round-trip 1 回。

→ **LOW severity / 非ブロッキング**（iter 1 の N-02「findings description と parse 非対称」と同カテゴリ）。

#### F. Attestation ファイル書き込みと tool call parse 失敗の独立性

attestation ファイルはステップ 6 の tool call より前（ステップ 2 完了後）にファイルシステムへ書き出される。parse 失敗が発生しても attestation は既に on-disk のため、retry がアテステーションの完全性に影響しない。
→ **不変条件 PRESERVED。**

#### G. `EVIDENCE_COUNTS_DEFINITION` の provider-neutral 性

`EVIDENCE_COUNTS_DEFINITION` は `"report_result"` / `"end_turn"` を含まない（コメント付き、`judge-rules.ts:84-86` に明記）。request-review prompt への注入後も provider-neutral 性が維持される。
→ **不変条件 PRESERVED。**

#### H. `ok=false` 時の stderrWrite 誤発火（iter 1 との相違確認）

`parseRequestReviewReportInput` は `if (result.ok)` ブロック内でのみ `result.evidence` を設定する。`ok=false` ケースでは `tr.evidence` は undefined のまま。よって `tr.evidence?.checked === 0` は `undefined === 0` → false → stderrWrite 誤発火なし。これは iter 1 の項目 9 で確認済みだが、diff が 4 行の追加のみである点を再確認した。
→ **不変条件 PRESERVED。**

---

## 検証できなかった項目

なし。

---

## Findings 詳細

### F-001（LOW）: `buildRequestReviewInitialMessage` ステップ 6 フォーマット例に evidence が未反映

| 属性 | 値 |
|------|-----|
| ファイル | `src/prompts/request-review-system.ts` |
| 行 | 170 |
| severity | low |
| resolution | fixable |

**観測された不変条件の破れ**: `buildRequestReviewInitialMessage` は本 PR で変更されておらず、ステップ 6 を `{ ok: true, findings: [...] }` と示す。本 PR で `parseRequestReviewReportInput` が `evidence` を ok=true で必須化したため、この例を文字通りに実行するとすべての request-review セッションで parse 失敗が生じ、1 回余分な retry が強制される。

**安全網**: system prompt Completion 節に `EVIDENCE_COUNTS_DEFINITION` が注入済みのため、retry 後はエージェントが evidence を含める。correctness への影響なし。

**修正案**: ステップ 6 のフォーマット例に `evidence` を追加するか、フォーマット例を system prompt に一本化してステップ 6 から削除する。

---

## 注記事項（非ブロッキング）

### N-01（再掲）: `VERDICT_BLOCKING_RULES` の request-review スコープでの不正確さ（pre-existing、変更なし）

iter 1 の N-01 を再掲。本 PR で変更なし。

### N-02（再掲）: `findings` description と parse 非対称（pre-existing、変更なし）

iter 1 の N-02 を再掲。F-001 はこれと同カテゴリの新規指摘。
