# ADR-20260724: spec フェーズの observation auto-fix — minor fixable finding は fixer 消化後に再レビューなしで前進する

**Date**: 2026-07-24
**Status**: accepted

Extends: [ADR-20260526-observation-auto-fix-pipeline](2026-05-26-observation-auto-fix-pipeline.md)
Extends: [ADR-20260723-canon-finding-escalation-routing](2026-07-23-canon-finding-escalation-routing.md)
Extends: [ADR-20260724-spec-fixer-tasks-md-writable](2026-07-24-spec-fixer-tasks-md-writable.md)

## Context

ADR-20260526 は impl フェーズに observation auto-fix を確立した。reviewer が `approved` かつ
fixable（low / medium）finding を返すと、verdict は `approved` のまま `code-fixer` が finding を
消化し、**再レビューなしで次の step へ直行**する。fixer の自己申告は即時 LLM 再レビューではなく、
findings ledger 経由で後段の regression-gate が機械検証する。

spec フェーズにはこのパターンが存在しなかった。`deriveSpecReviewVerdict`（#913 以前）の 4b は
routable canon fixable finding が 1 件でもあれば severity 不問で `needs-fix` を返していた。
その結果、minor（low / medium）な転記型 finding でも `spec-fixer → spec-review` の
再レビュー往復が必ず発生し、再レビューが新たな minor finding を出すたびに往復が連鎖する。

実運用では minor finding 6 件で 5 往復・operator resume 2 回を要した run が観測された。
往復コストに対して増分価値が得られていない（minor は機械検証で代替可能）構造的問題である。

### 確立済みの設計基盤

- **ADR-20260723-canon-finding-escalation-routing**: `CanonWriteScope` / `selectRoutableCanonFindings`
  で「この fixer が書ける正典か」を判定する基盤が確立済み。`deriveSpecReviewVerdict` は
  `specReviewEffectiveFixer`（常に spec-fixer）基準で routable / unroutable を分離できる。
- **ADR-20260724-spec-fixer-tasks-md-writable**: spec-fixer の書込集合が
  `{spec.md, design.md, tasks.md}` に確定した（routable 集合の確定）。
- **impl 側の observation auto-fix 実績**: `reviewer-chain.ts` の `approved + fixable →
  code-fixer → next(R_i)` 遷移（ADR-20260526 D3）が安定稼働しており、
  spec フェーズへの移植に技術的障壁はない。
- **遷移 predicate の先行導入**: `Transition.when?: (state: JobState) => boolean` が確立済み
  であり（`types.ts:148`）、observation / needs-fix / conformance の 3 経路を guard で
  機械的に分離できる。

## Decision

### D1: `deriveSpecReviewVerdict` の 4b を「routable critical/high のみ needs-fix」に絞る

`deriveSpecReviewVerdict` の判定 4b を次のとおり変更する。

- 4a（unroutable canon fixable ≥ 1 → `escalation`）は不変。
- 4b: `selectRoutableCanonFindings(findings, canonScope, specReviewEffectiveFixer)` のうち
  `severity` が `critical` または `high` のものが ≥ 1 のときのみ `needs-fix`。
  low / medium のみのときは fall-through し、判定 5（非 canon の critical|high）に該当しないため
  判定 6（`approved`）になる。finding は `approved` 時も記録される。

変更後の verdict 真理値表（`ok:true`・非 vacuous・decision-needed なしの前提）:

| findings                                   | 変更前    | 変更後       |
|--------------------------------------------|-----------|--------------|
| medium fixable on spec.md（routable low/med） | needs-fix | **approved** |
| low fixable on design.md（routable low/med）  | needs-fix | **approved** |
| medium fixable on tasks.md（routable low/med）| needs-fix | **approved** |
| high fixable on spec.md（routable high）      | needs-fix | needs-fix    |
| critical fixable on spec.md（routable critical） | needs-fix | needs-fix |
| medium fixable on request.md（unroutable）    | escalation | escalation  |
| medium fixable on src/example.ts（非 canon） | approved  | approved     |
| critical fixable on src/example.ts（非 canon） | needs-fix | needs-fix  |
| decision-needed                            | escalation | escalation  |

- **採用理由**: critical / high の仕様欠陥は修正の正しさ自体に判断が要り、機械検証で
  代替できないため従来どおり再レビュー往復を維持する。minor は fixer 消化 + 後段機械検証に移す。
  実効コスト（LLM 再レビュー 1 往復）が検証品質（machine-checkable な minor）を大幅に超過
  している現状を解消する。
- **却下案 — severity 閾値なしで全 fixable を直行**: critical / high の欠陥検証を落とす。
  機械検証では修正の正しさを判定できない。
- **却下案 — 現状維持（severity 不問 needs-fix ループ）**: minor 往復の連鎖が予算を
  枯渇させ、収束遅延の実測がある。修正の質に対して検証コストが不釣り合い。

### D2: `buildCanonWriteScopeFromState(state)` を追加し、遷移 predicate から canonScope を利用可能にする

遷移の `when` predicate は `state` のみ受け取り `deps` を持たない（`types.ts:148`）。
既存の `buildCanonWriteScope(state, deps)` は `deps.slug` に依存するため、predicate から
直接呼べない。

`src/core/step/canon-write-scope.ts` に `buildCanonWriteScopeFromState(state: JobState)` を追加する。
slug を `getJobSlug(state)` から導出し、スコープ構築を private helper `buildScopeForSlug(slug)` に
切り出す。`buildCanonWriteScope` と `buildCanonWriteScopeFromState` の両方がこの helper に委譲する
（single source of truth、drift 防止）。

- **採用理由**: 遷移 predicate に canonScope を持ち込む最小の追加であり、既存の
  `buildCanonWriteScope` の呼び出し点（step-completion / regression-gate）は無変更。
- **却下案 — predicate を `collectFixableFindings > 0`（canonScope 不要）にする**:
  非 canon 低位 finding のみの場合に spec-fixer へ無益に routing してしまう。
  「routable fixable ≥ 1」を精密に判定するには canonScope が必要。

### D3: 遷移 predicate 純関数モジュール `src/core/pipeline/spec-observation.ts` を追加する

impl 側の observer 遷移 predicate が `reviewer-chain.ts` に内包されているのに倣い、
spec フェーズ用の 2 つの純関数を独立モジュールに置く。

- `specReviewHasRoutableFixables(state): boolean`
  最新 spec-review run の findings に対し
  `selectRoutableCanonFindings(findings, buildCanonWriteScopeFromState(state), specReviewEffectiveFixer).length > 0`。
  `SPEC_REVIEW approved → SPEC_FIXER` の `when` guard として使う。

- `specFixerForwardsToTestGen(state): boolean`
  `getConformanceFixContext(state, SPEC_FIXER) === null` かつ 最新 spec-review run の
  verdict が `"approved"` のとき true。`SPEC_FIXER approved → TEST_CASE_GEN` の `when` guard。
  `getConformanceFixContext` は「conformance が newer かつ verdict が needs-fix:spec-fixer」の
  ときのみ非 null を返す。3 経路の分岐を表にまとめると:

  | 経路                                | conformance context | 最新 spec-review verdict | 結果          |
  |-------------------------------------|---------------------|--------------------------|---------------|
  | observation pass                    | null                | approved                 | → TEST_CASE_GEN |
  | needs-fix 起点                      | null                | needs-fix                | → SPEC_REVIEW |
  | conformance の needs-fix:spec-fixer | 非 null             | —                        | → SPEC_REVIEW |

- **採用理由**: impl 側と同型の判定構造を維持する。conformance / needs-fix 経路との分離は
  `getConformanceFixContext` + 最新 verdict の 2 条件で機械的に決まり、state フィールドの
  追加なしに閉じる。
- **却下案 — 予約フラグを state に書いて分岐**: 新規 state フィールドは resume 再構築面を増やす。

### D4: STANDARD_TRANSITIONS に guarded 行を 2 本追加する（先頭一致で排他）

`STANDARD_TRANSITIONS` に、既存の無条件行より前に guarded 行を挿入する
（`transitions.find` は先頭一致のため順序が critical）。

```
// 追加（前）
{ step: SPEC_REVIEW, on: "approved", to: SPEC_FIXER,    when: specReviewHasRoutableFixables }
// 既存（後 — routable fixable なし / guard false のとき落ちる）
{ step: SPEC_REVIEW, on: "approved", to: TEST_CASE_GEN }

// 追加（前）
{ step: SPEC_FIXER,  on: "approved", to: TEST_CASE_GEN, when: specFixerForwardsToTestGen }
// 既存（後 — observation pass でない / guard false のとき落ちる）
{ step: SPEC_FIXER,  on: "approved", to: SPEC_REVIEW }
```

`SPEC_REVIEW needs-fix → SPEC_FIXER`・`SPEC_FIXER error → escalate`・`FAST_TRANSITIONS` は不変。

- **採用理由**: 新 step を作らず既存の spec-review / spec-fixer / test-case-gen ノードを
  guarded edge で結ぶ。pipeline 形状の最小変更。
- **却下案 — spec-fixer 完了後に軽量 diff 検証 step を新設**: pipeline 形状の複雑化。
  regression-gate という既存の検証座席がある以上不要。

### D5: 予算非消費は直行遷移で構造的に満たす

observation pass の経路は `spec-review → spec-fixer → test-case-gen` で spec-review を
再入場しない。ループ予算は loop step 入場時（`budget.enterLoopStep(SPEC_REVIEW)`）にのみ
加算されるため、observation pass の spec-review 反復数は clean approved と同じ 1 に留まる。
spec-fixer は `enterFixerStep` で別カウンタとして数えられ、spec-review のループカウンタを
増やさない。

spec-fixer budget 枯渇時は既存の T-03 リルート（`pipeline.ts:445-490`）が機能する。
`outcome === "approved"` かつ `nextStep` が paired fixer（spec-fixer）かつ fixer budget ≥ max のとき、
fixer でない clean 行（`SPEC_REVIEW approved → TEST_CASE_GEN`）へリルートされる。追加実装は不要。

- **採用理由**: 構造的に満たされるため特別処理が不要。budget 消費は loop step 再入場に紐づく。
- **却下案 — spec-fixer 入場時に spec-review budget を明示的に据え置く特別処理**: 直行遷移で
  自然に満たされるため不要。

### D6: findings ledger に spec-review 由来 fixable finding を専用関数で追加する

`collectFindingsLedger` に spec-review を単純追加すると、台帳の canon 除外が
`judgeEffectiveFixer`（常に code-fixer）基準で行われるため、spec.md / design.md / tasks.md への
finding が全て unroutable と判定されて台帳から落ちる。

代わりに `collectSpecReviewLedger(state, canonScope?): Finding[]` を追加する。
spec-review の全 StepRun を走査し `resolution === "fixable"` を収集・dedupe する。
`canonScope` 指定時は `specReviewEffectiveFixer`（常に spec-fixer）基準で unroutable canon
finding を除外する（spec.md / design.md / tasks.md は保持、request.md / test-cases.md /
attestation は除外）。

`regression-gate.ts` の `buildMessage` / `skipWhen` で、既存の
`collectFindingsLedger(deriveImplReviewerChain(state), state, canonScope)` に
`collectSpecReviewLedger(state, canonScope)` を合流させ `dedupeFindings([...spec, ...impl])` を
台帳とする。`skipWhen` も合流後の台帳が空のときのみ skip する（spec-review finding のみでも
regression-gate を走らせる）。

regression-gate が regressed spec.md finding を出力した場合、`judgeEffectiveFixer`（code-fixer）
基準では unroutable → `CANON_FINDING_ESCALATION` で operator 停止する。これは既存の
canon-escalation 設計と整合する正直な帰結である。

- **採用理由**: 「agent 自己申告を信頼しない」を即時 LLM 再レビューでなく後段機械 gate で満たす、
  impl 側実績構成。spec finding は spec-fixer resolver で台帳保持する必要があるため source 別収集。
- **却下案 — `collectFindingsLedger` の chain に "spec-review" を混ぜる**:
  `judgeEffectiveFixer` 除外で spec finding が台帳から落ちる。
- **却下案 — 台帳の canon 除外 resolver を step 別に切替える汎用化**:
  finding が収集後 source を持たず、step→resolver 写像を実装すると impl chain 側の
  意味論に副作用リスクが生じる。source 別収集の方が影響が局所。

## Alternatives Considered

### A1: observation pass で消化した修正を即時 LLM で再レビューする

spec-fixer 完了後に spec-review を 1 回だけ再実行する案。

- **Pros**: 修正の質を LLM で直接確認できる。
- **Cons**: 本 request が解決しようとしている「再レビューが新 minor finding を出して
  往復が連鎖する」問題の構造的原因はそのまま。minor に再レビューを挟む以上、収束性は
  改善しない。コストと品質の不均衡も解消されない。
- **Why not**: 後段の regression-gate 機械検証（D6）が impl 側で実績のある代替検証であり、
  LLM 再レビューを挟まずに「agent 自己申告を信頼しない」を満たせる。

### A2: severity 閾値なしで全 fixable を observation pass 直行にする

critical / high も含めて全ての routable fixable finding を再レビューなしで fixer 消化する案。

- **Pros**: 全フェーズで一貫した「fixer → 直行」の単純ルール。
- **Cons**: critical / high の仕様欠陥は修正の正しさ自体に human / LLM 判断が要る。
  regression-gate の機械検証では仕様の意味論的正しさを確認できない。
- **Why not**: blocking な欠陥は即時再レビューを維持することが設計上の必須制約。

### A3: spec-fixer 完了時に軽量 diff 検証 step を新設する

spec-fixer 後に新規 step（diff-checker 等）を挿入して修正内容を機械的に確認する案。

- **Pros**: spec-review という LLM step を避けつつ修正の正確性を個別に確認できる。
- **Cons**: pipeline 形状に新 step が増え複雑化する。regression-gate という既存の
  検証座席が同等の役割を担えるため、step 新設は YAGNI。
- **Why not**: D4 で採用した guarded edge + D6 の ledger 拡張が最小変更で同等の
  品質保証を実現する。

### A4: 現状維持（severity 不問で needs-fix ループ）

変更を加えず、全 fixable finding を従来どおり再レビュー往復で処理する案。

- **Pros**: 変更なし、リスクゼロ。
- **Cons**: minor finding のたびに再レビュー往復が発生し、予算枯渇と収束遅延の
  実測（minor finding 6 件で 5 往復・operator resume 2 回）がある。修正の質に対して
  検証コストが不釣り合いな構造的問題がそのまま残る。
- **Why not**: 最小変更で実証された解法（impl 側 observation auto-fix の移植）があり、
  現状維持を選ぶ合理的理由がない。

## Consequences

### Positive

- spec フェーズでも「minor は fixer 消化 + 後段機械検証、blocking のみ即時再レビュー」という
  基準が impl フェーズと一貫するようになり、設計原則が両フェーズで統一される。
- minor finding による往復連鎖が構造的に解消され、観測された 5 往復→1 パスへの収束改善が
  期待できる。
- observation pass が spec-review のループ予算を消費しないため、予算の実効配分が
  blocking な指摘の解決に集中する。
- findings ledger に spec-review finding が載ることで、observation pass で消化した修正が
  regression-gate の機械検証対象となる（「agent 自己申告を信頼しない」の構造的担保）。
- conformance の needs-fix:spec-fixer 起点（reverification 経路）および needs-fix 起点は
  `specFixerForwardsToTestGen` の guard で確実に分離され、既存の再検証ループは不変に保たれる。

### Negative

- `deriveSpecReviewVerdict` の挙動変更により、#913 以前（severity 不問 needs-fix）を
  期待していた単体テストは期待値の更新が必要になる。
- regression-gate に spec-review finding が加わることで、gate の発動条件が広がる（以前は
  impl reviewer chain が空のとき gate が skip されていたが、spec finding のみでも gate が走る）。
- spec-fixer budget 枯渇で T-03 リルートが発火する可能性は残る（既存の有界ループ設計の内側）。

### Known Debt

- **regression-gate で regressed spec.md finding が出た場合の operator 解消フロー**:
  `judgeEffectiveFixer` 基準で unroutable → `CANON_FINDING_ESCALATION` で operator 停止する。
  これは正直な挙動だが、operator が canon finding を spec-fixer 書込集合と照合して
  適用の要否を判断する手順が docs として整備されていない。
- **impl 側の observation auto-fix と spec 側の ledger 収集の対称性**:
  impl 側は `collectFindingsLedger`（impl chain のみ）、spec 側は `collectSpecReviewLedger`
  の専用関数で収集する非対称設計。将来的に汎用化する場合は source 別 resolver 写像の設計が必要。
- **regression-gate が custom reviewer 不在時に注入されない制約**:
  custom reviewer 不在時は regression-gate が pipeline に存在せず、spec-review ledger finding の
  機械検証が行われない。これは impl 側 observation auto-fix と対称（code-review の observation pass も
  custom reviewer 不在時は gate なし）であり、現設計の known constraint である。

## References

- Request: `specrunner/changes/spec-observation-autofix/request.md`
- Design: `specrunner/changes/spec-observation-autofix/design.md`
- Spec: `specrunner/changes/spec-observation-autofix/spec.md`
- Implementation:
  `src/core/step/judge-verdict.ts` /
  `src/core/step/canon-write-scope.ts` /
  `src/core/pipeline/spec-observation.ts` /
  `src/core/pipeline/types.ts` /
  `src/core/pipeline/findings-ledger.ts` /
  `src/core/step/regression-gate.ts`
- Tests: `tests/core/pipeline/spec-observation-autofix.test.ts` /
  `src/core/step/__tests__/spec-review-fixer-routing.test.ts` /
  `tests/core/pipeline/pipeline.conformance-routing.test.ts`
- Related: [ADR-20260526-observation-auto-fix-pipeline](2026-05-26-observation-auto-fix-pipeline.md)
  — impl フェーズの observation auto-fix 基盤（本 ADR が spec フェーズへ移植）
- Related: [ADR-20260723-canon-finding-escalation-routing](2026-07-23-canon-finding-escalation-routing.md)
  — `CanonWriteScope` / `selectRoutableCanonFindings` / `specReviewEffectiveFixer` の設計基盤
- Related: [ADR-20260724-spec-fixer-tasks-md-writable](2026-07-24-spec-fixer-tasks-md-writable.md)
  — spec-fixer 書込集合の確定（routable 集合 = {spec.md, design.md, tasks.md}）
- Related: [ADR-20260723-spec-review-fixer-routing](2026-07-23-spec-review-fixer-routing.md)
  — spec-review の fixable canon finding を spec-fixer に routing する先行基盤
