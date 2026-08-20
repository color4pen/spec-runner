# fixable finding への operator 不採用裁定を decisions 台帳の一般化で機械尊重する

## Meta

- **type**: spec-change
- **slug**: finding-wontfix-disposition
- **base-branch**: main
- **adr**: true

## 背景

operator が不採用と裁定した fixable finding を機械的に尊重する場所がなく、regression-gate が livelock する（issue #1022）。findings-ledger は「報告済み fixable の全和集合」を毎回導出する派生 view で wontfix / accepted 状態を持たず、`deriveRegressionGateVerdict` は severity を問わず fixable → needs-fix に変換する。operator の裁定は `operatorAdjudications`（自由文）に記録されるが finding と identity 接続がなく、gate の導出に届かない。

解決は新しい台帳や新しい identity 機構ではなく、**既存 `JobState.decisions` / `DecisionRecord` の一般化**で行う。DecisionRecord は既に `step + findingKey + finding snapshot + decidedAt` を持ち、`filterUndecidedFindings` による blocking 除外機構も揃っている。2 つの台帳の役割は次で固定する:

- `operatorAdjudications` = resume 時の自由文コンテキスト。agent に「人間が何を言ったか」を伝える。authority として finding を閉じない
- `decisions` = finding に対する構造化された人間裁定。findingKey で standing decision になり、verdict / regression routing が機械的に尊重する

regression-gate 自身に「これは wontfix っぽい」と判断させない。裁定済み finding は gate へ渡す active 集合から照合で除外し、gate に wontfix を再解釈させない。finding 自体は StepRun に残るため履歴は消えない — `computeRegressionLedger` は「歴史」ではなく regression-gate への active input である。

## 現状コードの前提

- `src/state/schema/types.ts:277-294` `DecisionRecord` は decision-needed 専用の単一形: `id` / `step`（finding 発生元）/ `findingKey` / `finding`（`DecisionFindingSnapshot`）/ `selectedOption` / `resumeComment?` / `decidedAt` / `source: "issue-comment"`。`kind` discriminator は無い
- `src/core/decision/decision-ledger.ts:32-38` `computeFindingKey(step, finding)` = `step|file|line|title|rationale`（title / rationale は正規化）
- `src/core/decision/decision-ledger.ts:49-72` `isFindingDecided` / `filterUndecidedFindings` は step + findingKey 一致で照合し、record の種別を見ない
- `src/core/step/step-completion.ts:178,187,199,252` — request-review / conformance / judge の各 verdict 導出前に `filterUndecidedFindings(step.name, allFindings, state.decisions)` が無条件に挟まっている。したがって decisions に record が載れば verdict 側の尊重は既存機構で成立する
- `src/core/pipeline/findings-ledger.ts:35-64` `collectFindingsLedger` は reviewerChain の各 step の StepRun から fixable findings を収集し `dedupeFindings`（key = `file|line|title` = `findingFingerprint`）で first-occurrence 勝ちに畳む。**dedupe 後は step provenance が失われる**が、per-step 収集ループの中では source step が既知
- `src/core/pipeline/findings-ledger.ts:205-211` `computeRegressionLedger` が `collectFindingsLedger` を呼び、`src/core/step/regression-gate.ts:115,144` が gate 入力として使う
- `src/core/inbox/run-inbox.ts:293` が `decisions` の唯一の writer（issue コメント経由の選択裁定）
- `src/state/schema/types.ts:576-583` `OperatorAdjudication` = `{text, step, recordedAt}`。`step` は resume 先 step であり finding 発生元ではない（この request では変更しない）
- `src/cli/flag-parser.ts` の FlagDef は string / boolean / integer のみで、同一 flag の繰り返し指定（array）は未対応
- #1026 以降、`job resume --from regression-gate` は custom reviewers を持つ job で受理される（検証正本は core の `buildAllowedStepSet` → `resolveResumeStep`）

## 要件

1. **DecisionRecord の discriminated union 化**: `kind?: "option"`（省略 = 既存の選択裁定、legacy 互換）と `kind: "disposition"` の 2 arm に一般化する。disposition arm は `id` / `step`（**finding を出した step**。resume 先 step ではない）/ `findingKey` / `finding`（snapshot）/ `disposition: "wontfix"` / `reason`（必須）/ `decidedAt` / `source: "operator"` を持つ。永続 field 名 `decisions` は変えない。`kind` 無しの既存レコードは option として読める（後方互換）。
2. **記録操作（operator の明示指定・自由文から推測しない）**: `job resume` に `--wontfix <番号列>`（カンマ区切り可、例 `--wontfix 1,3`）と `--wontfix-reason <text>` を追加する。番号の解決源は**最新の regression-gate StepRun が報告した findings の列挙順**。record 時に reviewerChain の StepRun を走査して該当 finding の source step へ逆引きし（同一 fingerprint を複数 step が報告していれば各 step につき 1 record、findingKey は各 step の実 finding から算出）、disposition record 群を decisions へ追記してから resume を続行する。解決不能（regression-gate 未実行・範囲外の番号・`--wontfix` 指定時の reason 欠落）は exit code 2 で停止し **decisions に何も記録しない**（all-or-nothing）。
3. **gate 入力からの照合除外**: `collectFindingsLedger` の per-step 収集段階（source step 既知・dedupe 前）で `isFindingDecided` により disposition 済み finding を除外する。StepRun / journal の履歴は変更しない。`deriveRegressionGateVerdict` は変更しない（gate に wontfix を渡して再解釈させない）。
4. **verdict 側の尊重の確認**: judge / conformance の verdict 導出は既存 `filterUndecidedFindings` がそのまま disposition record にも効く想定（step-completion 無変更で成立する見込み）。テストで固定し、成立しない場合のみ最小修正する。
5. **operatorAdjudications は無変更**: 自由文コンテキスト専用のまま。`--prompt` との併用は従来どおり（両方指定可）。

## スコープ外

- 新しい finding identity 機構（rationale 正規化の強化・fingerprint への鍵変更等）。既存 `computeFindingKey` をまず使う
- findings-ledger への wontfix / accepted 状態の保持（派生 view のまま）
- `OperatorAdjudication` の構造化・変更
- issue コメント経由の disposition 記録（inbox 拡張）
- regression-gate result 以外を解決源とする finding 選択（reviewer escalation 段階での wontfix 等）
- `disposition: "wontfix"` 以外の disposition 値の追加

## 受け入れ基準

- [ ] `kind` 無しの既存 decisions を含む state が読み込めて option として扱われ、既存の decisions / inbox / round-context テストが無変更で green
- [ ] `--wontfix` 記録で decisions に disposition record（`step` = finding 発生元、`source: "operator"`、`reason` 必須、findingKey は発生 step の実 finding から算出）が永続されることをテストで固定する
- [ ] 番号解決不能（gate 未実行・範囲外）・reason 欠落が exit code 2 で停止し decisions が無変化であることをテストで固定する
- [ ] disposition 済み finding が `computeRegressionLedger` の結果から除外されることをテストで固定する（wontfix 1 件 + 他 finding 全て FIXED → gate verdict passed になる livelock 解消ケースを含む）
- [ ] 除外は照合のみで StepRun / journal が不変であることをテストで固定する
- [ ] reviewer が同一 finding（同一 findingKey）を再報告した場合に judge verdict が needs-fix にならないことをテストで固定する（`filterUndecidedFindings` 経由）
- [ ] `--wontfix` 無しの resume・`--prompt` のみの resume の既存挙動が無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **`decisions` の一般化を採用**: DecisionRecord は既に step + findingKey + snapshot + decidedAt を持ち、`filterUndecidedFindings` の blocking 除外機構も存在する。#1022 が必要とする土台はこちら側にある。永続 field 名は変えず型だけ「decision-needed 専用」から「finding decision」へ広げる。
- **`OperatorAdjudication` への findingDecision 追加は不採用**: OperatorAdjudication の `step` は resume 先 step であり、finding decision を足すと 1 レコード内で `step` が 2 つの意味を持つ。自由文コンテキスト専用の役割を維持する。
- **findings-ledger への状態保持は不採用**: ledger は派生 view であり、状態を持たせると正本が増える。
- **step の意味の一本化**: disposition record の `step` は「その finding を出した step」。resume 先が code-fixer か regression-gate かは decision authority に関係しない。
- **gate に再解釈させない**: wontfix を gate へ渡して gate 自身に判定させる案は不採用。active 集合から照合で除外し、gate は残った active input のみを検証する。
- **identity の既知リスクを受容**: `computeFindingKey` は rationale を含む（`step|file|line|title|rationale`）が、ledger の dedupe identity は `file|line|title`。reviewer が次回 rationale を言い換えると findingKey では別 finding になり wontfix が外れる可能性がある。ただし新 identity 機構を作るのはまだ早い — まず既存 DecisionRecord と同じ identity で実装し、identity 不安定が実測で再現したらそれだけ独立して扱う。
- **番号選択の解決源**: 操作は operator の明示指定であり自由文から推測しない。番号は最新 regression-gate StepRun の findings 列挙順に対して解決し、record 時に完全な identity（source step + findingKey + snapshot）へ落として永続する。番号は選択 UX にすぎず、永続されるのは identity。
