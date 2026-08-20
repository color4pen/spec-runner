# Tasks: fixable finding への operator 不採用裁定を decisions 台帳の一般化で機械尊重する

## T-01: DecisionRecord を discriminated union に一般化する

- [x] `src/state/schema/types.ts` の `DecisionRecord` を 2 arm の union に置き換える:
  - option arm（既存互換）: `kind?: "option"` を追加し、他 field（`id` / `step` / `findingKey` /
    `finding` / `selectedOption` / `resumeComment?` / `decidedAt` / `source: "issue-comment"`）は現状維持。
  - disposition arm（新）: `kind: "disposition"` / `id` / `step` / `findingKey` / `finding`
    (`DecisionFindingSnapshot`) / `disposition: "wontfix"` / `reason: string` / `decidedAt` / `source: "operator"`。
  - `export type DecisionRecord = OptionDecisionRecord | DispositionDecisionRecord;` とし、
    共通 field（`id` / `step` / `findingKey` / `finding` / `decidedAt`）を両 arm に持たせる。
- [x] 永続 field 名 `decisions` は変更しない。`src/state/schema.js` の re-export 経路が両 arm を出すことを確認する。
- [x] 既存の option record 構築サイト（`src/core/inbox/planner.ts:329-349` の `records.push({...})`）が
  `kind` を付けなくても option arm として型検査を通ることを確認する（optional discriminant）。
- [x] **`src/core/step/custom-reviewer-round-context.ts:198-204`** の
  `state.decisions.map((d) => ({ ..., selectedOption: d.selectedOption.label, ... }))` を修正する。
  disposition arm には `selectedOption` が存在しないため、option arm のみにフィルタしてから map する
  （例: `.filter((d) => d.kind !== "disposition")` を挿入）。
- [x] **`src/core/design-layer/topic-emission.ts:181`** の `matchedDecision.selectedOption` 参照を修正する。
  `findMatchingDecision` が disposition record を返した場合 `selectedOption` は存在しないため、
  参照前に narrowing guard（`"selectedOption" in matchedDecision` 等）を追加するか、
  option arm のみを検索対象にする。

**Acceptance Criteria**:
- `kind` 無しの永続レコードが option arm として読め、既存の decisions / inbox / round-context テストが無変更で green。
- disposition arm が `kind: "disposition"` / `disposition: "wontfix"` / `reason`(必須) / `source: "operator"` を持つ。
- `typecheck` が green（既存 DecisionRecord 参照箇所が union で破綻しない）。
- `custom-reviewer-round-context.ts` と `topic-emission.ts` が disposition record を含む `decisions` でランタイムクラッシュしない。

## T-02: wontfix 解決・逆引きの純関数を追加する

- [x] 新規 `src/core/decision/wontfix.ts` に純関数 `resolveWontfixDispositions` を実装する。
  入力: `state: JobState`, `wontfix: string | undefined`(カンマ区切り番号列), `reason: string | undefined`, `decidedAt: string`。
  出力: 成功時 `DispositionDecisionRecord[]`、失敗時は種別付きエラー（呼び出し側が exit 2 に変換）。
- [x] `wontfix` が undefined/空なら空配列を返す（no-op）。
- [x] `wontfix` 指定時に `reason` が undefined/空白のみ → エラー。
- [x] 番号列をカンマ split → trim → 整数検証。非整数・重複・空要素はエラー。
- [x] 解決源 = `getLatestJudgeFindings(state, REGRESSION_GATE_STEP_NAME)`（`src/core/step/fixer-helpers.ts`,
  `REGRESSION_GATE_STEP_NAME` は `src/core/step/regression-gate.ts`）。null/空ならエラー（gate 未実行）。
- [x] 各番号を 1-based で解決。範囲外（< 1 または > findings.length）はエラー。
- [x] 各選択 finding の fingerprint = `findingFingerprint(f)`（`src/core/pipeline/findings-ledger.ts`）を算出し、
  `deriveImplReviewerChain(state)`（`src/core/pipeline/reviewer-chain.ts`）の各 step の全 StepRun を
  走査して同一 fingerprint を報告した StepRun を収集する。ただし **record 生成はステップ単位**で行う:
  同一 step 名を持つ複数の StepRun が同一 fingerprint を報告していても、その step につき 1 record のみ
  生成する（最初に見つかった StepRun の finding を代表値として使用）。
  record の各 field: `step` = source step、`findingKey` = `computeFindingKey(sourceStep, actualFinding)`、
  `finding` = actualFinding の snapshot、`disposition: "wontfix"`、`reason`、`source: "operator"`、
  `id` は `(番号, sourceStep)` で一意。
- [x] どの reviewerChain step にも fingerprint が一致しない選択 finding があればエラー（逆引き不能）。
- [x] エラーは all-or-nothing: いずれか 1 つでもエラーなら record を 1 件も返さない。
- [x] import 方向を確認し循環を作らない（wontfix.ts → step/pipeline 側への一方向）。

**Acceptance Criteria**:
- 正常系: 有効な番号列 + reason で、source step 由来の `DispositionDecisionRecord[]` を返す
  （`step` = 発生 step、`findingKey` は発生 step の実 finding から算出）。
- 同一 fingerprint を複数 step が報告 → 各 step につき 1 record。
- gate 未実行 / 範囲外 / 非整数 / reason 欠落 / 逆引き不能 → いずれもエラーで record 0 件。
- `typecheck && test` の対象として単体テストを追加し green。

## T-03: `job resume` に `--wontfix` / `--wontfix-reason` を配線する

- [x] `src/cli/command-registry.ts` の `resume` コマンドの `flags` に
  `wontfix: { type: "string" }` と `"wontfix-reason": { type: "string" }` を追加する。
- [x] handler で両 flag を読み、`runResume` の options へ `wontfix` / `wontfixReason` として渡す。
  （`--from-issue` 経路は本 request のスコープ外 = 配線しない。issue コメント経由 disposition は Non-Goal。）
- [x] `src/cli/resume.ts` の `ResumeOptions` に `wontfix?: string` / `wontfixReason?: string` を追加し、
  `ResumeCommand` へ透過する。
- [x] `src/core/command/resume.ts` の `ResumeOptions` に同 field を追加。`prepare()` で状態遷移・persist の
  **前**に `resolveWontfixDispositions(state, this.options.wontfix, this.options.wontfixReason, now)` を呼ぶ。
  - 解決失敗 → `throw new PrepareError(2, ...)`（decisions へ何も書かない）。
  - 解決成功 → 生成した disposition record 群を、既存の `appendOperatorAdjudication`（`--prompt`）と同じ
    `stateToWrite` 構築（`src/core/command/resume.ts:294-302` 付近）に合流させ、`decisions` に append してから persist。
- [x] `--prompt` と `--wontfix` の併用時は adjudication 追記と disposition 追記が両方行われることを確認する。
- [x] `JOB_RESUME_USAGE`（`src/cli/command-registry.ts:348-`）に `--wontfix` / `--wontfix-reason` の説明を追記する。

**Acceptance Criteria**:
- `job resume <slug> --wontfix 1 --wontfix-reason "r"` で disposition record が `decisions` に永続される。
- 解決不能（gate 未実行 / 範囲外 / reason 欠落 / 逆引き不能）で exit code 2、`decisions` 無変化。
- `--wontfix` 無し・`--prompt` のみの resume は挙動不変（既存テスト green）。
- `--prompt` + `--wontfix` 併用で operatorAdjudication と disposition record が両方記録される。

## T-04: regression-gate の active 入力から disposition 済み finding を除外する

- [x] `src/core/pipeline/findings-ledger.ts` の `collectFindingsLedger` の per-step ループ
  （`findings-ledger.ts:44-53`、source step 既知・dedupe 前）で、各 step の `fixable` に
  `filterUndecidedFindings(stepName, fixable, state.decisions)`（`src/core/decision/decision-ledger.ts`）を
  適用してから収集配列へ push する。
- [x] `collectSpecReviewLedger` / `deriveRegressionGateVerdict` / StepRun / journal は変更しない
  （disposition record の `step` は必ず reviewerChain step なので spec-review ledger には一致しない）。
- [x] `computeRegressionLedger` 経由で除外が反映されることを確認する（`regression-gate.ts:115,144` の入力）。

**Acceptance Criteria**:
- disposition 済み finding が `computeRegressionLedger` の結果から除外される（wontfix 1 件 + 他 finding 全て FIXED
  → gate の active 入力に当該 finding が無く verdict passed になる livelock 解消ケースを含む）。
- 除外は照合のみで、当該 finding を報告した StepRun と event journal が不変であることをテストで固定する。
- 既存 `src/core/pipeline/__tests__/findings-ledger.test.ts` が（除外ケース追加以外）無変更で green。

## T-05: verdict 側の尊重を確認する（無変更想定・テストで固定）

- [x] `src/core/step/step-completion.ts` の judge/conformance verdict 導出前 `filterUndecidedFindings`
  （`step-completion.ts:187,199`）が disposition record にも効くことをテストで固定する。
- [x] 同じ reviewer step が同一 findingKey の finding を再報告したケースで verdict が needs-fix にならないことを検証。
- [x] テストで成立が確認できれば step-completion は無変更のままとする。成立しない場合のみ最小修正する
  （その場合も disposition 専用分岐を足さず、既存 `filterUndecidedFindings` 経路で成立させる）。

**Acceptance Criteria**:
- reviewer が同一 findingKey を再報告しても judge verdict が needs-fix にならない（`filterUndecidedFindings` 経由）。
- step-completion に不要な変更を加えていない。

## T-06: 後方互換とフルグリーンを固定する

- [x] `kind` 無しの既存 decisions を含む state fixture で decisions / inbox / round-context テストが
  無変更で green であることを確認する。
- [x] `tasks.md` の各チェックボックスを実装完了に合わせて更新する。
- [x] `typecheck && test` を実行し green を確認する。

**Acceptance Criteria**:
- 受け入れ基準（request.md）の全項目に対応するテストが存在し green。
- `typecheck && test` が green。
