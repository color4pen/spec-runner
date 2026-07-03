# Cross-Boundary Invariants Review — verdict-fidelity-and-fixer-noop

## Reviewer

cross-boundary-invariants — diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

## Scope

`git diff main...HEAD --stat` によると実装変更の中心は以下:

- `src/core/step/judge-verdict.ts` — `deriveRegressionGateVerdict` 追加
- `src/core/port/step-types.ts` — `judgeVerdictFn`, `noOpDetect` フィールド追加
- `src/core/step/regression-gate.ts` — `judgeVerdictFn: deriveRegressionGateVerdict` wire
- `src/core/step/executor.ts` — `judgeVerdictFn` ディスパッチ / no-op 検出 / `verdictOverride`
- `src/core/step/no-op-detect.ts` — no-op 検出ロジック（新規）
- `src/core/step/code-fixer.ts` — `noOpDetect: true` 追加
- `src/core/port/report-result.ts` — `parseRequestReviewReportInput` findings 省略許容
- `src/core/pipeline/pipeline.ts` — `resolveMaxIterations` 呼び出し修正
- `src/core/archive/orchestrator.ts` — drafts 存在確認追加

---

## Findings

### F1 — MEDIUM | `verdictOverride` が producer の `"error"` 信号を無条件に上書きする

**ファイル**: `src/core/step/executor.ts` (L852-855)

**変更していないコードの前提**:  
producer step が `report_result` を `{ status: "error" }` で呼んだ場合、executor は `verdict = "error"` を記録し、pipeline はこれを escalation / error ルートへ渡す（producer の明示的な失敗宣言は尊重される）。

**新しい挙動が破る場所**:

```typescript
// executor.ts L852-855
if (agentResult?.verdictOverride !== undefined) {
  verdict = agentResult.verdictOverride;   // ← 無条件上書き
}
```

`verdictOverride = "needs-fix"` は `verdict = "error"` も上書きする。design.md D3 の記述は「`approved` を上書き」だが、実装は任意の verdict に適用される。

**発生経路**:

1. code-fixer が `completionReason === "success"` で完了（agent session は正常終了）
2. agent が `report_result({ status: "error" })` を呼ぶ（修正不能を明示）
3. `detectNoOp` が発火：ソースファイル変更ゼロ → `noOpVerdictOverride = "needs-fix"`
4. `finalizeStep` 内で `verdict = "error"` が導出された後、`verdictOverride` で `"needs-fix"` に上書き
5. 本来 escalation / error ルートへ行くべきジョブが code-review → code-fixer ループに戻る

**影響**: 「code-fixer が何もできないと報告した場合は escalation」という運用上の安全弁が効かなくなる。上限 iteration まで空振りループした後に halt。

**修正案**:

```typescript
// verdictOverride は "approved"/"success" のときのみ適用する
if (agentResult?.verdictOverride !== undefined && verdict !== "error") {
  verdict = agentResult.verdictOverride;
}
```

---

### F2 — LOW | regression-gate の LOW/MEDIUM fixable finding は `verifyFindingRefs` をスキップする

**ファイル**: `src/core/step/executor.ts` (L808-820) ／ `src/core/step/judge-verdict.ts` (L17-21)

**変更していないコードの前提**:  
judge step が `"needs-fix"` を返す場合、その原因となった finding の file/line 参照は `verifyFindingRefs` で実在確認され、無効 ref は verdict を `"escalation"` に差し替えることで「存在しない場所への修正ループ」を防ぐ。

**新しい挙動が破る場所**:

`deriveRegressionGateVerdict` は severity 不問で `resolution === "fixable"` を `"needs-fix"` の根拠にするが、`verifyFindingRefs` で使われる `collectVerdictAffectingFindings` は `critical|high OR decision-needed` のみを対象とする:

```typescript
// judge-verdict.ts L17-21
export function collectVerdictAffectingFindings(findings: Finding[]): Finding[] {
  return findings.filter(
    (f) => f.severity === "critical" || f.severity === "high" || f.resolution === "decision-needed",
  );
}
```

結果: regression-gate が `{ severity: "medium", resolution: "fixable" }` finding で `"needs-fix"` を返した場合、その finding の file/line は validated されないまま code-fixer に渡る。

**影響**: 軽微（regression-gate の ledger は先行レビューで検証済みの finding のみ含む）。ただし regression-gate agent が ledger 外の finding を hallucinate した場合、ref validation なしでループが発生する。

**対処**: 現状のリスクは低いが、将来的に `collectVerdictAffectingFindings` を `fixable` も含むよう拡張するか、regression-gate の `judgeVerdictFn` で返した finding も `verifyFindingRefs` の対象に含める設計を検討する。本 iteration では blocking としない。

---

### F3 — LOW | no-op で needs-fix を記録した後、次 iteration で `isFixerContinuation` が true になる

**ファイル**: `src/core/step/executor.ts` ／ `src/core/step/code-fixer.ts` / `fixer-helpers.ts`

**変更していないコードの前提**:  
`isFixerContinuation` は「code-fixer が過去に run した場合に continuation short-prompt を使う」という前提で動く。continuation prompt は「前回 session のコンテキストを引き継いで続行」の文脈で書かれている。

**新しい挙動が破る場所**:  
no-op で `"needs-fix"` が記録されると `state.steps["code-fixer"]` に step run が積まれる。次 iteration で `isFixerContinuation(state, STEP_NAMES.CODE_FIXER)` は true を返し、continuation short-prompt が送出される。しかし前回 session は「何もしなかった session」であり、continuation の文脈が成立しない。

**影響**: 同一の no-op ループが continuation prompt で繰り返され、exhaustion まで消費される可能性がある。exhaustion ガードで halt に収束するため無限ループはしないが、iteration を無駄に消費する。

**対処**: blocking としないが、no-op 検出時に `sessionId` を state に残さない（または continuation 判定で prior verdict が `"needs-fix"` の場合を除外する）設計が望ましい。

---

## 境界不変条件チェック（問題なし）

以下は念のため確認したが、既存不変条件を破らないことを確認した:

| チェック対象 | 結論 |
|---|---|
| `verifyFindingRefs` → `verdictOverride` の順序 | `verifyFindingRefs` は judge step のみ（code-fixer は producer）。競合なし |
| `judgeVerdictFn` と `filterUndecidedFindings` の順序 | decision ledger フィルタ後に `judgeVerdictFn` を適用。正しい |
| `listChangedFiles` の二重呼び出し（activation + no-op） | code-fixer に `activation` は未設定。競合なし |
| `deriveJudgeVerdict` のグローバル挙動 | `judgeVerdictFn` 未設定の step は従来通り `deriveJudgeVerdict` を使用。変化なし |
| `parseRequestReviewReportInput` の findings=undefined 伝播 | executor は `tr.findings ?? []` で null-guard 済み。変化なし |
| `verdictOverride` と `verdict:parsed` の発火順 | override 後に `verdict:parsed` 発火。コンソール表示に正しい verdict が伝わる |
| `resolveMaxIterations` の呼び出し side-effect | 純粋計算（`maxIterationsByStep[name] ?? maxIterations`）。副作用なし |
| archive drafts 存在確認と `fs.exists` の注入 | `FinishFs` インターフェースに定義済み、テストで mock 可能。問題なし |

---

## 総合判定

- **verdict**: needs-fix

**理由**: F1 は specification と実装の乖離（design.md の "approved を上書き" vs 実装の無条件上書き）であり、producer step の明示的な failure signal（`status: "error"`）が黙って `"needs-fix"` に差し替えられる。ループを消費して halt する挙動を引き起こす可能性があり、修正が必要。

F2・F3 は exhaustion ガードと ledger 構造で実害を限定できるため、本 iteration では non-blocking として扱う（次 iteration で対処可）。
