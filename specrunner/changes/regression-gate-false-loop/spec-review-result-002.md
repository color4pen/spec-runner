# Spec Review Result — regression-gate-false-loop (Round 2)

Reviewer: spec-review agent
Date: 2026-08-09
Scope: Full review including security considerations

---

## 検証した項目

1. **前周 [high] 再確認: computeRegressionLedger の import cycle 対処**
   - tasks.md T-02 および design.md D1 を精読し、対処の完全性を確認した。
   - `computeRegressionLedger(reviewerChain: string[], state, canonScope?)` がシグネチャで `reviewerChain` を受け取ることで、`findings-ledger.ts` は `reviewer-chain.ts` を import しない設計になっている。
   - 実際の循環経路（`reviewer-chain.ts` line 18 が `regression-gate.ts` を import、`regression-gate.ts` line 27 が `findings-ledger.ts` を import）をソースで確認した。
   - `findings-ledger.ts` の現行 import 一覧を確認し、`reviewer-chain.ts` への参照がないことを確認した。
   - 前周 [high] 指摘は**解消**されている。

2. **前周 [low] 再確認: legacy findingsPath フォールバックパスの記述**
   - tasks.md T-01 末尾に「legacy findingsPath フォールバックパス（`:282-300`）は `selectFixerTargetFindings` の適用対象外とする。変更は `Ignore LOW severity findings` 行（`:293`）の削除のみ」と明記されていることを確認した。
   - 前周 [low] 指摘は**解消**されている。

3. **コードの事前条件確認（design.md Context の裏付け）**
   - `judge-verdict.ts:188-190` — `collectFixableFindings` が `resolution === "fixable"` のみで抽出することを確認。
   - `code-fixer.ts` — "Ignore LOW severity findings" が lines 150, 194, 221, 272, 293 の 5 箇所に存在することを確認（tasks.md の記述と一致）。
   - `regression-gate-system.ts:25` — "code-fixer が修正した fixable findings の完全リスト" という虚偽記述が現存することを確認（T-03 の変更対象）。
   - `regression-gate.ts:58` — "The following findings were fixed during this job. Verify each one is still fixed in the current code." の虚偽記述が現存することを確認（T-03 の変更対象）。
   - `deriveRegressionGateVerdict` が `findings.some(f => f.resolution === "fixable")` で needs-fix を返すことを確認（任意 severity で発火、本変更でシグネチャ・実装は変更されない）。

4. **step-completion.ts の構造確認（T-02 実装可能性）**
   - `deriveStepCompletion` の isJudgeStep 分岐（lines 195-211）が `verdictFn(undecidedFindings, tr.ok, tr.evidence, canonScope)` を呼ぶ構造を確認した。
   - `REGRESSION_GATE_STEP_NAME` 分岐を挿入できる位置と、`lastUndecidedFindings` を整形前 `undecidedFindings` で保持する設計の妥当性を確認した。
   - `step-completion.ts` が現行で `reviewer-chain.ts` / `findings-ledger.ts` / `regression-gate.ts` を import していないこと、かつこれら 3 ファイルはいずれも `step-completion.ts` を参照しないことを確認した（新規 import 追加で cycle なし）。

5. **import graph の無閉路確認**
   - `reviewer-chain.ts` は `regression-gate.ts` を import（line 18）、逆参照なし。
   - `regression-gate.ts` は `findings-ledger.ts` を import（line 27）、逆参照なし。
   - `findings-ledger.ts` は `reviewer-chain.ts` を import しない（現行実装で確認）。
   - `step-completion.ts` がこれら 3 ファイルを追加 import しても cycle が生じないことを確認。

6. **spec.md のカバレッジと normative keyword 確認**
   - 要件 1〜4 がすべて Requirement として記述され、各 Requirement に SHALL または MUST が存在することを確認。
   - 各 Requirement に Given/When/Then 形式の Scenario が少なくとも 1 つあることを確認。
   - 再現テスト・新規退行テスト・修正済み退行テストの 3 シナリオ、routing シナリオ（low 除外）、prompt 静的チェックが spec に含まれていることを確認。

7. **D4（テスト churn 0 件）の根拠確認**
   - `deriveRegressionGateVerdict` のシグネチャ・実装が変更されないため、`judge-verdict.test.ts` の既存テスト（直接呼び出し）は無改変で green になることを確認。
   - `step-completion-missing-file-finding.test.ts` の regression-gate ケースは state.steps 空 → 既知未修正集合 空 → 除外 no-op → 従来 verdict 維持となる設計の妥当性を確認。

8. **T-04（新規テスト仕様）の完全性確認**
   - 3 判定シナリオ（再現・新規退行・修正済み退行）と routing の歯（`selectFixerTargetFindings`）が受け入れ基準として明示されていることを確認。
   - 新規テストが純関数の assert ベースで fixture 不要であることを確認（framework 追加なし、vitest 既存構成）。

9. **セキュリティ観点**
   - `buildLedgerBlock` が ledger finding の file/title を `<user-request>` ブロックに注入するパターンは変更前から存在しており、本変更で新たな injection 経路は追加されない。
   - fingerprint キー `${f.file}|${f.line ?? ""}|${f.title}` の `|` 区切りは `dedupeFindings` 既存実装と共有するものであり、セパレータ衝突リスクは pre-existing かつ fail-safe（拾い過ぎる側）の性質を持つ。新規リスクではない。
   - `computeRegressionLedger` / `excludeKnownUnfixedRegressions` は純関数（I/O なし）でありサイドエフェクトなし。

10. **code-fixer.ts standard path の filtering target 確認**
    - lines 241-278（standard reviewer path）が `getLatestJudgeFindings` の結果をそのまま prompt に埋め込んでいることを確認した（T-01 の変更対象）。
    - `buildContinuationMessage` への `findings` 引数も同一変数であることを確認し、T-01 の「継続 prompt にも同じ絞り込み後の集合を渡す」が適用可能であることを確認した。

---

## 検証できなかった項目

- `routed-findings.test.ts` の Branch 3 テスト helper が実際に severity `high` のみを使用しているか。design.md D4 の記述（`:66,123,184`）を信頼している。直接確認未実施。
- `judge-verdict.test.ts:349-384`（TC-021）のテスト内容および state 構造の詳細。テストが `deriveRegressionGateVerdict` を直接呼ぶか step-completion 経由かを確認していない（どちらの場合もロジック上 green が維持されることを設計から確認）。
- `step-completion-missing-file-finding.test.ts` の実際の step name 設定内容。

---

## Findings 詳細

前周指摘 2 件（[high] import cycle、[low] legacy path 未記述）は共に解消されている。

追加の blocking finding なし。

