# Code Review Feedback — finding-provenance-carry — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

| ファイル | 確認内容 |
|---------|---------|
| `src/kernel/report-result.ts` | `Finding.ledgerRef?: string` の additive 追加、doc comment |
| `src/core/step/report-tool.ts` | `findingSchema` / `conformanceFindingSchema` 両方に `ledgerRef: optional(string())` 追加を確認 |
| `src/core/port/report-result.ts` | `parseFindings` の `ledgerRef` キャプチャ（typeof string チェック、非文字列は silent ignore、missingFields に追加されない） |
| `src/core/pipeline/findings-ledger.ts` | `computeLedgerRef`（SHA-256 先頭8 hex chars）、`buildProvenanceIndex`（spec-review + impl chain 全走査）、`collectSpecReviewLedger` の `filterUndecidedFindings` 追加 |
| `src/core/decision/wontfix.ts` | `resolveWontfixDispositions` の ref ベース解決ロジック、全 invalid-input ブランチの維持 |
| `src/core/step/regression-gate.ts` | `buildLedgerEntry` に Provenance Ref 行追加、`buildLedgerBlock` の指示文追加 |
| `src/prompts/regression-gate-system.ts` | ledgerRef verbatim echo 指示、findings フォーマット例に `ledgerRef` 追記 |
| `tests/unit/core/decision/wontfix.test.ts` | TC-005/006/007/008/009/010/011/012/014/015/018/019/020/021 の実装を確認 |
| `src/core/step/__tests__/regression-gate-step.test.ts` | 既存テストが無変更で green であることを確認 |
| `src/core/command/__tests__/resume-wontfix.test.ts` | TC-003 / TC-005 の更新（gate finding に ledgerRef を追加）を確認 |
| verification-result.md | typecheck / test / lint / build すべて passed を確認 |

### 設計判断の照合

- **D1（文字列照合の廃止）**: `resolveWontfixDispositions` は `findingFingerprint` を使った逆引きを完全に廃止し、`gateFinding.ledgerRef` → `provenanceIndex.get(ref)` ルートに移行 ✓
- **D2（typed schema + 機械検証）**: ref 欠落 / unresolvable で all-or-nothing exit 2 ✓
- **D3（positionally stable ref）**: `computeLedgerRef` は fingerprint の SHA-256 から導出（ledger order・membership 非依存）✓
- **D4（全 source step 対応）**: `buildProvenanceIndex` が spec-review + impl chain の両方を走査 ✓
- **D5（additive-only schema）**: `JUDGE_REPORT_TOOL` singleton identity 維持、`DispositionDecisionRecord` shape 不変 ✓

## 検証できなかった項目

- E2E テスト（ regression-gate が実際に ledgerRef を echo するエンドツーエンドシナリオ） — 手動テストは spec 外
- hash 衝突の実測評価（ SHA-256 32 bit truncation の理論的衝突確率は許容範囲内）

## Findings 詳細

### F1: TC-001（must）— `buildMessage` が provenance ref を出力することをテストで固定していない

test-cases.md TC-001 は "must" 優先度のテストケースで「非空 ledger に対して `buildMessage` が各エントリの Provenance Ref を含む」ことを要求する。

`src/core/step/regression-gate.ts` の `buildLedgerEntry` は `- **Provenance Ref**: \`${ref}\`` 行を出力しており、**実装自体は正しい**。しかし `src/core/step/__tests__/regression-gate-step.test.ts` は `buildMessage` の検証で title / file のみをチェックしており、ref の存在を assert するテストが存在しない。`wontfix.test.ts` にも該当テストはない（`ledgerRef` / `Provenance Ref` の grep で0件確認）。

この契約がテストで固定されていないため、誰かが `buildLedgerEntry` から ref 行を誤って削除しても CI が検出できない。T-03 acceptance criteria 「Existing regression-gate-step.test.ts assertions pass unchanged」は既存テストの変更禁止を意味するが、**新規テストの追加は禁止されていない**。

**修正方法**: `regression-gate-step.test.ts` か `wontfix.test.ts` に以下の追加テストを入れる:
```typescript
it("message contains the provenance ref for each ledger entry", () => {
  const step = createRegressionGateStep();
  const finding = makeFixableFinding("src/auth.ts", "Hardcoded secret");
  const state = makeJobState({ steps: { "code-review": [makeStepRun([finding])] } });
  const deps = makeDeps("my-slug");
  const msg = step.buildMessage(state, deps);
  const expectedRef = computeLedgerRef(finding);
  expect(msg).toContain(expectedRef);
});
```
