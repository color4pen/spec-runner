# ADR-20260820: operator の finding 不採用裁定を decisions 台帳の一般化で機械尊重する

**Date**: 2026-08-20
**Status**: accepted

## Context

operator が「不採用（wontfix）」と裁定した fixable finding を機械が尊重する場所がなく、
regression-gate が同一 finding を毎回 needs-fix に変換して livelock する（#1022）。

### 問題の構造

`JobState` には finding に関連する 2 つのフィールドが存在していた:

- `operatorAdjudications`（`OperatorAdjudication[]`）: `job resume --prompt` で記録される自由文コンテキスト。
  `step` は resume 先 step を指し、finding と identity 接続がない。agent に「人間が何を言ったか」を伝えるだけで、
  gate / verdict の導出には届かない。
- `decisions`（`DecisionRecord[]`）: issue コメント経由の選択裁定（decision-needed finding 専用）。
  既に `step`（finding 発生元）+ `findingKey` + `finding` snapshot + `decidedAt` を持ち、
  `filterUndecidedFindings` による verdict 導出前の blocking 除外機構が実装済み。
  ただし型は decision-needed 専用の単一形で、wontfix disposition を表現できなかった。

regression-gate の入力台帳は `computeRegressionLedger` → `collectFindingsLedger` が導出する派生 view で、
`deriveRegressionGateVerdict` は severity を問わず fixable finding → needs-fix に変換する。
operator の wontfix 裁定を gate に届ける経路が存在しなかった。

### 採用できなかった既存手段

- `operatorAdjudications` に finding decision を追加: `step` が resume 先 step を意味するため、
  finding decision を足すと同一フィールドで `step` が 2 つの意味を持つ。自由文コンテキスト専用の役割を壊す。
- 新規台帳 / 新規 identity 機構: 正本が増え、`filterUndecidedFindings` の blocking 除外機構を再実装することになる。
- `deriveRegressionGateVerdict` に wontfix 判定を追加: gate が「これは wontfix っぽい」と自己判断する。
  operator の明示裁定と gate の推測を混在させる。

## Decision

### D1: `decisions` 台帳の役割を finding decision の一般形に広げる

`DecisionRecord` を 2 arm の discriminated union に一般化する:

- **option arm**（既存互換）: `kind?: "option"`（`kind` 省略 = option）/ `id` / `step` / `findingKey` /
  `finding` / `selectedOption` / `resumeComment?` / `decidedAt` / `source: "issue-comment"`。
  既存の永続レコード（`kind` 無し）が構造的に適合し、後方互換で読める。
- **disposition arm**（新）: `kind: "disposition"` / `id` / `step`（**finding を出した step**）/
  `findingKey` / `finding`（snapshot）/ `disposition: "wontfix"` / `reason`（必須）/
  `decidedAt` / `source: "operator"`。

永続フィールド名 `decisions` は変えない。`isFindingDecided` / `filterUndecidedFindings` は
`.step` と `.findingKey` のみ参照し arm の種別を見ないため、disposition record が
そのまま blocking 除外に効く（無変更で両 arm に成立）。

2 台帳の役割を以下で固定する:
- `operatorAdjudications` = resume 時の自由文コンテキスト専用。agent に「人間が何を言ったか」を伝える。
  authority として finding を閉じない。
- `decisions` = finding に対する構造化された人間裁定。findingKey で standing decision になり、
  verdict / regression routing が機械的に尊重する。

**採用理由**: #1022 が必要とする土台（step + findingKey + snapshot + blocking 除外機構）は
`decisions` 側に既に揃っている。型だけ「decision-needed 専用」から「finding decision」へ広げれば、
verdict / regression の尊重は既存機構で成立する。新しい台帳も新しい照合ロジックも不要。

### D2: `--wontfix` / `--wontfix-reason` は comma-separated string flag で受け、operator の明示指定のみで記録する

`job resume` に `--wontfix <番号列>`（カンマ区切り、例 `1,3`）と `--wontfix-reason <text>` を追加する。
番号は string flag 1 つでカンマ split する（`FlagDef` に array type を追加しない）。

wontfix 裁定は **operator の明示 CLI 指定のみ** で記録する。`operatorAdjudications`（自由文）からの
推測・inference は行わない。`--prompt` と `--wontfix` は独立に動き、両方指定できる。

**採用理由**: 操作の明示性。`FlagDef` に array 型は未対応であり、カンマ区切り 1 文字列 + split で足りる。
自由文から wontfix を推測すると「人間が何を言ったか」と「機械が何を採用するか」の境界が曖昧になる。

### D3: 番号解決源は最新 regression-gate StepRun の findings 列挙順、record 時に source step へ逆引きする

番号の解決源は `getLatestJudgeFindings(state, "regression-gate")` が返す findings の **1-based 列挙順**
（operator が escalation で目にする表示と一致）。

record 時に、選択された各 finding の fingerprint（`file|line|title`）で `deriveImplReviewerChain(state)`
の各 StepRun の fixable findings を走査し、source step へ逆引きする:

- 同一 fingerprint を複数 step が報告していれば **各 source step につき 1 record**（step-level dedup）。
- 各 record の `findingKey` は **その source step の実 finding** から `computeFindingKey(sourceStep, finding)` で算出し、
  `finding` snapshot もその source step の実 finding を写す。
- 選択した finding の fingerprint がどの reviewerChain step にも一致しない場合は解決不能（all-or-nothing）。

**採用理由**: 番号は選択 UX にすぎず、永続されるのは完全な identity（source step + findingKey + snapshot）。
逆引きを reviewerChain に限るのは、除外先が `collectFindingsLedger`（同じ reviewerChain）だから。
disposition record の `step` は必ず reviewerChain step になる。

### D4: 記録は all-or-nothing、失敗は exit code 2 で decisions 無変化

`ResumeCommand.prepare()` で、状態遷移・persist の前に wontfix 解決・検証を行う純関数
（`resolveWontfixDispositions`）を呼ぶ。以下のいずれかで解決不能なら `PrepareError(2)` を投げ、
**decisions に何も記録しない**:

- `--wontfix` 指定時に `--wontfix-reason` が欠落 / 空
- regression-gate 未実行（gate findings が null / 空）
- 番号が範囲外 / 非整数 / 重複 / 空要素を含む
- 選択 finding の fingerprint が reviewerChain のどの step にも一致しない（逆引き不能）

全番号が解決できた場合のみ disposition record 群を生成し、1 回の persist で `decisions` に append して
から resume を続行する。

**採用理由**: 部分適用は「一部だけ wontfix された不整合な resume」を生む。検証を書き込み前に集約し、
成功時のみ 1 回書く。exit code 2 は既存の `PrepareError(2)` 経路で成立する。

注: regression-gate StepRun が報告する findings には fixable（regression）と decision-needed（contradiction）
の両方が含まれる。decision-needed finding のインデックスを `--wontfix` で指定した場合、その fingerprint は
reviewerChain（fixable のみ）に存在しないため逆引き不能で exit 2 になる。これは意図した挙動であり、
decision-needed finding は decision workflow（issue コメント経由）で解決する。

### D5: gate 入力の照合除外は `collectFindingsLedger` の per-step 段階で行う

`collectFindingsLedger` の per-step 収集ループ（source step 既知・dedupe 前）で、
各 step の fixable findings に `filterUndecidedFindings(stepName, fixable, state.decisions)` を適用してから
収集配列へ push する。

`deriveRegressionGateVerdict` / `collectSpecReviewLedger` / StepRun / journal は変更しない。

**採用理由**: `filterUndecidedFindings` は kind を見ず step + findingKey で照合するため、
disposition record がそのまま除外に効く。照合のみで履歴（StepRun）は消さない —
`computeRegressionLedger` は「歴史」ではなく gate への active input。
dedupe 後は provenance（source step）が失われるため、除外は dedupe 前の段階でなければならない。

### D6: verdict 側の尊重は既存 `filterUndecidedFindings` で成立（step-completion 無変更）

judge / conformance の verdict 導出前に `step-completion.ts` が既に
`filterUndecidedFindings(step.name, allFindings, state.decisions)` を挟んでいる。
disposition record の `step` = 発生 reviewer step、`findingKey` = 同 step の実 finding から算出、
であるため、同じ reviewer が同一 findingKey を再報告しても既存機構で除外され needs-fix にならない。
`step-completion.ts` は無変更。

### D7: identity 不安定リスクを明示的に受容する

`computeFindingKey` は rationale を含む（`step|file|line|title|rationale`）が、
ledger の dedupe identity は `file|line|title`（`findingFingerprint`）。
reviewer が次回 rationale を言い換えると findingKey が変わり、wontfix が外れる可能性がある。

この既知リスクを受容する。新しい identity 機構は Non-Goal。
identity 不安定が実測で再現したら独立して対処する（既知天井）。

## Alternatives Considered

### A1: `operatorAdjudications` に finding decision を追加する

`OperatorAdjudication` に `findingDecision?` を追加して wontfix 情報を持たせる案。

- **Pros**: 既存型の field 追加のみで、型を union に変えなくて済む。
- **Cons**: `OperatorAdjudication.step` は resume 先 step を意味するのに、finding decision を足すと
  1 レコード内で `step` が「resume 先」と「finding 発生元」の 2 意味を持つ。自由文コンテキスト専用の
  役割が壊れ、「人間が何を言ったか」と「機械が何を採用するか」の境界が消える。
- **Why not**: D1 で否採用。`decisions` 側に必要な土台が既に揃っている。役割混在は将来のバグの温床。

### A2: 新規 disposition 台帳を追加する

`JobState` に `dispositions` 等の新フィールドを追加し、wontfix record を独立管理する案。

- **Pros**: 既存 `decisions` の型を変えない。
- **Cons**: 正本が増える。gate / verdict からの参照が 2 台帳になり、`filterUndecidedFindings` を再実装
  するか `decisions` と `dispositions` を union して渡す配管が必要。
- **Why not**: D1 で否採用。既存の blocking 除外機構を再利用できる土台が `decisions` 側にある。

### A3: `deriveRegressionGateVerdict` に wontfix 判定を追加する

gate verdict 関数が finding を受け取った時点で decisions と突合し、wontfix を除外する案。

- **Pros**: `collectFindingsLedger` を変更しなくて済む。
- **Cons**: gate が「これは wontfix っぽい」と自己判断する責務を持つ。operator の明示裁定と
  gate の推測が混在し、active input の概念が壊れる。
- **Why not**: D5 で否採用。active 集合から除外した上で残りだけを gate に渡すのが正しい設計。

### A4: `FlagDef` に array type を追加して反復 flag で番号を受ける

`--wontfix 1 --wontfix 3` のように同一 flag の反復指定で番号列を受ける案。

- **Pros**: 意味論が明確。
- **Cons**: `FlagDef` の array 型対応が必要で、parser 表面が広がる。1 flag 追加のために parser を変える。
- **Why not**: D2 で否採用（YAGNI）。カンマ区切り 1 文字列で足りる。

### A5: 解決できた番号のみ記録し、失敗分を warn して resume を続行する（部分適用）

`--wontfix 1,3` のうち 1 が解決できて 3 が逆引き不能の場合、1 だけ記録して warn を出し resume する案。

- **Pros**: operator がコマンドを再実行しなくて済む。
- **Cons**: operator が何を裁定したか不明瞭になる。「1,3 を wontfix した」つもりで実際は「1 だけ wontfix された」という不整合な resume が発生する。部分適用後に「なぜ 3 が gate で再び出てくるのか」が分からなくなる。
- **Why not**: D4 で否採用。all-or-nothing で失敗させ exit 2 で明示的に止める方が、operator が意図した裁定の全体が確実に適用されることを保証できる。

## Consequences

### Positive

- operator の wontfix 裁定が `decisions` に永続され、regression-gate の livelock が解消する（#1022）。
- 2 台帳の役割が明確化される: `operatorAdjudications` = 自由文コンテキスト、`decisions` = 機械尊重の構造化裁定。
- verdict 側（judge / conformance）も既存 `filterUndecidedFindings` により同一 finding の再報告を
  自動抑制する（`step-completion.ts` 無変更）。
- 既存 `decisions` の後方互換が維持される（`kind` 無しレコードが option arm として読める）。

### Negative

- `DecisionRecord` が union 型になるため、`decisions` を走査して arm 固有のフィールド（`selectedOption` 等）に
  アクセスするコードは narrowing guard が必要になる。
  本変更では `custom-reviewer-round-context.ts` と `topic-emission.ts` の 2 箇所を修正した。
  今後の `decisions` 走査コードは arm narrowing を怠るとランタイムクラッシュのリスクがある。
- identity 不安定（rationale 言い換えで wontfix が外れる）は既知天井として存在し続ける。
  実測で再現した場合の対処は別 request となる。

### Known Debt

- `--wontfix` で decision-needed finding を指定した場合のエラーメッセージは「fingerprint が chain に存在しない」
  という汎用メッセージになる。「decision-needed finding は decision workflow で解決する」という
  より明確なメッセージへの改善は将来の UX 改善として追記可能。

## References

- Request: `specrunner/changes/finding-wontfix-disposition/request.md`
- Design: `specrunner/changes/finding-wontfix-disposition/design.md`
- Spec: `specrunner/changes/finding-wontfix-disposition/spec.md`
- Issue: #1022（regression-gate livelock）
- Implementation: `src/state/schema/types.ts` / `src/core/decision/wontfix.ts` /
  `src/core/pipeline/findings-ledger.ts` / `src/core/command/resume.ts` /
  `src/cli/command-registry.ts` / `src/cli/resume.ts` /
  `src/core/step/custom-reviewer-round-context.ts` / `src/core/design-layer/topic-emission.ts`
