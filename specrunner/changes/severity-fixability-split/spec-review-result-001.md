# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### ソースコード照合（design.md の「現状 LOW を落とす箇所」表との突合）

| # | 箇所 | 確認結果 |
|---|------|---------|
| 1 | `judge-verdict.ts:201-203` `selectFixerTargetFindings` | `.filter((f) => f.severity !== "low")` が実在。行番号一致 ✓ |
| 2 | `findings-ledger.ts:230-242` `excludeKnownUnfixedRegressions` | `low` エントリを fingerprint で除外する実装が実在 ✓ |
| 3 | `step-completion.ts:209-217` | regression-gate 分岐で `excludeKnownUnfixedRegressions` を呼び出す実装が実在 ✓ |
| 4 | `step-completion.ts:249-260` | regression-gate 永続化 findings の整列ブロックが実在 ✓ |
| 5 | `code-fixer.ts:149,192-193,218-219,271,289-295` | 全 5 分岐に「Fix all HIGH and CRITICAL … (mandatory)」「Fix MEDIUM … only if …」の severity 階層化文言が実在 ✓ |
| 6 | `code-fixer-system.ts:40` | 「LOW は無視」の旧 format fallback 文言が実在 ✓ |
| 7 | `reviewer-chain.ts:301-320` `codeReviewFindingsRoutingActive` | 関数実在、コメントに「all fixable findings are LOW severity which the prompt intentionally ignores」と明記 ✓ |
| 7 | `no-op-detect.ts:44-49,97-101` `findingsRoutingApproved` | parameter と抑止分岐が実在 ✓ |
| 7 | `executor.ts:19,482` | import と `codeReviewFindingsRoutingActive(state)` の呼び出しが実在 ✓ |

design.md が主張する全 7 件の除去対象が現行コードに存在することを実コードで確認した。

### 既存テスト update ledger の照合

design.md「Existing Test Update Ledger」に列挙された全テストを実ファイルで確認した。

| ファイル | 対象 | 実在確認 |
|---------|------|---------|
| `regression-gate-false-loop.test.ts` | TC-008: LOW を除外する assert (`not.toContain("LOW")`) | 実在 ✓ |
| 同 | TC-009/010: `excludeKnownUnfixedRegressions` の describe ブロック | 実在 ✓ |
| 同 | TC-001/002: `approved 経路の未修正 low … approved` の describe ブロック | 実在 ✓ |
| 同 | TC-003/004: `excludeKnownUnfixedRegressions` 経由の退行テスト | 実在 ✓ |
| 同 | TC-005: routing が LOW を除外する assert (`not.toContain("LOW")`) | 実在 ✓ |
| 同 | TC-011: `computeRegressionLedger` テスト（不変） | 実在、low 除外非依存を確認 ✓ |
| `tests/unit/step/fixer-findings.test.ts` | TC-FF-C-005: `not.toContain("[LOW]")` の assert | 実在 ✓ |
| `tests/unit/step/code-fixer.test.ts` | describe「prompt severity contract … HIGH and CRITICAL」TC-001〜005 | 全 5 件実在、いずれも `toContain("Fix all HIGH and CRITICAL severity findings")` ✓ |
| `src/core/step/__tests__/executor-no-op.test.ts` | Req 1: `verdict stays 'approved' (not escalated)` | 実在、`expect(verdict).toBe("approved")` を確認 ✓ |
| 同 | TC-008: `findingsRoutingApproved suppression → approved` | 実在、`expect(verdict).toBe("approved")` を確認 ✓ |
| `src/core/step/__tests__/no-op-detect-exemption.test.ts` | TC-011: suppression preserved (line 94) | 実在、`findingsRoutingApproved: true → undefined` の assert ✓ |
| 同 | 他の `detectNoOp` 呼び出しに `findingsRoutingApproved: false` 引数 | 実在（行 67, 79, 89, 120, 135, 150, 173, 188, 209, 225） ✓ |
| `src/core/pipeline/__tests__/reviewer-chain.test.ts` | describe「codeReviewFindingsRoutingActive」ブロック | 実在、import を含め削除対象として適切 ✓ |

### spec.md の形式検証

- 全 Requirement に `### Requirement:` ヘッダあり ✓
- 全 Requirement に `SHALL` または `MUST` あり ✓
- 全 Requirement に `#### Scenario:` + Given/When/Then あり ✓
- 受け入れ基準の全項目が spec Requirement と 1:1 対応していることを確認 ✓

### 意味論の一貫性検証

- `deriveJudgeVerdict` の critical|high → needs-fix、low/medium fixable → approved の判定は design D6 が不変を明示し、コードでも変更対象外であることを確認 ✓
- `deriveRegressionGateVerdict` は既に「任意の fixable → needs-fix」を実装しており、D2 後の動作と整合 ✓
- spec Requirement 5 「no re-review」保証は state machine の code-fixer approved → next step 遷移に依存。D5 は no-op escalation のみを変更し、re-review 経路には触れないことを確認 ✓
- D5 で `findingsRoutingApproved` を外した後の escalation 経路：`detectNoOp` が `"needs-fix"` → `pipeline.ts:366` の `transition?.to ?? "escalate"` で terminal escalation になり livelock は起きないことを設計で確認 ✓

### セキュリティ検証

変更はパイプライン内部の routing 層（どの finding を fixer に渡すか）と no-op 検知に限定。HTTP エンドポイント・認証・入力値検証・外部入力境界への影響なし。OWASP Top 10 該当箇所なし。

### `tests/unit/step/executor-no-op.test.ts` との関係

`src/core/step/__tests__/executor-no-op.test.ts` とは別に `tests/unit/step/executor-no-op.test.ts` が存在する。design update ledger に記載なし。grep で確認した結果 `findingsRoutingApproved` も `codeReviewFindingsRoutingActive` も使用していない（TC-NOP-001〜004 の基本テスト）。D5 適用後もこのファイルの変更は不要であることを確認した。

## 検証できなかった項目

- `typecheck && test` の実行結果（spec-review step は実行環境を持たない）
- pipeline.ts の state machine 遷移テーブル（`transition?.to ?? "escalate"` の実装）の詳細確認。design の説明に依拠した

## Findings 詳細

### [観察] code-fixer.test.ts のコメント誤記

`tests/unit/step/code-fixer.test.ts` の TC-001（line 562）と TC-002（line 578）に `// RED until T-01 is applied` とあるが、これらのテストが失敗するのは T-01（routing 層変更）ではなく T-03（code-fixer step message 変更）を適用した時点である。T-01 は `selectFixerTargetFindings` の filter を外すだけであり、message text は変わらない。

実装上の問題はない（T-06 でこれらのテストの更新が正しく指定されている）。コメントの誤記は実装者が T-01 完了後にこれらのテストが「まだ RED」であることを誤解するリスクがある。severity は low（誤解は軽微）。
