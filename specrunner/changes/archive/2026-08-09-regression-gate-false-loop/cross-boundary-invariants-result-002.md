# Cross-Boundary Invariants Review — regression-gate-false-loop

**Reviewer**: cross-boundary-invariants  
**Iteration**: 2  
**Scope**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する

---

## Summary

Iteration 1 で HIGH として指摘した「`persistToolResult` が未フィルタのまま state に永続化され、既存遷移条件が secondary loop を起こす」問題は、今回の実装（`step-completion.ts:253-260`）で正しく修正されている。`regression-gate → approved + fixable → code-fixer` 遷移は known-unfixed low のみの場合に発火しなくなり、`regressionGateActive` も false を返す。

残存する問題は 2 件いずれも LOW 留まりで、主目的（false loop の解消）への影響なし。

---

## Finding 1 from Iteration 1 — RESOLVED ✓

### 確認内容

`step-completion.ts:253-260`（新規追加）:

```typescript
if (step.name === REGRESSION_GATE_STEP_NAME && isJudgeStep && persistToolResult !== null) {
  const rChain = deriveImplReviewerChain(state);
  const rLedger = computeRegressionLedger(rChain, state, canonScope);
  persistToolResult = {
    ...persistToolResult,
    findings: excludeKnownUnfixedRegressions(persistToolResult.findings ?? [], rLedger),
  };
}
```

`persistToolResult.findings` を `excludeKnownUnfixedRegressions` でフィルタすることで、state に永続化される `toolResult.findings` から known-unfixed low エントリが除去される。これにより:

- `reviewer-chain.ts:453-465`（`regression-gate → approved + fixable → code-fixer` 遷移）の `when` 条件:
  `collectFixableFindings(toolResult.findings).length > 0` → `false`（フィルタ後は空）→ 遷移不発 ✓
- `reviewer-chain.ts:265-279`（`regressionGateActive`）:
  `verdict === "approved"` 分岐で `collectFixableFindings(toolResult.findings).length > 0` → `false` → `regressionGateActive = false` ✓
- `buildParallelReviewerTransitions` の Priority 2: `regressionGateActive(s)` → `false` → code-fixer は regression-gate に戻らない ✓

Finding 1 は完全に解消されている。

---

## Finding 2 from Iteration 1 — PERSISTS (LOW, scope-appropriate)

### 状態

`step-completion.ts:219`:
```typescript
lastUndecidedFindings = undecidedFindings;  // pre-exclusion（known-unfixed low を含む）
```

`verdictFindings`（`excludeKnownUnfixedRegressions` 適用後）ではなく `undecidedFindings`（適用前）が `lastUndecidedFindings` に格納されたまま。

`escalationReason` 計算（行 360-382）が `lastUndecidedFindings` を参照するため、regression-gate が escalation を返すとき、verdict に寄与しなかった LOW finding が `selectUnroutableCanonFindings` に渡される可能性がある。

### 影響評価

- verdict === "escalation" のときのみ発動。known-unfixed LOW のみの場合は verdict = "approved" であり通常通過。
- gate が escalation するのは `ok=false` / `checked=0` / `decision-needed` / finding-ref override のとき → 全ケースで `isCanonEscalation = false`（各 guard が false を返す）となり escalationReason は計算されない。
- 唯一問題になりうるのは: gate が `ok=true`、checked>0、decision-needed なし、finding-ref override なし で escalation するケース → 現状 `deriveRegressionGateVerdict` にはこのルートは存在しない（返り値は approved / needs-fix / escalation のうち、最後者は上記条件によるもののみ）。
- routing への副作用なし（escalationReason は informational only）。
- 低リスク。

---

## Finding 3 — NEW (LOW): `verifyFindingRefs` が `effectiveToolResult`（未フィルタ）を参照する

### 観察した不変条件の破綻

`step-completion.ts:246-269` の構造:

```typescript
// 行 247: persistToolResult = effectiveToolResult（同一オブジェクト参照）
// 行 253-260: persistToolResult = { ...persistToolResult, findings: filtered }  ← spread で新規オブジェクト
//             effectiveToolResult は変更されない

// 行 269（verifyFindingRefs ブロック）:
const tr = effectiveToolResult as JudgeReportResult | ...;  // ← 未フィルタのまま
const allFindings = tr.findings ?? [];  // known-unfixed low（gate 報告: high/fixable）を含む
const undecidedFindings = filterUndecidedFindings(step.name, allFindings, state.decisions);
const affectingFindings = collectVerdictAffectingFindings(undecidedFindings);
// affectingFindings は high/fixable を含む（gate は全退行を high で報告）
// → known-unfixed finding の file ref が verifyFindingRefs に渡される
```

`verifyFindingRefs` が持っていた暗黙の前提:

> **「`effectiveToolResult.findings` に含まれる findings は全て verdict 導出に使われたものである」**

この前提が regression-gate の新規挙動で破られる。`verdictFindings` から除外された known-unfixed low findings（gate では high/fixable として報告）が `effectiveToolResult` に残り、`verifyFindingRefs` のチェック対象になる。

### 実際の影響

- **通常ケース（対象ファイルが存在する）**: known-unfixed finding は実在するコードファイルを指すため、file ref チェックは通過。verdict は "approved" のまま。影響なし。
- **edge ケース（当該ファイルが削除済み）**: `verifyFindingRefs` が "not found" を検出し `verdict = "escalation"` にオーバーライドされる。ただし本 PR 適用前も同ファイルが削除されていれば: 旧システムは `verdict = needs-fix` → finding-ref check → `escalation`（同じ最終結果）。行動は一致。
- **loop への影響なし**: finding-ref 起因の escalation は `verdictOverriddenByFindingRef = true` になりループを起こさない。

### 根拠となるコードの場所

| ファイル | 行 | 内容 |
|---------|-----|------|
| `src/core/step/step-completion.ts` | 253-260 | `persistToolResult.findings` を filtered に更新 |
| `src/core/step/step-completion.ts` | 269 | `const tr = effectiveToolResult` — filtered と乖離した参照 |
| `src/core/step/step-completion.ts` | 281,299 | `verifyFindingRefs` — effectiveToolResult findings で file ref 検証 |

### 修正方針（参考）

行 269 で `effectiveToolResult` の代わりに `persistToolResult` を参照することで `verifyFindingRefs` が verdict-relevant findings のみをチェックするようになる。ただし `persistToolResult` は nullable 型であるため null ガードが必要:

```typescript
// 現在: const tr = effectiveToolResult as ...;
// 修正: const tr = (persistToolResult ?? effectiveToolResult) as ...;
```

これにより known-unfixed low findings（`persistToolResult.findings` から除去済み）は `affectingFindings` に現れなくなる。

---

## Acceptance Criteria 確認

| 基準 | 確認結果 |
|------|---------|
| `grep -rn "Ignore LOW severity" src/` が 0 件 | ✓ 0 件確認（テスト TC-006 で固定済み） |
| regression-gate-system.ts に「修正した findings」記述なし | ✓ 除去確認。「reviewer が指摘した fixable findings 全件（修正済みとは限らない）」に修正済み |
| regression-gate.ts `buildLedgerBlock` の虚偽文言 | ✓ 修正済み。"The following findings were fixed" → "identified by reviewers … Not all may have been fixed" |
| approved + low fixable → gate が needs-fix を返さない | ✓ `excludeKnownUnfixedRegressions` + `persistToolResult` alignment で担保 |
| 既知でない fixable finding → gate が needs-fix を返す | ✓ `deriveRegressionGateVerdict` は変更なし、medium以上はフィルタ対象外 |
| 期待値変更した既存テスト = design.md D4 の 1 件のみ | ✓ TC-FF-C-005 のみ（fixer-findings.test.ts） |
| typecheck && test が green | ✓ verification-result-001.md で confirmed |

---

## Checked Items

| 観点 | 確認内容 | 結果 |
|------|---------|------|
| Finding 1 from Iter 1 解消確認 | `persistToolResult.findings` alignment の実装 | ✓ 解消済み |
| 遷移条件 `regression-gate → approved + fixable → code-fixer` | フィルタ後は発火しないか | ✓ 不発 |
| `regressionGateActive` approved 分岐 | フィルタ後の findings で false を返すか | ✓ false |
| `verifyFindingRefs` パス | `effectiveToolResult`（未フィルタ）参照の維持 | △ Finding 3（LOW） |
| `lastUndecidedFindings` pre-exclusion | escalationReason へのリスク | △ Finding 2 carryover（LOW） |
| `computeRegressionLedger` の二重計算 | 判定層と persist 層で同一 ledger を使用 | ✓ 同一（pure function） |
| `selectFixerTargetFindings` routing 一元化 | code-fixer.ts 全 5 変種から "Ignore LOW" 除去 | ✓ 除去確認 |
| conformance/coordinator path scope 限定 | `selectFixerTargetFindings` 非適用 | ✓ 設計通り |
| import cycle | `findings-ledger.ts` → `reviewer-chain.ts` 循環 | ✓ なし（caller 経由） |
| `deriveRegressionGateVerdict` 純関数無改変 | 既存テスト green | ✓ |
| medium 残存ループリスク | known risk（design.md Risks に明記） | △ non-goal、scope 外 |
