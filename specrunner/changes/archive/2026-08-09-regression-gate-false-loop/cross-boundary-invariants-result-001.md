# Cross-Boundary Invariants Review — regression-gate-false-loop

**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Scope**: diff が変更していないコードの暗黙の前提（不変条件）を新しい挙動が黙って破っていないかを検出する

---

## Summary

変更の中核ロジック（`excludeKnownUnfixedRegressions`、`selectFixerTargetFindings`）は設計通りに機能しているが、`step-completion.ts` が gate の **toolResult** を verdict-filtered findings ではなく元の agent 出力のまま persist する点が、`reviewer-chain.ts` の既存遷移表の暗黙前提を破っている。

---

## Finding 1（HIGH / fixable）: regression-gate が「approved + high/fixable toolResult」を返す場合、未変更の遷移条件が secondary loop を起動する

### 観察した不変条件の破綻

`buildParallelReviewerTransitions`（`src/core/pipeline/reviewer-chain.ts:453-465`）に以下の遷移が存在する（変更なし）:

```typescript
// approved + fixable findings → code-fixer
transitions.push({
  step: REGRESSION_GATE_STEP_NAME,
  on: "approved",
  to: STEP_NAMES.CODE_FIXER,
  when: (s) => {
    ...
    const findings = toolResult?.findings ?? [];
    return collectFixableFindings(findings).length > 0;  // toolResult.findings を参照
  },
});
```

同じく `regressionGateActive`（`src/core/pipeline/reviewer-chain.ts:265-279`）も変更なし:

```typescript
if (verdict === "approved") {
  // findings-routing: approved but had fixable findings
  const toolResult = last.outcome.toolResult as {...};
  return collectFixableFindings(toolResult?.findings ?? []).length > 0;
}
```

これらのコードが前提としていた不変条件:

> **「regression-gate が approved を返す場合、toolResult.findings に fixable エントリは存在しない」**

PR 前の世界では `deriveRegressionGateVerdict` が `findings.some(f => f.resolution === "fixable") → needs-fix` であったため、fixable がある限り verdict は "approved" にならなかった。上記 2 箇所は事実上 dead path だった。

### 新しい挙動が破る仕組み

`step-completion.ts:209-218`（新規追加）:

```typescript
let verdictFindings = undecidedFindings;
if (step.name === REGRESSION_GATE_STEP_NAME) {
  const ledger = computeRegressionLedger(reviewerChain, state, canonScope);
  verdictFindings = excludeKnownUnfixedRegressions(undecidedFindings, ledger);
}
verdict = verdictFn(verdictFindings, tr.ok, tr.evidence, canonScope);
lastUndecidedFindings = undecidedFindings;   // pre-exclusion のまま
```

さらに `persistToolResult` は `effectiveToolResult`（`toolResult` の findings をそのまま持つ）で設定される（行 247）。

結果として state に記録されるのは:

```
verdict: "approved"
toolResult: { findings: [{ severity: "high", resolution: "fixable", file:A, line:1, title:T }] }
```

gate agent は ledger の LOW finding に対し `severity: "high", resolution: "fixable"` で退行を報告しており（`regression-gate-system.ts:43-46`）、`excludeKnownUnfixedRegressions` は verdict 導出にのみ作用し、stored toolResult には影響しない。

### 実際の動作シーケンス（LOW known-unfixed が存在する場合）

1. Gate 実行 → agent が `{high, fixable, file:A, line:1, title:T}` を報告
2. `excludeKnownUnfixedRegressions` → `verdictFindings = []`
3. `verdict = "approved"`, `toolResult.findings = [{high, fixable}]` が state に永続化
4. 遷移条件: `collectFixableFindings(toolResult.findings).length > 0` → **true**
5. `regression-gate → approved + fixable → code-fixer` 遷移が発火（設計意図: 発火しないはず）
6. `collectRoutedFixerFindings` Branch 3（gate が active reviewer）: `selectFixerTargetFindings([{high,fixable}])` → `[{high,fixable}]`（high なので除外されない）
7. code-fixer が HIGH finding を受け取り修正を試みる
8. code-fixer approved → `regressionGateActive(state) = true`（verdict=approved + fixable toolResult）→ `code-fixer → approved → regression-gate`
9. gate 再実行 → 同 LOW finding を再報告 → approved（exclusion）→ 手順 4 へ

この secondary loop は:
- code-fixer が変更を加えた場合: `REGRESSION_GATE_MAX_ITERATIONS` まで反復
- code-fixer が no-op の場合: `codeReviewFindingsRoutingActive = false`（gate が active）→ `findingsRoutingApproved = false` → no-op verdict "needs-fix" → `code-fixer → needs-fix` に一致する遷移なし → `"escalate"` → pipeline 停止

設計が意図する動作は「gate approved → conformance へ直行」だが、実際は `approved + fixable → code-fixer` secondary path が介在する。

### 根拠となるコードの場所

| ファイル | 行 | 内容 |
|---------|-----|------|
| `src/core/pipeline/reviewer-chain.ts` | 453-465 | `regression-gate → approved + fixable → code-fixer` 遷移（未変更） |
| `src/core/pipeline/reviewer-chain.ts` | 265-279 | `regressionGateActive` の approved + fixable 判定（未変更） |
| `src/core/step/step-completion.ts` | 209-218 | `excludeKnownUnfixedRegressions` の適用（追加）|
| `src/core/step/step-completion.ts` | 247 | `persistToolResult = effectiveToolResult`（pre-existing、toolResult は生 findings） |

### 修正方針（参考）

選択肢は 2 つ:

**A**: `step-completion.ts` で gate approved 後に `toolResult.findings` から known-unfixed を除いた findings で `persistToolResult` を構築する。遷移条件と `regressionGateActive` が空集合を見る → secondary transition 不発。

**B**: `buildParallelReviewerTransitions` の `regression-gate → approved + fixable → code-fixer` 遷移条件を変更し、`collectFixableFindings` ではなく verdict から判断する（gate が "needs-fix" のみ code-fixer へ）。ただしこれは scope 外（reviewer-chain の遷移構造変更）。

A の方が変更が局所的で scope 内に収まる。`persistToolResult.findings` を `excludeKnownUnfixedRegressions(effectiveFindings, ledger)` でフィルタすることで、stored findings が verdict-affecting findings と一致するようになる。

---

## Finding 2（LOW / fixable）: `lastUndecidedFindings` が pre-exclusion のまま escalation reason 計算に使われる

### 観察した不変条件の破綻

`step-completion.ts:219`:
```typescript
lastUndecidedFindings = undecidedFindings;  // pre-exclusion (known-unfixed low を含む)
```

`escalationReason` 計算（行 348-369）は `lastUndecidedFindings` を使う:
```typescript
const unroutable = selectUnroutableCanonFindings(lastUndecidedFindings, canonScope, lastCanonResolver);
```

gate で escalation が発生した場合（ok=false / decision-needed / canon unroutable）、`lastUndecidedFindings` に含まれる known-unfixed LOW findings が `selectUnroutableCanonFindings` に渡され、LOW finding が canon path 上にある場合は escalation reason に含まれる可能性がある。

### 影響範囲

- verdict === "escalation" のときのみ発動（LOW だけの場合は "approved" になるため通常は無関係）
- gate が decision-needed や canon unroutable で escalation した場合の escalation reason が、verdict に寄与しなかった LOW findings を含む可能性がある
- routing への影響なし（escalation reason は informational only）

### 影響評価

低リスク。escalation reason の冗長化のみ。routing 上の副作用なし。

---

## Checked Items

| 観点 | 確認内容 | 結果 |
|------|---------|------|
| T-01: selectFixerTargetFindings | routing 層 1 箇所での LOW 除外 | ✓ 実装正しい |
| T-02: excludeKnownUnfixedRegressions | fingerprint 照合による gate 判定層での除外 | ✓ 純関数として正しい |
| T-02: computeRegressionLedger | regression-gate.ts の ledger 計算と同一 | ✓ 共有関数化済み |
| T-03: regression-gate-system.ts の ledger 記述 | 「修正した findings」記述の除去 | ✓ 除去確認 |
| T-04: テスト期待値変更 | design.md D4 の 1 件のみ変更 | ✓ TC-FF-C-005 のみ |
| import cycle | findings-ledger → reviewer-chain 循環 | ✓ なし（caller 経由） |
| no-op detection（standard path, LOW only） | `findingsRoutingApproved = true` で escalation 回避 | ✓ 既存挙動 |
| **secondary transition（gate approved + fixable）** | **`collectFixableFindings(toolResult.findings)` が新しく true になる** | **❌ 遷移発火（Finding 1）** |
| **regressionGateActive（approved path）** | **approved + fixable toolResult で true を返す** | **❌ code-fixer ループへ（Finding 1）** |
| `lastUndecidedFindings` pre-exclusion | escalation reason 計算に使用 | △ 低リスク（Finding 2） |
| coordinator / conformance path の scope 限定 | selectFixerTargetFindings 非適用 | ✓ 設計通り |
| deriveRegressionGateVerdict 純関数の無改変 | 既存テスト green | ✓ |
