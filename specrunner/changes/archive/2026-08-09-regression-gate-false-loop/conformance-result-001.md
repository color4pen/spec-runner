# Conformance Result — regression-gate-false-loop — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Tasks completeness

tasks.md 全チェックボックスが `[x]`（T-01 〜 T-04、各サブタスク）。`git diff main...HEAD --stat` でソース変更ファイルが一致することを確認。

### D1: 既知未修正の除外は gate の判定層で指紋照合により行う

- `findingFingerprint(f)` = `${f.file}|${f.line ?? ""}|${f.title}` を `findings-ledger.ts:162` に export。`dedupeFindings` も内部で流用。
- `computeRegressionLedger(reviewerChain, state, canonScope?)` = `collectSpecReviewLedger` + `collectFindingsLedger` を `dedupeFindings` で合成。`regression-gate.ts` の `skipWhen` / `buildMessage` 両箇所で使用。
- `excludeKnownUnfixedRegressions(gateFindings, ledger)` = ledger の severity `"low"` エントリの fingerprint 集合を構築し、一致する gateFindings エントリを除外。
- `step-completion.ts:213-216` — `step.name === REGRESSION_GATE_STEP_NAME` 時のみ、`verdictFn` 呼び出し前に `verdictFindings = excludeKnownUnfixedRegressions(undecidedFindings, ledger)` を適用。
- `lastUndecidedFindings = undecidedFindings`（整形前）を保持。escalationReason 用途は変更なし。
- `deriveRegressionGateVerdict` のシグネチャ・実装は無改変。
- import cycle なし: `findings-ledger.ts` は `reviewer-chain.ts` を import しない。`step-completion.ts` が `deriveImplReviewerChain` を呼び出して reviewerChain を構築し `computeRegressionLedger` に渡す。

### D2: LOW 除外を routing 層 1 箇所に集約し prompt の severity 再フィルタを撤去する

- `selectFixerTargetFindings(findings)` = `collectFixableFindings(findings).filter(f => f.severity !== "low")` を `judge-verdict.ts:201` に新設。コメントで「LOW 除外の唯一の箇所」を明示。
- `routed-findings.ts:113` — Branch 3 で `collectFixableFindings` → `selectFixerTargetFindings` に差し替え。
- `code-fixer.ts:241-242` — standard path で `selectFixerTargetFindings(rawFindings)` を適用。
- `grep -rn "Ignore LOW severity" src/` → 0 件（プロダクションコード）。
- coordinator / conformance path は severity 絞り込みを適用しない（design D2 scope 限定）。

### D3: ledger 説明を実装の実態に一致させる

- `regression-gate-system.ts:25` — "reviewer が指摘した fixable findings 全件（修正済みとは限らない）" に更新済み。
- `regression-gate.ts buildLedgerBlock` — "The following findings were identified by reviewers during this job. Not all may have been fixed." に更新済み。
- "were fixed during this job" / "code-fixer が修正した" / "修正した fixable findings" いずれも grep で 0 件確認。

### D4: 既存テストの期待値変更

- 変更した既存テスト: TC-FF-C-005（`tests/unit/step/fixer-findings.test.ts`）の 1 件。design.md D4 の列挙と一致。
- 変更内容: LOW finding が埋め込まれないことを `not.toContain` で検証するよう期待値更新。MEDIUM は引き続き検証。
- 他の既存テストファイル（`judge-verdict.test.ts`、`routed-findings.test.ts`、`regression-gate-step.test.ts`、`step-completion-missing-file-finding.test.ts`）は無改変（`git diff main...HEAD --name-only` 確認）。

### Spec requirements

| Requirement | Scenario | テスト | 状態 |
|---|---|---|---|
| regression-gate は既知未修正 finding を退行事由にしない | approved 経路の未修正 low → needs-fix にならない | TC-001 | ✓ |
| 同上 | 既知未修正が全件一致 → approved | TC-002 | ✓ |
| regression-gate は新規退行に needs-fix を返す | 新規検出の退行 → needs-fix | TC-003 | ✓ |
| 同上 | 修正済み finding の退行 → needs-fix | TC-004 | ✓ |
| LOW 除外は routing 層 1 箇所 | standard reviewer path routing は low を除外 | TC-005 | ✓ |
| 同上 | code-fixer prompt に severity 再フィルタ行が存在しない | TC-006 + grep | ✓ |
| ledger 説明が実装の実態と一致 | 「修正した findings」記述が残っていない | TC-007 + grep | ✓ |

### Request acceptance criteria

| AC | 状態 | 根拠 |
|----|------|------|
| 再現テスト: approved + low fixable → gate が needs-fix を返さず前進 | ✓ | TC-001 |
| 新規退行テスト: 既知未修正集合と不一致の fixable → needs-fix | ✓ | TC-003 / TC-004 |
| `grep -rn "Ignore LOW severity" src/` が 0 件 | ✓ | 手動検証 + TC-006 |
| regression-gate-system.ts の ledger 記述が実装と一致 | ✓ | 手動検証 + TC-007 |
| 期待値変更した既存テストが design.md D4 の列挙と一致 | ✓ | TC-FF-C-005 の 1 件のみ変更 |
| `typecheck && test` が green | ✓ | verification-result.md: build/typecheck/test/lint すべて passed |

## 検証できなかった項目

None

## Findings 詳細

軽微な観察事項（非ブロッキング）:

- `step-completion.ts:252-260` に persist 時も `excludeKnownUnfixedRegressions` を適用するロジックが追加されている（tasks.md 非記載の実装詳細）。approved+fixable→code-fixer 遷移が既知未修正 low エントリで誤発火しないよう state 格納 findings を verdict と一致させる目的。design の intent（偽ループ防止）と一致しており矛盾なし。
- test-cases.md TC-013 の説明文「design.md が『期待値変更が必要な既存テスト = 0 件』と宣言している」は design.md D4（1 件）と齟齬あり。実装は design.md D4 に正確に準拠しており、request.md AC を満たす。test-cases.md artifact 上の不整合。
