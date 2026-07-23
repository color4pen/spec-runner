# ADR-20260723: spec-review の fixable canon finding を spec-fixer round で収束させる — step 専用 verdict resolver の導入

**Date**: 2026-07-23
**Status**: accepted

Follows: [ADR-20260723-canon-finding-escalation-routing](2026-07-23-canon-finding-escalation-routing.md)

## Context

ADR-20260723（canon-finding-escalation-routing）は fixer の write-scope 宣言に基づく
unroutable canon finding の escalation 規則を確立した。具体的には:

- `selectUnroutableCanonFindings(findings, scope, resolveEffectiveFixer)` が実効 fixer の
  書込可能集合に含まれない canon fixable finding を unroutable と判定する。
- verdict 関数はこの helper を参照して escalation / needs-fix を導出する。

しかし `deriveJudgeVerdict`（spec-review が使う既定の verdict 関数）は effective fixer resolver を
`judgeEffectiveFixer`（常に `"code-fixer"` を返す）で固定している。code-fixer の canon 書込集合は ∅
（`canon-write-scope.ts:47`）のため、spec.md / design.md への fixable finding も含めて
**すべての** canon fixable finding が unroutable として escalation に倒れる。

一方、遷移表には `spec-review needs-fix → spec-fixer`（`types.ts:234`）と
`spec-fixer approved → spec-review`（`types.ts:241`）の収束ループが既にあり、spec-fixer は
`{spec.md, design.md}` を合法に書ける（`canon-write-scope.ts:51`）。しかし verdict 導出が
このループに到達させないため、転記型の spec 欠落のたびに job が awaiting-resume で停止し、
operator の手動修正と `resume --apply-canon` を要求する。

実運用では medium / low の転記型 finding 4 件がこの経路で escalation し、
operator 修正 3 回・spec-review 5 iteration を要した。

また `step-completion.ts:306` の escalationReason 計算も
`lastIsConformancePath ? conformanceEffectiveFixer : judgeEffectiveFixer` であり、
spec-review を code-fixer 扱いするため、verdict 導出の resolver を変更しても
escalationReason 側が独立した条件式で resolver を再選択する構造（二重選択点 = drift 面）が残る。

### 確立済みの不変: spec-review round の fixer は構造的に spec-fixer 一択

`loopFixerPairs[SPEC_REVIEW] = SPEC_FIXER` は registry に宣言済みであり、
spec-review の needs-fix → spec-fixer 遷移は pipeline の構造的事実。
routing を finding 内の申告に委ねる必要はない。

## Decision

### D1: `specReviewEffectiveFixer` を `canon-escalation.ts` に追加する

finding 内容によらず常に `"spec-fixer"` を返す resolver `specReviewEffectiveFixer` を
`src/core/step/canon-escalation.ts` に追加する（`judgeEffectiveFixer` / `conformanceEffectiveFixer`
と同型の「1 行 const」形）。

- **採用理由**: spec-review round の fixer は `loopFixerPairs` により構造的に spec-fixer 一択。
  routing を finding の申告に委ねると、申告漏れ・誤申告で routing が壊れる面を新設することになる。
  resolver を 1 箇所で定義することで verdict 導出と escalationReason 計算の単一ソースとする。

**却下案**:

- *findings の `fixTarget` 申告に依存する方式（`conformanceEffectiveFixer` 型）*: 却下。
  conformance は fixer が finding ごとに異なるため申告依存が合理的だが、spec-review は
  round-level で fixer が一意。申告漏れ・誤申告が routing 崩壊の面になる。spec-review に
  申告依存の複雑性を導入する必要がない。

### D2: `deriveSpecReviewVerdict` を追加し、routable な canon fixable finding を severity 非依存で `needs-fix` にする

`src/core/step/judge-verdict.ts` に `deriveSpecReviewVerdict(findings, ok, evidence?, canonScope?)`
を追加する。評価順:

1. `ok === false` → `escalation`
2. `evidence.checked === 0`（vacuous check）→ `escalation`
3. `decision-needed` finding ≥ 1 → `escalation`
4. `canonScope` present のとき:
   - 4a. spec-fixer が**書けない** canon file への fixable finding（unroutable）≥ 1 → `escalation`
   - 4b. spec-fixer が**書ける** canon file への fixable finding（routable）≥ 1 → `needs-fix`（severity 非依存）
5. `critical|high` finding ≥ 1 → `needs-fix`（非 canon finding の既存挙動を保持）
6. それ以外 → `approved`

4a を 4b より前に評価し、共存時は escalation が優先される。operator が request.md 等を
修正して resume した後、spec-review が再走し spec.md finding を spec-fixer に routing する
収束経路を確保する。

`canon-escalation.ts` に `selectRoutableCanonFindings`（fixable かつ canon path かつ
effective fixer の書込集合に含まれる finding を返す）を追加し、`selectUnroutableCanonFindings`
との対称を保つ。両 verdict 関数から共有する。

- **採用理由**: medium / low の fixable spec finding は「記録されるが修正されない」まま
  `approved` に達し、既知の仕様欠落が test-case-gen 以降に流れる。spec-review round の
  目的（spec の収束）に反する。severity 非依存で `needs-fix` にすることで既存ループ
  (`spec-review → spec-fixer → spec-review`) に到達させ、pipeline 内で収束させる。

**却下案**:

- *resolver 差し替えのみ、severity 規則は `deriveJudgeVerdict` 流用（critical|high のみ needs-fix）*:
  却下。medium / low の fixable spec finding が無修正のまま `approved` に達する。spec-review
  round の目的に反し、既知の仕様欠落が下流に流れることを許容する設計になる。

### D3: `SpecReviewStep.judgeVerdictFn = deriveSpecReviewVerdict` を宣言する

`src/core/step/spec-review.ts` の `SpecReviewStep` 定義に `judgeVerdictFn` フィールドを追加し、
`deriveSpecReviewVerdict` を設定する。executor は `step.judgeVerdictFn` があればそれを使い
（`step-completion.ts:194-197`）、`canonScope` を第 4 引数で渡す（`step-completion.ts:201`）。

- **採用理由**: `regression-gate.ts:98` が `judgeVerdictFn: deriveRegressionGateVerdict` で
  同型の切替を行っている既存拡張点を再利用する。step 定義が振る舞いを宣言する
  「Step as data」パターンと整合する。
- **却下案**: *executor 側で step 名を分岐して verdict 関数を選ぶ*: 却下。executor に
  step 固有知識を漏らし、Step as data の既存パターンに反する。

### D4: escalationReason resolver を verdict 導出と同一化する（drift-proof）

`src/core/step/step-completion.ts` の verdict 導出ブロックで、canon 判定に使った effective fixer
resolver を変数 `lastCanonResolver` として捕捉する。escalationReason 計算はこの捕捉値を参照する。

- conformance branch → `conformanceEffectiveFixer` を捕捉
- judge branch → `step.name === STEP_NAMES.SPEC_REVIEW ? specReviewEffectiveFixer : judgeEffectiveFixer`
  を捕捉

既存の `lastIsConformancePath` boolean を `lastCanonResolver` の捕捉に置換する
（`lastIsConformancePath` は :306 の resolver 選択にしか使われていない）。

- **採用理由**: boolean を後段で resolver に再マップする現行構造は、resolver が 3 種に増えると
  「導出地点の選択」と「後段の再マップ」を別々に一致させ続ける必要があり drift 面を持つ。
  捕捉変数による単一選択点で、verdict と escalationReason が構造的に同一 resolver を参照することを
  保証する。
- **却下案**: *`lastIsConformancePath` を残し :306 を 3-way 分岐にする*: 動作は同じだが
  「どの step → どの resolver」の選択式が verdict 導出と escalationReason で二重化し、drift 面が
  残る。捕捉方式を採用。

### D5: 遷移表・ループ機構は変更しない

`spec-review needs-fix → spec-fixer`（:234）と `spec-fixer approved → spec-review`（:241）は既存。
spec-review の escalation は遷移表に一致行がなく、既定の `transition?.to ?? "escalate"` で
`escalate` 終端 → awaiting-resume に落ちる（現行と同じ）。

spec-review は `loopNames` に含まれ `loopFixerPairs[SPEC_REVIEW] = SPEC_FIXER` が宣言済みで、
`spec-review → spec-fixer` の反復はグローバル `maxIterations` で有界
（`SPEC_REVIEW_RETRIES_EXHAUSTED` で halt）。本変更は新規遷移 edge・ループ経路を作らない。

## Alternatives Considered

### A1: findings の `fixTarget` 申告依存（conformanceEffectiveFixer 型）の spec-review への適用

spec-review の finding にも `fixTarget` フィールドを持たせ、conformanceEffectiveFixer と同型の
resolver で routing する案。

- **Pros**: conformance との対称性。fixer が将来変わっても finding 側の申告で吸収できる。
- **Cons**: spec-review round の fixer は registry で構造的に spec-fixer 一択。申告漏れ・誤申告で
  routing が壊れる面を新設することになる。finding ごとに `fixTarget` を書かせることは
  「構造で決まること」を agent の申告に委ねる設計であり、信頼性が申告精度に依存する。
- **Why not**: spec-review round の fixer は構造的事実。申告に依存せず resolver で固定する。

### A2: resolver 差し替えのみ、severity 規則は現状維持（critical|high のみ needs-fix）

`specReviewEffectiveFixer` を導入して旧 `judgeEffectiveFixer` を置き換えるが、
severity 規則は `deriveJudgeVerdict` のまま（critical|high のみ `needs-fix`）とする案。

- **Pros**: 変更範囲が最小。`deriveSpecReviewVerdict` の新規追加が不要。
- **Cons**: medium / low の fixable spec finding が `approved` に達する。転記型 spec 欠落が
  「記録されるが修正されない」まま test-case-gen 以降に流れる。spec-review round の目的
  （spec の収束）に反する。実運用で実際に発生した問題（medium/low finding 4 件が escalation）
  を根本解決しない。
- **Why not**: severity 非依存で routable finding を `needs-fix` にする規則が spec-review の
  目的と整合する。対症療法にならず根本解決する。

## Consequences

### Positive

- spec.md / design.md への medium / low fixable finding が escalation を経ずに pipeline 内で
  spec-fixer に自動 routing され、既知の仕様欠落が test-case-gen 以降に流れなくなる。
- `specReviewEffectiveFixer` の単一定義により、verdict 導出と escalationReason 計算が
  同一 resolver を参照することが構造的に保証される（drift-proof）。
- 新規遷移 edge・ループ経路を作らないため、spec-review → spec-fixer 反復は既存の
  `maxIterations` で有界のまま。
- judge / conformance / regression-gate / request-review の verdict 導出挙動は不変。

### Negative

- spec-review → spec-fixer のループが発火する条件が medium / low fixable finding まで広がるため、
  以前は 1 round で approved だったケースが複数 round になりうる。ただしループは有界で、
  spec-fixer が収束すれば spec-review approved に達する。
- `deriveSpecReviewVerdict` の追加により verdict 関数が増える。関数の責務分離は明確だが、
  メンテナが増加に気づくよう ADR とコメントで明示する。

### Known Debt

- `judge-verdict.test.ts` TC-021 のコメント（"judgeVerdictFn absent → falls back"）は
  `SpecReviewStep` が `judgeVerdictFn` を持ったことで実 step の挙動を表さなくなるが、
  assertion 自体（inline step + 非 canon file）への影響はない。実 `SpecReviewStep` を対象とする
  regression ケースを別途追加することが望ましい（非ブロッキング）。
- routable / unroutable 共存時（4a + 4b 両方存在）の escalation 優先は design に明記されているが、
  operator が request.md を修正 → resume 後の経路（spec.md finding が spec-fixer に routing）が
  LLM 動作依存であることを念頭に置く必要がある。

## References

- Request: `specrunner/changes/spec-review-fixer-routing/request.md`
- Design: `specrunner/changes/spec-review-fixer-routing/design.md`
- Spec: `specrunner/changes/spec-review-fixer-routing/spec.md`
- Implementation: `src/core/step/canon-escalation.ts` / `src/core/step/judge-verdict.ts` /
  `src/core/step/spec-review.ts` / `src/core/step/step-completion.ts`
- Related: [ADR-20260723-canon-finding-escalation-routing](2026-07-23-canon-finding-escalation-routing.md)
  — canon finding routing 基盤（本 ADR はその spec-review への適用拡張）
- Related: [ADR-20260723-operator-canon-apply-on-resume](2026-07-23-operator-canon-apply-on-resume.md)
  — unroutable finding の escalation → resume → operator 適用フロー
