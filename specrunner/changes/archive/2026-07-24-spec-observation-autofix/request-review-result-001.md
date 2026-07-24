# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証（現状コードの前提）

**1. `src/core/pipeline/reviewer-chain.ts:142-148`**
実際の行番号で確認。142-148 行は `buildReviewerChainTransitions` のコメントブロック（`R_i → approved + fixable findings → code-fixer (findingsRouting)` 等）。実際の条件ロジックは `when: (s) => collectFixableFindings(findings).length > 0` (line 176) および `when: (s) => active === reviewer && lastVerdictOf(s, reviewer) === "approved"` (line 213) として実装されている。記述と実態が一致している。

**2. `src/core/step/judge-verdict.ts` — `deriveSpecReviewVerdict` 4b**
lines 99-102 で確認:
```typescript
// 4b: routable canon fixable findings → needs-fix (severity-independent)
if (selectRoutableCanonFindings(findings, canonScope, specReviewEffectiveFixer).length > 0) {
  return "needs-fix";
}
```
severity 不問の needs-fix であることを確認。`collectFixableFindings` は lines 181-183 に存在し `resolution === "fixable"` でフィルタ。

**3. `src/core/pipeline/types.ts:233-242`**
確認:
- line 233: `{ step: SPEC_REVIEW, on: "approved", to: TEST_CASE_GEN }`
- line 234: `{ step: SPEC_REVIEW, on: "needs-fix", to: SPEC_FIXER }`
- line 241: `{ step: SPEC_FIXER, on: "approved", to: SPEC_REVIEW }` — spec-fixer の戻り先は無条件 spec-review

**4. `src/core/pipeline/types.ts:266`**
line 266: `{ step: CONFORMANCE, on: "needs-fix:spec-fixer", to: SPEC_FIXER }` を確認。conformance 起点の spec-fixer は types.ts:241 の無条件遷移で spec-review に戻る。

**5. `src/core/pipeline/findings-ledger.ts:42`**
`collectFindingsLedger` の本体、line 42 で `for (const stepName of reviewerChain)` ループ開始を確認。`regression-gate.ts:112,141` で呼び出し側は `deriveImplReviewerChain(state)` を渡しており、spec-review は含まれないことを確認。

**6. `src/core/step/regression-gate.ts`**
lines 112-114、141-143 で `deriveImplReviewerChain(state)` を使って `collectFindingsLedger` を呼び出し、機械検証していることを確認。

**7. `src/core/step/spec-fixer.ts` — 書込集合**
`writes()` method (lines 99-106) で `{design.md, spec.md, tasks.md}` の 3 ファイルのみ確認。

**8. `src/prompts/spec-review-system.ts`**
- line 49: 全量列挙規律（Method ステップ 5）を確認
- finding-recency 検出は `src/core/step/commit-orchestrator.ts:271-276` で spec-review かつ iteration ≥ 2 の完了時に発火することを確認

### 設計の整合性検証

**observation pass の実装経路**
`buildReviewerChainTransitions`（impl 側）が `code-fixer → next(R_i) when active_reviewer == R_i AND R_i last verdict approved` という条件付き遷移で observation pass を実現している構造を確認した。spec 側でも同型の `when` 条件（`lastVerdictOf(state, SPEC_REVIEW) === "approved"` かつ conformance 起点でない）を spec-fixer 遷移に追加する設計が成立可能であることを確認。

**予算中立性（Req 5）**
spec-review の loop カウンタは `isAnyLoopStep` 判定（pipeline.ts:226）で spec-review が currentStep になった時のみ増加する。observation pass で spec-fixer → test-case-gen に直行すれば spec-review が再実行されないため、カウンタは増加しない。Req 5 はルーティング変更の自然な帰結として達成される。

**regression-gate プロンプトとの整合**
`src/prompts/regression-gate-system.ts:25` の Contract 欄に「code-fixer が修正した fixable findings の完全リスト」とある。Req 4 で spec-review 分を ledger に追加した場合、この記述が不正確になる（spec-fixer が修正したものも含まれるため）。Method ステップ 2「対象ファイルを読んで修正が残っているか確認する」は file-agnostic なので spec.md も検証可能だが、Contract 欄のテキスト更新が実装時に必要になる。requirement 4 はこれを明示していないため、実装時に implementation-notes で列挙すべき点。

**既存テスト TC-001/TC-002 への影響**
`src/core/step/__tests__/spec-review-fixer-routing.test.ts` の TC-001（medium fixable → needs-fix）・TC-002（low fixable → needs-fix）は、実装後に `"approved"` を期待するよう更新が必要。受け入れ基準 #7 で明示されており認識済み。

## 検証できなかった項目

- `#913`, `#923`, `#925` のイシュー番号は外部参照。コードの内容（severity 不問の needs-fix、spec-fixer 書込集合、全量列挙規律）は実際にその通り存在することを確認済みのため issue 番号の照合は不要と判断した。

## Findings 詳細

None — blocking な問題なし。以下は低リスクの観察事項：

- **regression-gate プロンプト更新漏れリスク**: Req 4 の実装（`collectFindingsLedger` の走査対象に `spec-review` を追加）に伴い、`regression-gate-system.ts` Contract 欄の "code-fixer が修正した fixable findings" という記述が事実と乖離する。実装者が見落とす可能性があるため implementation-notes への記載を推奨する。これはブロッカーではなく観察的指摘（低リスク）。
