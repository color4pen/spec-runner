# Design: fixable finding への operator 不採用裁定を decisions 台帳の一般化で機械尊重する

## Context

operator が「不採用（wontfix）」と裁定した fixable finding を機械が尊重する場所が無く、
regression-gate が同じ finding を毎回 needs-fix に戻して livelock する（#1022）。

現状の関連構造:

- `JobState.decisions` / `DecisionRecord`（`src/state/schema/types.ts:277-294`）は decision-needed
  専用の単一形。`step`（finding 発生元）+ `findingKey` + `finding` snapshot + `decidedAt` を既に持つ。
  唯一の writer は issue コメント経由（`src/core/inbox/run-inbox.ts:293`）。
- `filterUndecidedFindings` / `isFindingDecided`（`src/core/decision/decision-ledger.ts:49-72`）は
  step + findingKey 一致だけで照合し、record の種別を見ない。judge / conformance / request-review の
  verdict 導出前に `step-completion.ts:178,187,199,252` で無条件に挟まっている。
- regression-gate の入力台帳は `computeRegressionLedger`（`findings-ledger.ts:205-213`）で導出する派生 view。
  内訳は `collectSpecReviewLedger`（spec-review runs）+ `collectFindingsLedger`（impl reviewer chain の
  各 StepRun）。`collectFindingsLedger` の per-step ループでは source step が既知（`findings-ledger.ts:44-53`）だが、
  `dedupeFindings`（key = `file|line|title`）後は provenance が失われる。
- `deriveImplReviewerChain(state)` = `["code-review", ...customReviewerNames]`（spec-review / regression-gate を含まない）。
- 番号解決に使える「gate が最後に報告した findings」は `getLatestJudgeFindings(state, "regression-gate")`
  （`fixer-helpers.ts:53-66`）で取得できる。
- resume の記録チョークポイントは `ResumeCommand.prepare()`（`src/core/command/resume.ts`）。
  `--prompt` は同所で `appendOperatorAdjudication` により記録され、exit code 2 は `PrepareError(2)` で成立する。
- `FlagDef`（`src/cli/flag-parser.ts`）は string / boolean / integer のみ。array（同一 flag 反復）は未対応。

制約: 新しい台帳・新しい identity 機構は作らない。既存 `decisions` / `DecisionRecord` /
`computeFindingKey` / `filterUndecidedFindings` を一般化して再利用する。

## Goals / Non-Goals

**Goals**:

- `DecisionRecord` を `kind?: "option"`（既存・legacy）/ `kind: "disposition"` の 2 arm に一般化する。
  永続 field 名 `decisions` は不変、既存レコードは後方互換で読める。
- `job resume` に `--wontfix <番号列>` / `--wontfix-reason <text>` を追加し、operator の明示指定で
  disposition record を `decisions` へ追記してから resume を続行する（all-or-nothing、失敗は exit 2）。
- disposition 済み finding を regression-gate の active 入力（`collectFindingsLedger`）から照合除外し、
  livelock を解消する。StepRun / journal は不変。
- judge / conformance の verdict 側尊重が既存 `filterUndecidedFindings` で成立することをテストで固定する。

**Non-Goals**:

- 新しい finding identity 機構（rationale 正規化強化・fingerprint への鍵変更）。`computeFindingKey` をまず使う。
- findings-ledger への wontfix / accepted 状態の保持（派生 view のまま）。
- `OperatorAdjudication` の構造化・変更。
- issue コメント経由の disposition 記録（inbox 拡張）。
- regression-gate result 以外を解決源とする finding 選択。
- `disposition: "wontfix"` 以外の disposition 値。
- `deriveRegressionGateVerdict` の変更（gate に wontfix を再解釈させない）。

## Decisions

### D1: `DecisionRecord` を discriminated union に一般化する

`DecisionRecord` を 2 arm の union にする:

- **option arm**（既存互換）: `kind?: "option"` / `id` / `step` / `findingKey` / `finding` /
  `selectedOption` / `resumeComment?` / `decidedAt` / `source: "issue-comment"`。`kind` は optional
  （省略 = option）で、既存の永続レコードがそのまま読める。
- **disposition arm**（新）: `kind: "disposition"` / `id` / `step`（**finding を出した step**）/
  `findingKey` / `finding`（snapshot）/ `disposition: "wontfix"` / `reason`（必須）/ `decidedAt` /
  `source: "operator"`。

共通 field（`id` / `step` / `findingKey` / `finding` / `decidedAt`）が両 arm に揃うため、
`isFindingDecided` / `filterUndecidedFindings`（`.step` と `.findingKey` のみ参照）は無変更で両 arm に効く。

**Rationale**: #1022 が必要とする土台（step + findingKey + snapshot + blocking 除外機構）は
`decisions` 側に既にある。型だけ「decision-needed 専用」から「finding decision」へ広げれば、
verdict / regression の尊重は既存機構で成立する。

**Alternatives considered**:

- `OperatorAdjudication` に findingDecision を足す → 不採用。`OperatorAdjudication.step` は resume 先 step
  であり、finding decision を足すと 1 レコードで `step` が 2 意味を持つ。自由文コンテキスト専用の役割を壊す。
- 新しい disposition 台帳 / 新しい identity → 不採用。正本が増え、既存の照合機構を再実装することになる。

### D2: `--wontfix` / `--wontfix-reason` は comma-separated string flag で受ける

`--wontfix` は string flag（値例 `"1,3"`、カンマ split で番号列に分解）、`--wontfix-reason` も string flag。
`FlagDef` に array type は追加しない。

**Rationale**: `FlagDef` は array 未対応。番号列はカンマ区切り 1 文字列 + split の一行で足りる。
flag-parser を触らないのが最小差分。

**Alternatives considered**: `FlagDef` に array type / 反復 flag 対応を追加 → 不採用（YAGNI、parser 表面を広げる）。

### D3: 解決源は「最新 regression-gate StepRun が報告した findings」、record 時に source step へ逆引きする

番号の解決源は `getLatestJudgeFindings(state, "regression-gate")` が返す findings の **1-based 列挙順**
（operator が escalation で目にする、gate が最後に報告した finding 群）。

record 時に、選択された各 finding の fingerprint（`file|line|title`）で `deriveImplReviewerChain(state)`
の各 StepRun の fixable findings を走査し、source step へ逆引きする:

- 同一 fingerprint を複数 step が報告していれば **各 source step につき 1 record**。
- 各 record の `findingKey` は **その source step の実 finding** から `computeFindingKey(sourceStep, finding)`
  で算出し、`finding` snapshot もその実 finding を写す（gate が再報告した文言ではなく）。
- 選択した finding の fingerprint がどの reviewerChain step にも一致しない場合は解決不能（D4 参照）。

**Rationale**: 操作は operator の明示指定であり自由文から推測しない。番号は選択 UX にすぎず、永続されるのは
完全な identity（source step + findingKey + snapshot）。逆引きを reviewerChain に限るのは、除外先が
`collectFindingsLedger`（同じ reviewerChain）だから — disposition record の `step` は必ず reviewerChain step になる。

**Alternatives considered**:

- gate に渡す ledger（`computeRegressionLedger` 出力）を列挙源にする → 不採用。operator が実際に見るのは
  gate が報告した regression であり、request も解決源を StepRun の報告 findings に固定している。
- 自由文（`operatorAdjudications`）から wontfix 対象を推測 → 不採用（明示指定を要件が固定）。

### D4: 記録は all-or-nothing、失敗は exit code 2 で decisions 無変化

`ResumeCommand.prepare()` で、状態遷移・persist の**前**に wontfix 解決・検証を行う純関数を呼ぶ。
次のいずれかで解決不能と判定したら `PrepareError(2)`（= exit code 2）を投げ、**decisions に何も記録しない**:

- `--wontfix` 指定時に `--wontfix-reason` が欠落 / 空。
- regression-gate 未実行（`getLatestJudgeFindings` が null / 空）。
- 番号が範囲外（< 1 または報告 finding 数超過）/ 整数でない。
- 選択 finding の fingerprint が reviewerChain のどの step にも一致しない（逆引き不能）。

全番号が解決できた場合のみ disposition record 群を生成し、`--prompt` の adjudication 追記と同じ書き込みで
`decisions` に append してから resume を続行する。

**Rationale**: 部分適用は「一部だけ wontfix された不整合な resume」を生む。検証を書き込み前に集約し、
成功時のみ 1 回書く。exit code 2 は既存の `PrepareError(2)` 経路で成立する。

**Alternatives considered**: 番号ごとに解決できたものだけ記録し不能分を warn → 不採用（部分適用の不整合、
operator が何を裁定したか不明瞭）。

### D5: gate 入力の照合除外は `collectFindingsLedger` の per-step 段階で行う

`collectFindingsLedger` の per-step 収集ループ（source step 既知・dedupe 前）で、各 step の fixable findings に
`filterUndecidedFindings(stepName, fixable, state.decisions)` を適用してから収集配列へ push する。
`deriveRegressionGateVerdict` / `collectSpecReviewLedger` / StepRun / journal は無変更。

**Rationale**: `filterUndecidedFindings` は kind を見ず step + findingKey で照合するため、disposition record が
そのまま除外に効く。disposition record の `step` は必ず reviewerChain step（D3）なので spec-review ledger には
一致せず、`collectSpecReviewLedger` を触る必要はない。照合のみで履歴（StepRun）は消さない —
`computeRegressionLedger` は「歴史」ではなく gate への active input。

**Alternatives considered**:

- wontfix を gate に渡して gate 自身に「これは wontfix」と再解釈させる → 不採用。gate に判定を持たせず、
  active 集合から除外して残りだけ検証させる。
- dedupe 後に除外 → 不採用。dedupe 後は provenance（source step）が失われ、`isFindingDecided` の step 照合ができない。

### D6: verdict 側の尊重は既存 `filterUndecidedFindings` で成立（無変更想定・テストで固定）

judge / conformance の verdict 導出前に `step-completion.ts` が既に `filterUndecidedFindings(step.name, ...)`
を挟んでいる。disposition record の `step` = 発生 reviewer step、`findingKey` = 同 step の実 finding から算出
なので、同じ reviewer が同一 findingKey を再報告しても既存機構で除外され needs-fix にならない。
`step-completion.ts` は無変更を想定し、テストで固定する。成立しない場合のみ最小修正する。

**Rationale**: verdict 側の尊重は D1 の union 一般化の副産物として自動成立する見込み。まず観測で確認し、
不要な予防的修正を書かない。

**Alternatives considered**: step-completion に disposition 専用の除外分岐を追加 → 不採用（既存の
無条件 `filterUndecidedFindings` で足りるなら重複ロジック）。

### D7: `operatorAdjudications` は無変更、`--prompt` と `--wontfix` は併用可

`operatorAdjudications` は resume 時の自由文コンテキスト専用のまま。`--prompt`（adjudication 追記）と
`--wontfix`（disposition 記録）は独立に動き、両方指定できる。

**Rationale**: 2 台帳の役割固定 — `operatorAdjudications` = 自由文コンテキスト（authority として finding を
閉じない）、`decisions` = 構造化された人間裁定（機械が尊重する）。

**Alternatives considered**: `--wontfix-reason` を `operatorAdjudications` にも書く → 不採用（役割混在）。

## Risks / Trade-offs

- **[Risk] identity 不安定**: `computeFindingKey` は rationale を含む（`step|file|line|title|rationale`）。
  reviewer が次回 rationale を言い換えると findingKey が変わり wontfix が外れうる。
  → **Mitigation**: 既知リスクとして受容（新 identity 機構は Non-Goal）。record 時に source step の実 finding から
  findingKey を算出し、その時点の identity で永続する。identity 不安定が実測で再現したら独立に扱う（既知天井）。

- **[Risk] spec-review 由来 regression の wontfix 不能**: gate 報告 finding が spec-review 由来のみで
  reviewerChain に一致しない場合、逆引き不能で exit 2 になる。
  → **Mitigation**: #1022 の対象は code finding。spec-review 由来 wontfix は Non-Goal。失敗を沈黙させず
  exit 2 で明示的に止める（部分適用を作らない）。

- **[Risk] union narrowing の取りこぼし**: `kind` を判別に使わず `.selectedOption` を読む既存コードが
  disposition arm でランタイム undefined を踏む可能性。
  → **Mitigation**: 以下の 2 箇所は `state.decisions` 全体を走査するため、disposition record が存在すると
  クラッシュする。T-01 で明示的に修正する:
  1. `src/core/step/custom-reviewer-round-context.ts:198-204` — `.map((d) => ({ ..., selectedOption: d.selectedOption.label }))` を
     option arm のみにフィルタするよう修正（`.filter((d) => d.kind !== "disposition")` を追加）。
  2. `src/core/design-layer/topic-emission.ts:181` — `matchedDecision.selectedOption` 参照前に narrowing guard を追加。
  `isFindingDecided` / `filterUndecidedFindings` / inbox planner は `selectedOption` を参照しないため無変更。
  テストで既存 decisions / inbox / round-context の green を固定。

## Open Questions

- なし（設計判断は request の「architect 評価済みの設計判断」で確定済み）。
