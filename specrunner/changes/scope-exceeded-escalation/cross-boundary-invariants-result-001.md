# cross-boundary-invariants Review — scope-exceeded-escalation — iter 1

## Summary

既存の決定論的機構（decision-ledger / escalation 導出 / issue-notifier）との結合は概ね正しい。1件の medium 指摘（`verdict:parsed` event の observability gap）と2件の informational を報告する。

- **verdict**: approved

---

## Findings

### F-001 — `verdict:parsed` event の toolResult が scope findings を含まない（medium）

**観点**: `verdict:parsed` event の `toolResult` フィールドと、永続化される `state.steps[step][-1].outcome.toolResult` の一致性という暗黙の不変条件。

**検出箇所**: `src/core/step/executor.ts` line 765

```typescript
this.events.emit("verdict:parsed", {
  step: step.name,
  outcome: {
    verdict,
    toolResult: agentResult?.toolResult ?? null,   // ← scope findings が含まれない
    followUpAttempts: agentResult?.followUpAttempts ?? 0,
  },
});
```

同じ `finalizeStep` 内で `persistToolResult`（scope findings をマージ済み）が `pushStepResult` に渡され、`state.steps[checkpoint][-1].outcome.toolResult` として永続化される。しかし `verdict:parsed` event が emit する `toolResult` は scope findings が追記される前の `agentResult?.toolResult` のまま。

**破られる不変条件**: 本変更以前は「`verdict:parsed.toolResult` == `state.steps[step][-1].outcome.toolResult`」が成立していた。scope breach 発生時はこれが崩れる。

**影響範囲**:
- `pipeline-logger.ts` が JSONL に記録する `verdict:parsed` イベントに scope finding が現れない。スコープ超過による `escalation` verdict が診断ログ上「findings なしで escalation」に見える。
- `progress.ts` が表示する toolResult も同様にずれる。
- ルーティングには影響なし（routing は `verdict` で決まり、`verdict` は正しく `escalation` が set される）。
- `getOpenDecisionFindings` / issue-notifier / decision-ledger はいずれも `state.steps` から直接読むため、正しく scope finding を参照できる。

**修正指針**: `verdict:parsed` emit の `toolResult` を `agentResult?.toolResult` ではなく `persistToolResult` に変更する（1行修正）。

---

### F-002 — `(isJudgeStep || isConformanceStep)` の guard が冗長（low / コード品質）

**検出箇所**: `src/core/step/executor.ts` line 659

```typescript
const isJudgeStep = stepReportTool === JUDGE_REPORT_TOOL
  || stepReportTool === CODE_REVIEW_REPORT_TOOL
  || isConformanceStep;    // ← isConformanceStep を含む

const extraScopeFindings = (isJudgeStep || isConformanceStep)  // ← 冗長
  ? await computeExtraScopeFindings(...)
  : [];
```

`isJudgeStep` が `isConformanceStep` を包含するため、条件式は `isJudgeStep` と等価。機能的には問題なし。将来 `isConformanceStep` が `isJudgeStep` の定義から外れた場合に意図せず挙動が変わるリスクがあるが、現時点では breaking しない。

---

### F-003 — `checkpoint` が非 judge step のとき silent に不活性（informational）

**検出箇所**: `src/core/step/executor.ts` line 659 + `src/core/step/scope-check.ts` line 42–43

将来の profile が `permissionScope.checkpoint: "design"` のような非 judge step を宣言しても、executor の `(isJudgeStep || isConformanceStep)` guard が `false` になるため `computeExtraScopeFindings` は呼ばれず、scope check は silent に不活性。エラーも警告も出ない。

現時点ではいかなる profile も `permissionScope` を宣言しないため実害ゼロ。設計ドキュメント（design.md D1 / D5）に明記されており、利用者への事前告知は十分。本土台では対処不要。

---

## 評価

**不変条件の主軸（ルーティング / escalation / decision-ledger）はいずれも保全されている。**

| 不変条件 | 結果 |
|---|---|
| `decision-needed → escalation` 導出経路が既存ままで通る | ✓ 保全 |
| `computeFindingKey` による decision-ledger key の決定性 | ✓ 保全（title/rationale/file が決定的） |
| `filterUndecidedFindings` による再 escalation 抑止 | ✓ 保全 |
| `getOpenDecisionFindings` が scope finding を返す | ✓ 保全（`persistToolResult` に含まれる） |
| `findings-ledger` に scope finding（decision-needed）が混入しない | ✓ `collectFixableFindings` が fixable のみ収集 |
| `composeReviewerDescriptor` が `permissionScope` を spread で伝播する | ✓ `{ ...base }` に含まれる |
| B-5: `src/core/pipeline/scope.ts` が fs / child_process を import しない | ✓ arch test で固定済み |
| DSM closure: `core/pipeline/` → `core/reviewers/` は同層（diagonal）で許可 | ✓ |
| 既存 profile の挙動が完全一致 | ✓ scope 未宣言で機構が不活性 |
| `verdict:parsed` event の toolResult == persisted toolResult | **✗ F-001（medium）** |

F-001 は routing 正確性に影響しないため、approve を維持する。修正推奨だが blocking ではない。
