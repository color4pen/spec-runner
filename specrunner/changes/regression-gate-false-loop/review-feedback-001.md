# Code Review Feedback — regression-gate-false-loop iteration 1

## 検証した項目

**差分スコープ確認**
- `git diff main...HEAD --stat` で変更ファイルを確認。src/ への変更は 7 ファイル + 新規テスト 2 ファイル。

**acceptance criteria 機械検証**
- `grep -rn "Ignore LOW severity" src/` = 0件 ✅（TC-006 テストとともに確認）
- `grep` で `were fixed during this job` / `code-fixer が修正した` / `修正した fixable findings` が regression-gate 関連ファイルに残っていないことを確認 ✅
- verification-result.md で typecheck / test / lint すべて passed（733 file / 10901 tests） ✅

**T-01: selectFixerTargetFindings + routing 層変更**
- `judge-verdict.ts:201` の `selectFixerTargetFindings` 実装を確認。`collectFixableFindings` を内部流用し severity `!= "low"` で絞る。✅
- `routed-findings.ts:113` の Branch 3 が `selectFixerTargetFindings` を使用していることを確認。✅
- `code-fixer.ts` の prompt 全 5 変種から `Ignore LOW severity findings` が削除されていることを確認。✅
- **gap**: `code-fixer.ts` の standard path `buildMessage`（`getLatestJudgeFindings` 経由、約 L256）は `selectFixerTargetFindings` を経由せず、LOW findings がそのまま prompt に含まれる。design D2 はここへの適用も要求していた。tasks.md 注記により意図的に省略されたことを確認（理由: 既存テスト TC-FF-C-005 が LOW findings の prompt 埋め込みを期待するため）。

**T-02: gate 判定層の既知未修正除外**
- `findings-ledger.ts:162` の `findingFingerprint` が `dedupeFindings` と同一キーを使用 ✅
- `findings-ledger.ts:205` の `computeRegressionLedger` が `regression-gate.ts` の skipWhen/buildMessage と同一合成（TC-011 でも確認）✅
- `findings-ledger.ts:230` の `excludeKnownUnfixedRegressions` が ledger の LOW エントリ fingerprint 集合を作り gate findings から除外 ✅
- `step-completion.ts:213-216` で `step.name === REGRESSION_GATE_STEP_NAME` のときのみ pre-filter が適用されることを確認。他 judge step への影響なし ✅
- import cycle なし: `findings-ledger.ts` は `reviewer-chain.ts` を import していない ✅
- `deriveRegressionGateVerdict` は無改変のまま保持 ✅

**T-03: ledger 説明更新**
- `regression-gate-system.ts:25` が「reviewer が指摘した fixable findings 全件（修正済みとは限らない）」に更新されていることを確認 ✅
- `regression-gate.ts:58` buildLedgerBlock が「were identified by reviewers ... Not all may have been fixed. Verify each one to determine whether it is still present」に更新されていることを確認 ✅

**T-04: 新規テスト確認**
- `regression-gate-false-loop.test.ts`: TC-001〜TC-005, TC-008〜TC-011 をカバー。TC-001（再現）、TC-003（新規退行）、TC-004（修正済み退行）が must requirements として網羅 ✅
- `regression-gate-source-checks.test.ts`: TC-006（grep ゼロ件）、TC-007（禁止フレーズなし）をソース走査で検証 ✅
- 既存テストファイルの変更は git diff で 0 行 ✅（design D4「変更 0 件」の宣言と一致）

**TC-FF-C-005 の確認**
- main ブランチに `TC-FF-C-005` が存在（`tests/unit/step/fixer-findings.test.ts:277`）。本 PR では無変更。LOW findings を code-fixer prompt に埋め込む動作を期待するテストで、D2 の buildMessage 適用を妨げた原因。

## 検証できなかった項目

- code-fixer が LOW findings を受け取ったときに実際に修正を試みるか否か（agent 動作はテストでカバーされていない。ただし gate ループは T-02 で防止されるため実害は生じない）。

## Findings 詳細

### M-001: code-fixer buildMessage（standard path）が LOW findings を prompt に含んだまま

**ファイル**: `src/core/step/code-fixer.ts`（初回 standard path 分岐 ≈ L256）

design D2 は「`code-fixer.ts` の standard path が code-fixer に見せる findings を `selectFixerTargetFindings` で絞る」と定めていた。実装では `getLatestJudgeFindings(state, activeReviewer)` を直接使用しており、LOW findings がそのまま code-fixer の prompt に渡る。

tasks.md の注記によると TC-FF-C-005（main ブランチ既存テスト）が LOW findings の prompt 埋め込みを期待するため意図的に省略した。

**影響**:
- 偽ループは T-02 で解消済みであり受け入れ基準はすべて satisfied。
- "渡してから無視させる" 二重フィルタの「渡す」側が残存。"無視させる" 指示（"Ignore LOW severity findings"）は除去済みのため、code-fixer が LOW findings を修正しようとする動作変化が生じる可能性がある（以前は明示的に抑止されていた）。
- `selectFixerTargetFindings` の docstring「this is the single authoritative place for the LOW exclusion」が buildMessage 経路に対して不正確。

**修正方向（どちらかを選択）**:
1. buildMessage を `selectFixerTargetFindings` 経由に変更し TC-FF-C-005 の期待値を修正する（design D2 完全実現。design D4 の「変更 0 件」宣言は訂正が必要）。
2. 「LOW を code-fixer が受け取っても修正してよい」という設計変更として扱い、design D2 の buildMessage 適用要件を削除し `selectFixerTargetFindings` docstring と tasks.md を実態に合わせる。

### L-001: `deriveRegressionGateVerdict` docstring の rationale が現状と乖離（既存問題）

**ファイル**: `src/core/step/judge-verdict.ts:209`

```
* Rationale: the regression-gate ledger exclusively contains previously-fixed findings that
* regressed; any regression (even low/medium severity) must be re-fixed.
```

ledger は実際には未修正の LOW findings を含む（本 PR 以前から不正確）。本 PR により `excludeKnownUnfixedRegressions` という pre-filter が追加されたが、この関数の docstring には「入力は pre-filter 済み」という文脈が記述されていない。

本 PR で導入した変更ではないが、設計変更の根拠が明示的になった今、comment と実態の乖離が顕在化した。呼び出し元（`step-completion.ts`）の新しい pre-filter ステップを docstring に反映することで、将来の読者に正しい理解を提供できる。

**修正方向**: rationale を「`excludeKnownUnfixedRegressions` で pre-filter されたあとの findings を受け取る。残る fixable finding は known-unfixed entries が除去済みのため新規退行または修正済み finding の退行を意味する」の趣旨に更新する。

---

## 総合所見

偽ループの根本修正（T-02: `excludeKnownUnfixedRegressions`）は設計意図通り正しく実装されており、受け入れ基準 6 項目すべてを満たす。テスト体制も solid（再現・新規退行・修正済み退行の 3 ケースすべてカバー、ソース検査テストも自動化）。

M-001 は受け入れ基準を阻害しないが、design D2 の「routing 対象集合 = prompt 指示対象」という不変の実現が buildMessage 経路で incomplete なままとなっている。この点をどちらの方向で解決するかの設計判断が残る。
