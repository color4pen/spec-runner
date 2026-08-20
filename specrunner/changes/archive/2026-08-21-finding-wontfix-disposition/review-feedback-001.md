# Code Review Feedback — finding-wontfix-disposition — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 変更スコープ

`git diff main...HEAD --stat` で 29 ファイル（実装 8 ファイル + テスト 4 ファイル + pipeline artifact 17 ファイル）を確認。

### T-01: DecisionRecord discriminated union 化

- `src/state/schema/types.ts`: `OptionDecisionRecord`（`kind?: "option"`）と `DispositionDecisionRecord`（`kind: "disposition"`）の 2 arm union を確認。`kind` が optional なため kind 無しの既存レコードが `OptionDecisionRecord` として構造的に適合する。
- `custom-reviewer-round-context.ts`: `.filter((d) => d.kind !== "disposition")` が disposition arm を除外してから `.map()` で `d.selectedOption` にアクセスしていることを確認。TypeScript 5.5+ の inferred type predicates により narrowing が成立し、`tsc --noEmit` で型エラーなし（verification-result.md typecheck: passed）。
- `topic-emission.ts`: `if (matchedDecision && "selectedOption" in matchedDecision)` による narrowing guard を確認。disposition record が `findMatchingDecision` から返される場合にクラッシュしないことを確認。

### T-02: resolveWontfixDispositions 純関数

- `src/core/decision/wontfix.ts` を全文読んだ。以下の挙動を trace した:
  - `wontfix` が undefined/空 → 空配列（no-op）
  - `reason` 欠落 → early error（index parse 前に検証）
  - カンマ split → trim → 整数検証 → 重複検証 → 範囲検証の順
  - `getLatestJudgeFindings(state, "regression-gate")` で gate findings（fixable + decision-needed 全件）を取得
  - chain index 構築時に `collectFixableFindings` を使い fixable のみを indexing
  - 各選択 finding の fingerprint を chain index に照合 → 一致した step ごとに 1 record（step-level dedup）
  - all-or-nothing: 1 件でも不一致 → 即 error return で record 0 件

### T-03: resume.ts の配線

- `command-registry.ts`: `wontfix: { type: "string" }` と `"wontfix-reason": { type: "string" }` フラグ宣言と usage string への追記を確認
- `cli/resume.ts`: `ResumeOptions` への両フィールド追加と `ResumeCommand` への透過を確認
- `core/command/resume.ts`: `resolveWontfixDispositions` を `transitionJob` + persist の**前**に呼んでいることを確認（line 291–300）。失敗時は `PrepareError(2)` を throw し persist 未実行。成功時は disposition records を `stateToWrite.decisions` に append。

### T-04: collectFindingsLedger の per-step 除外

- `src/core/pipeline/findings-ledger.ts` の per-step ループ内で `filterUndecidedFindings(stepName, fixable, state.decisions)` を dedupe 前に適用していることを確認。
- `state.decisions === undefined` 時は `filterUndecidedFindings` が findings を全通しするため既存テストへの影響なし（`filterUndecidedFindings` の `if (!decisions || ...)` guard を確認）。
- `computeRegressionLedger` → `collectFindingsLedger` の経路で除外が反映される。`collectSpecReviewLedger` は不変（disposition records の `step` は reviewerChain step のみなので spec-review には一致しない）。

### T-05: verdict 側の尊重

- `step-completion.ts` が無変更であることを diff で確認。
- `isFindingDecided` / `filterUndecidedFindings` は `d.step` と `d.findingKey` のみ参照し、arm の種別を見ない（decision-ledger.ts:54–72 を確認）。両 arm が同じ field を持つため disposition record でそのまま機能する。

### テスト網羅確認

| TC | ファイル | 確認 |
|----|---------|------|
| TC-001 | decision-ledger.test.ts:350 | `satisfies OptionDecisionRecord` で kind 無しレコードの後方互換を検証 |
| TC-002/003 | wontfix.test.ts:248–288, resume-wontfix.test.ts:314–348 | disposition record の必須フィールドと永続を検証 |
| TC-004 | wontfix.test.ts:294–334 | 複数 step からの複数 record 生成を検証 |
| TC-005 | resume-wontfix.test.ts:355–393 | --prompt + --wontfix 併用で両方記録を検証 |
| TC-006 | wontfix.test.ts:101–113, resume-wontfix.test.ts:241–256 | gate 未実行 exit 2、persist 非呼び出しを検証 |
| TC-007 | wontfix.test.ts:182–200, resume-wontfix.test.ts:263–284 | 範囲外 exit 2 を検証 |
| TC-008 | wontfix.test.ts:120–134, resume-wontfix.test.ts:291–307 | reason 欠落 exit 2 を検証 |
| TC-009 | findings-ledger.test.ts:556–575 | F1 除外・F2 残存を computeRegressionLedger で検証 |
| TC-010 | findings-ledger.test.ts:578–597 | livelock 解消ケースを検証 |
| TC-011 | findings-ledger.test.ts:600–623 | StepRun 不変を直接 assert して検証 |
| TC-012 | decision-ledger.test.ts:392–460 | filterUndecidedFindings が disposition record で機能することを検証 |
| TC-013 | wontfix.test.ts:141–154, resume-wontfix.test.ts:219–234 | --wontfix 無し no-op を検証 |
| TC-014 | wontfix.test.ts:161–175 | 非整数 exit 2 を検証 |
| TC-015 | wontfix.test.ts:229–240 | 逆引き不能 exit 2 を検証 |
| TC-016 | wontfix.test.ts:341–358 | カンマ区切り parse を検証 |
| TC-017 | wontfix.test.ts:207–222 | 重複・空要素 exit 2 を検証 |
| TC-018 | verification-result.md | typecheck + test 全フェーズ passed |

### 受け入れ基準照合

全 8 項目を確認済み。すべて対応するテストが存在し green。

## 検証できなかった項目

None

## Findings 詳細

None（blocking / fixable の指摘なし）

---

## 補足観察（non-blocking）

**TC-012 の検証レベルについて**: verdict derivation（step-completion.ts）を通した end-to-end ではなく `filterUndecidedFindings` を直接テストしている。spec が「（`filterUndecidedFindings` 経由）」と明記し、task が「成立しない場合のみ最小修正」と規定しているため、この粒度は設計方針と整合する。

**gate findings index space について**: `getLatestJudgeFindings` は fixable + decision-needed の全 findings を返すため、`--wontfix` の index 空間に decision-needed findings が含まれる。decision-needed finding を指定すると fingerprint が chain index に存在せず exit 2（"not found in any reviewer chain step"）になる。spec note が明示的に受容している挙動であり問題なし。エラーメッセージの明確さは UX 改善として将来検討可能。
