# Code Review Feedback — finding-provenance-carry — iteration 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

| ファイル | 確認内容 |
|---------|---------|
| `src/kernel/report-result.ts` | `Finding.ledgerRef?: string` の additive 追加、doc comment の内容 |
| `src/core/step/report-tool.ts` | `findingSchema` / `conformanceFindingSchema` 両方に `ledgerRef: optional(string())` 追加（additive）。`JUDGE_REPORT_TOOL` オブジェクト identity が変更されていないことを確認 |
| `src/core/port/report-result.ts` | `parseFindings` の `ledgerRef` キャプチャ（L238）: `typeof f["ledgerRef"] === "string"` のみ捕捉、非文字列・null・absent は silent ignore で `missingFields` に追加されない |
| `src/core/pipeline/findings-ledger.ts` | `computeLedgerRef`（SHA-256 先頭8 hex chars、fingerprint 依存、position 非依存）、`buildProvenanceIndex`（spec-review + impl chain 全 StepRun を走査、first-occurrence-wins per step）、`collectSpecReviewLedger` に `filterUndecidedFindings` 追加（L156）|
| `src/core/decision/wontfix.ts` | `resolveWontfixDispositions` の ref ベース解決ロジック全体、invalid-input 全ブランチの維持確認、DispositionDecisionRecord shape が既存と同一 |
| `src/core/step/regression-gate.ts` | `buildLedgerEntry` の Provenance Ref 行（L57）、`buildLedgerBlock` の echo 指示文、空 ledger パスは ref を含まない |
| `src/prompts/regression-gate-system.ts` | `ledgerRef` verbatim echo 指示、findings フォーマット例の `"ledgerRef": "1a2b3c4d"` サンプル。system prompt スコープ（共有 tool description には含まれない）|
| `tests/unit/core/decision/wontfix.test.ts` | TC-005/006/007/008/009/010/011/012/014/015/018/019/020/021 の実装確認。input validation テスト（TC-006/007/008/013/014/017）は behaviorally 不変 |
| `src/core/step/__tests__/regression-gate-step.test.ts` | TC-001 テスト（`"message contains the provenance ref for each ledger entry"`）が iteration 1 の F1 fix として追加済みを確認。既存テストは無変更 |
| `src/core/command/__tests__/resume-wontfix.test.ts` | TC-003 / TC-005 が gate finding に `ledgerRef: computeLedgerRef(finding)` を付与する形に更新済みを確認 |
| verification-result.md | typecheck / test / build / lint / changed-line-coverage すべて passed（iter 1 & 2 の両結果を確認） |

### 設計判断の照合

- **D1（文字列照合の廃止）**: `resolveWontfixDispositions` は `findingFingerprint` を使った逆引きを完全廃止し、`gateFinding.ledgerRef → provenanceIndex.get(ref)` ルートに移行 ✓
- **D2（typed schema + 機械検証）**: ref 欠落 → "no provenance ref (ledgerRef absent)" error、ref 不一致 → "not found in any reviewer chain step" error。どちらも all-or-nothing exit 2 ✓
- **D3（positionally stable ref）**: `computeLedgerRef` は `findingFingerprint(f)` の SHA-256 から導出。ledger 順序・membership に非依存（TC-021 で固定）✓
- **D4（全 source step 対応）**: `buildProvenanceIndex` が spec-review StepRuns を先に走査し、その後 impl reviewer chain StepRuns を走査 ✓
- **D5（additive-only schema）**: `JUDGE_REPORT_TOOL` singleton identity 維持（`step.reportTool === JUDGE_REPORT_TOOL` テストで固定）。`DispositionDecisionRecord` shape 不変（TC-019 で検証）✓
- **D6（gate findings indexing 不変）**: operator の `<index>` は gate の reported findings をそのまま参照（input validation 全ブランチ維持）✓

### Iteration 1 F1 の fix 確認

iteration 1 code-review で指摘された F1（TC-001 の must テストが存在しない）について、code-fixer が `regression-gate-step.test.ts` に以下を追加:

```typescript
it("message contains the provenance ref for each ledger entry (TC-001)", () => {
    ...
    const expectedRef = computeLedgerRef(finding);
    const msg = step.buildMessage(state, deps);
    expect(msg).toContain(expectedRef);
});
```

`computeLedgerRef` を import して ref を事前計算し、`buildMessage` の出力に含まれることを assert している。F1 は解消済み。

### 各 must TC の網羅確認

| TC | 優先度 | テストファイル | カバー状態 |
|----|--------|-------------|----------|
| TC-001 | must | regression-gate-step.test.ts | ✓ 単一エントリで ref の存在を固定 |
| TC-002 | must | wontfix.test.ts (TC-010) | ✓ |
| TC-003 | must | wontfix.test.ts (TC-011) + resume-wontfix.test.ts | ✓ |
| TC-004 | must | wontfix.test.ts (TC-012) | ✓ |
| TC-005 | must | wontfix.test.ts paraphrased-title | ✓ 日本語 title で再現形テスト |
| TC-006 (spec-review) | must | wontfix.test.ts TC-006 (new) | ✓ step: "spec-review" を assert |
| TC-007 (unresolvable ref) | must | wontfix.test.ts TC-007 (new), 3 sub-cases | ✓ all-or-nothing |
| TC-008 (ledger exclusion) | must | wontfix.test.ts TC-008 (new) | ✓ impl-chain + spec-review 両方 |
| TC-009 (approved+fixable guard) | must | wontfix.test.ts TC-009 (new) | ✓ |
| TC-010 | must | wontfix.test.ts | ✓ |
| TC-011 | must | wontfix.test.ts | ✓ |
| TC-012 | must | wontfix.test.ts | ✓ absent / number / null の3ケース |
| TC-013 | must | regression-gate-step.test.ts | ✓ singleton identity check |
| TC-014 | must | wontfix.test.ts | ✓ |
| TC-015 | must | wontfix.test.ts | ✓ spec-review + code-review で共有 fingerprint |
| TC-018 | must | wontfix.test.ts | ✓ 6 invalid-input sub-cases |
| TC-019 | must | wontfix.test.ts | ✓ field 列挙 check |
| TC-020 | must | wontfix.test.ts | ✓ |

should-priority（TC-016/TC-017/TC-021）も wontfix.test.ts / regression-gate-step.test.ts でカバー済み。

### `buildProvenanceIndex` の filterUndecidedFindings 不適用について

`buildProvenanceIndex` は disposed findings を除外しない（`filterUndecidedFindings` 未使用）。これは意図的設計: gate は disposed findings を ledger から除外済みなので operator が disposed ref を選択できず、provenance index に disposed finding が残っていても実害はない。full index を保持することで「任意の ref を解決可能」な索引を担保している。

### `JUDGE_REPORT_TOOL` description への `ledgerRef` 非記載について

共有 tool description には `ledgerRef` が記載されていない（D5 per design）。ただし:
1. `zodSchema → toJSONSchema` 変換後の input_schema には `ledgerRef` が optional プロパティとして含まれるため、model は tool schema として認識できる
2. system prompt で verbatim echo を明示的に指示し、JSON サンプルも提示している

gate が ref を欠落した場合は fail-closed（all-or-nothing exit 2）で誤 disposition は発生しない。設計リスクとして認識・許容済み。

## 検証できなかった項目

- E2E テスト（実際の regression-gate agent が ledgerRef を echo するシナリオ）— spec-change type は bite-evidence が strategy-deferred になるため機械検証外
- hash 衝突の実測評価（SHA-256 32 bit truncation、N ≲ 50 finding の典型的 PR では衝突確率 ≈ N²/2³² ≈ 0.03%、許容範囲内）

## Findings 詳細

None（指摘事項なし）
