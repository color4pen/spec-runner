# Conformance Result — finding-wontfix-disposition — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Evidence Summary

- **Checked**: 8 normative requirements (all spec.md Requirements + Scenarios)
- **Skipped**: 0
- **Unverified**: 0

---

## 検証した項目

### Requirement: DecisionRecord は option / disposition の 2 arm を後方互換で保持する

- `OptionDecisionRecord` (`kind?: "option"`, optional discriminant) と `DispositionDecisionRecord` (`kind: "disposition"`) が `src/state/schema/types.ts:277–332` に定義されている。
- `export type DecisionRecord = OptionDecisionRecord | DispositionDecisionRecord;` — 永続フィールド名 `decisions` は変更なし。
- `OptionDecisionRecord.kind` は optional なので `kind` 無しの既存レコードはそのまま option arm として読める。
- TC-001 (`tests/unit/core/decision/decision-ledger.test.ts`): `kind` 無しの legacy オブジェクトを `satisfies OptionDecisionRecord` で型検証し、`filterUndecidedFindings` が抑制することを確認。
- DispositionDecisionRecord の必須フィールド (`kind`, `step`, `findingKey`, `finding`, `disposition: "wontfix"`, `reason`, `decidedAt`, `source: "operator"`) すべて存在。TC-002 で確認。
- Union narrowing 修正:
  - `src/core/step/custom-reviewer-round-context.ts:199`: `.filter((d) => d.kind !== "disposition")` を挿入してから `selectedOption` を参照。
  - `src/core/design-layer/topic-emission.ts:180`: `"selectedOption" in matchedDecision` ガードを追加。

**Scenarios**: 両方確認済。

---

### Requirement: `job resume --wontfix` は disposition record を decisions へ記録してから resume する

- `--wontfix` / `--wontfix-reason` string フラグが `src/cli/command-registry.ts:1083–1084` に追加され、`runResume` へ 1193–1194 で渡される。
- `ResumeOptions` (`src/cli/resume.ts`, `src/core/command/resume.ts`) に `wontfix?: string` / `wontfixReason?: string` 追加。
- `resolveWontfixDispositions` (新規 `src/core/decision/wontfix.ts`): all-or-nothing 解決。`ResumeCommand.prepare()` 内で `transitionJob` / persist の**前**に呼び出し (lines 291–300)。
- 成功時は disposition records を `decisions` に append (lines 323–329)。
- 逆引き: `deriveImplReviewerChain(state)` → per-step StepRun 走査 → fingerprint 照合 → `computeFindingKey(sourceStep, actualFinding)` で findingKey 算出。
- 同一 fingerprint を複数 step が報告した場合は step 単位で 1 record (stepName を key とした Map)。TC-004 確認。
- TC-003: `step = "code-review"`, `source = "operator"`, `reason`, `disposition = "wontfix"`, findingKey が発生 step の実 finding から算出されることを integration test で確認。
- TC-005: `--prompt` + `--wontfix` 併用 → `operatorAdjudications` と `decisions` が両方 persist されることを確認。

**Scenarios**: 3件すべて確認済。

---

### Requirement: 解決不能な --wontfix は exit code 2 で停止し decisions を変更しない

- `resolveWontfixDispositions` が `{ ok: false, error }` を返すと、`prepare()` が `PrepareError(2)` を throw し persist を呼ばない。
- 各エラーケース:
  - `reason` 欠落/空 → line 44–46 でチェック (persist 前)。
  - gate 未実行 (`gateFindings` null/空) → line 68。
  - 範囲外インデックス → lines 73–80。
  - 非整数 / 重複 / 空要素 → lines 50–64。
  - fingerprint がどの reviewer chain step にも一致しない → lines 118–122。
- `MOCK_STORE.persist` が呼ばれないことを TC-006, TC-007, TC-008 (`resume-wontfix.test.ts`) で確認。
- TC-014 (非整数), TC-015 (fingerprint 不一致), TC-017 (重複・空要素) も `wontfix.test.ts` で単体確認。
- 仕様注: gate が decision-needed findings を報告した場合、そのインデックスを指定すると fingerprint が reviewerChain に一致せず exit 2。これは意図通り (spec.md の note に明記)。

**Scenarios**: 3件すべて確認済 (TC-006, TC-007, TC-008 + 追加ケース)。

---

### Requirement: disposition 済み finding は regression-gate の active 入力から除外される

- `collectFindingsLedger` (`src/core/pipeline/findings-ledger.ts:55`): per-step ループの `fixable` に `filterUndecidedFindings(stepName, fixable, state.decisions)` を適用し、dedupe 前に収集配列へ push。source step が既知の段階で除外。
- `deriveRegressionGateVerdict` は変更なし (diff 確認)。
- `collectSpecReviewLedger` は変更なし。
- StepRun の内容は不変 — 収集配列のみ変わる。
- TC-009: F1 が `computeRegressionLedger` の結果から除外され、F2 は残ることを確認。
- TC-010: wontfix 1件 → ledger 空 → gate に active input なし (livelock 解消)。
- TC-011: StepRun が F1 を含み続けることを `stateWithDecision.steps["code-review"][0].outcome.toolResult.findings` で確認。

**Scenarios**: 3件すべて確認済。

---

### Requirement: 同一 findingKey の再報告は verdict を needs-fix にしない

- `src/core/step/step-completion.ts` は変更なし (`git diff main...HEAD -- src/core/step/step-completion.ts` が空)。
- step-completion.ts は judge/conformance verdict 導出前に `filterUndecidedFindings(step.name, ...)` を無条件に呼び出す。disposition record は `kind` を参照せず `step + findingKey` のみで照合するため、既存機構がそのまま効く。
- TC-012 (`tests/unit/core/decision/decision-ledger.test.ts:392–460`): `filterUndecidedFindings` に `DispositionDecisionRecord` を渡すと finding が抑制されること、かつ異なる step では抑制されないことを確認。

**Scenarios**: 確認済。

---

### Requirement: --wontfix を指定しない resume は挙動不変

- `resolveWontfixDispositions` は `wontfix` が undefined または空文字のとき `{ ok: true, records: [] }` を返す (lines 39–41)。
- `prepare()` 内の `if (dispositionRecords.length > 0)` ガードにより decisions への書き込みが発生しない。
- TC-013 (`resume-wontfix.test.ts` + `wontfix.test.ts`): `--wontfix` 無しで disposition が追加されないことを確認。
- 既存 `--prompt` adjudication パスは変更なし。

**Scenarios**: 確認済。

---

### Requirement: typecheck && test が green

`specrunner/changes/finding-wontfix-disposition/verification-result.md` より:

| Phase | Status |
|-------|--------|
| build | passed |
| typecheck | passed |
| test | passed |
| lint | passed |
| changed-line-coverage | passed |

---

## 計画との差異 (非規範的)

- `collectParallelFixerFindings` でも `filterUndecidedFindings` を per-member に適用している (`findings-ledger.ts:107–108`)。spec/request に明示はないが、同じ除外パターンを parallel reviewer path にも適用した拡張。spec 違反なし。
- tasks.md の全チェックボックスが完了状態。適合ゲートではないが計画どおり完走。

---

## 検証できなかった項目

None。

## Findings 詳細

None。
