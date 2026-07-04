# Design: code-review が approved のとき code-fixer の no-op を escalate しない

## Context

code-review が `approved`（マージ可）で、findings が非ブロッキング（low/medium の fixable）
のみのとき、pipeline が code-fixer で halt する。approved なのに nit が 1 つでもあると PR まで
到達できず、無人運用が成立しない。

原因は 3 つの機構の相互矛盾である。「approved + fixable のみ」ケースで、routing は fixer が
無視するよう指示された作業を送り込み、no-op 検知はその（正しい）無作為を失敗として escalate する。

1. **routing**（`src/core/pipeline/reviewer-chain.ts:151-164`）: reviewer の verdict が `approved`
   でも `collectFixableFindings(findings).length > 0` なら（severity 不問で）code-fixer に遷移する
   （findings-derived routing）。
2. **code-fixer prompt**（`src/core/step/code-fixer.ts:191,236,263,314,335`）: 全 variant が
   「Fix HIGH/CRITICAL（mandatory）/ Fix MEDIUM only if no design changes / **Ignore LOW**」と指示する。
   findings が low のみなら code-fixer は指示どおり source を変更しない。
3. **no-op 検知**（#734 で `src/core/step/no-op-detect.ts` に追加）: `step.noOpDetect === true` かつ
   `completionReason === "success"` かつ source file 変更ゼロのとき、**無条件で** verdict を
   `needs-fix` に override する（`src/core/step/executor.ts:551-559` で `detectNoOp` を呼び出し、
   `finalizeStep` の `verdictOverride` 経由で `:854-856` が適用）。triggering verdict も findings
   severity も参照しない。

帰結: approved の code-review が low-only fixable findings を出すと、code-fixer が指示どおり no-op
→ `no-op-detect` が `needs-fix` override → code-fixer の遷移表には `needs-fix` 行が無い（approved /
error のみ）ため未マッチ → escalate → `awaiting-resume`（halt）。

no-op escalation の本来の目的（#734）は「code-fixer が**必須**の findings（high/critical）を直すべき
なのに空振りした」ことの検出である。approved 経路には必須 findings が存在しないため、no-op は正当な
結果であり escalate すべきでない。#734 の design.md（D3 Risk）自身がこの後退を予見していた
（「変更ゼロ = needs-fix となると、code-fixer が "正当に何もしなかった" ケースでもループが回る可能性」）。

### 現状コードの前提（grep 再検証済み）

- `src/core/pipeline/reviewer-chain.ts:71-86` `resolveActiveReviewer`: reviewer chain のうち最新
  `startedAt` の reviewer を返す（fixer がどの reviewer 由来かの解決に使う）。
- `src/core/pipeline/reviewer-chain.ts:47-54` `deriveImplFixerChain`: `[code-review, ...custom, regression-gate]`
  を返す。**conformance は含まれない**。
- `src/core/pipeline/reviewer-chain.ts:239-241` `conformanceFixInProgress` /
  `:251-265` `regressionGateActive`: fixer の起動源を判定する既存 predicate 群。特に
  `regressionGateActive` は「active gate の latest verdict が approved かつ fixable > 0（findings-routing）」
  というイディオムを持つ（`:258-263`）。
- `src/core/step/fixer-helpers.ts:101-133` `getConformanceFixContext`: conformance の verdict が
  `needs-fix:<step>` かつ predecessor（code-fixer の場合は active reviewer）より新しいときに findings を
  返す recency 判定。conformance 由来の fixer 起動を識別する正本ロジック。
- `src/core/pipeline/types.ts:255,305` `buildReviewerChainTransitions(["code-review"])`: 標準（custom
  reviewer 無し）経路の遷移を生成。`code-fixer approved → conformance when active===code-review AND
  lastVerdict(code-review)===approved` 行を持つ（`:191-202`）。custom reviewer がある場合は
  `buildParallelReviewerTransitions`（`:329-462`）が使われ、`code-fixer approved` は coordinator へ戻る。
- `src/core/step/executor.ts:551-559`: `detectNoOp` 呼び出し箇所。`step.noOpDetect === true` の step
  （現状 code-fixer のみ）に対し `verdictOverride` を算出する。

### 発見した edge case（ナイーブな「active reviewer approved+fixable」判定では後退する）

`detectNoOp` が override すべきか否かを「active reviewer の latest verdict が approved かつ fixable > 0」
のみで判定すると、以下の 2 経路で**正当な escalation が抑止**され、#734 と scope（conformance /
regression-gate 挙動不変）を後退させる:

- **conformance-after-fixable**: code-review approved+fixable → fixer(no-op, 本 request で exempt)
  → conformance が実 non-conformity を検出し `needs-fix:code-fixer` → fixer(no-op)。この 2 回目の
  fixer entry でも `resolveActiveReviewer` は（conformance を chain に含まないため）code-review を返し、
  その latest verdict は依然 approved+fixable。ナイーブ判定は true → **conformance の真の空振りを握り潰す**。
- **composed-path の coordinator/gate 経路**: custom reviewer 群は coordinator 経由で fixer を起動する
  （member 単位の approved+fixable は fixer に直行しない）。`resolveActiveReviewer` は最新 member を返す
  ため、coordinator needs-fix で起動された fixer no-op でも、たまたま最新 member が approved+fixable
  だと true になり、**regression-gate/coordinator の真の空振りを握り潰す**。

本設計はこの 2 経路を明示的に除外する（D1 の条件 1・3）。

## Goals / Non-Goals

**Goals**:

1. code-review の findings-routing（approved + fixable）経路で起動された code-fixer の no-op を
   escalate せず、verdict を `approved` のまま次段へ進める（要件 1）。
2. needs-fix 経路（code-review が high/critical を検出）の no-op escalation を維持する
   （#734 の真の空振り検出を回帰させない。要件 2）。
3. fixer が実際に source を変更した場合の挙動を不変に保つ（要件 3）。
4. conformance / regression-gate / coordinator 由来の no-op escalation を不変に保つ（要件 4）。

**Non-Goals**:

- code-fixer prompt の「Ignore LOW」方針の変更（low を PR に取り込まない方針は妥当）。
- routing（`reviewer-chain.ts` の遷移表）で approved+fixable を code-fixer に送らないようにする変更
  （medium-requiring-design も legitimate な no-op を生むため、no-op escalation の verdict 依存化が本質）。
- `noOpDetect` を code-fixer で無効化する変更（needs-fix 経路の真の空振り検出まで失われる）。
- composed-path の **custom member** approved+fixable → fixer no-op の救済（本 request は
  code-review→code-fixer が対象。custom reviewer は coordinator 経由で挙動が異なるため scope 外。
  現状どおり escalate する）。

## Decisions

### D1: no-op 除外判定を純粋関数 `codeReviewFindingsRoutingActive` として reviewer-chain.ts に追加する

**決定**: `src/core/pipeline/reviewer-chain.ts` に、code-fixer の起動が「code-review の
findings-routing（approved + fixable）」由来かを判定する純粋関数を追加する。既存の
`conformanceFixInProgress` / `regressionGateActive` / `codeReviewLoopActive` と同じ predicate 群に属する。

判定は次の 3 条件の AND とする（すべて満たすときのみ `true`）:

1. **conformance 由来でない**: `getConformanceFixContext(state, STEP_NAMES.CODE_FIXER) === null`
   （= `conformanceFixInProgress(state)` が `false`）。conformance が実 non-conformity で fixer を
   起動した場合、no-op は真の空振りなので escalate すべき。上記 edge case「conformance-after-fixable」を除外する。
2. **triggering verdict が approved + fixable**: `state.steps["code-review"]` の latest run の
   `outcome.verdict === "approved"` かつ `collectFixableFindings(latest.outcome.toolResult?.findings ?? []).length > 0`。
   `regressionGateActive` の approved-but-fixable イディオム（`reviewer-chain.ts:258-263`）を code-review に適用したもの。
3. **code-review が active reviewer**: `resolveActiveReviewer(state, deriveImplFixerChain(state)) === STEP_NAMES.CODE_REVIEW`。
   code-review の後に custom reviewer / regression-gate が走っていない（= fixer 起動源が code-review の
   findings-routing である）ことを保証する。composed-path の coordinator/gate 経路と、regression-gate
   needs-fix 経路を除外する。

**なぜ code-review 限定か**: reviewer chain のうち「approved + fixable が fixer に**直行**する」のは
code-review だけである（`buildReviewerChainTransitions:151-164` および
`buildParallelReviewerTransitions:338-351`）。custom member の verdict は coordinator が集約し、
regression-gate の approved は fixable を含み得ない（`deriveRegressionGateVerdict` は fixable ≥ 1 で
needs-fix）。したがって「code-review が approved+fixable かつ active」であることが、findings-routing
起動の必要十分に近い identification になる。条件 1 の conformance ガードが、code-review が chain 内で
唯一の reviewer である標準経路での conformance-after-fixable 誤判定を塞ぐ。

**代替案**:
- **active reviewer を無条件に見る（member 含む）**: 上記 edge case で conformance / coordinator の
  真の空振りを握り潰す（後退）。却下。
- **routing で approved+fixable を fixer に送らない**: medium-requiring-design の legitimate な no-op を
  取りこぼす。request の「却下」判断に一致。
- **`noOpDetect` を無効化**: needs-fix 経路の #734 検出まで失う。request の「却下」判断に一致。

**理由**: no-op escalation を「fixer を起動した triggering verdict」に依存させるのが根本対策。純粋関数
かつ既存 predicate 群と同じイディオムのため、テスト容易で executor に知識を持ち込まない。

### D2: `detectNoOp` の呼び出し側（executor）で除外フラグを算出し、`detectNoOp` は override を抑止する

**決定**: `detectNoOp` を generic なまま保ち（source 変更ゼロ検出のみ）、reviewer-chain の知識は
executor 側に置く。

- `src/core/step/executor.ts:551-559` の `detectNoOp` 呼び出しに、
  `findingsRoutingApproved: step.noOpDetect === true ? codeReviewFindingsRoutingActive(state) : false`
  を渡す。executor は既に pipeline の知識を持つ層であり、`reviewer-chain.js` を新規 import する。
- `src/core/step/no-op-detect.ts` の `detectNoOp` params に `findingsRoutingApproved?: boolean` を追加
  （省略時 `false` = #734 の既存挙動を安全側 default とする）。source 変更ゼロ（`sourceFiles.length === 0`）
  のとき、`findingsRoutingApproved === true` なら override せず `undefined` を返し、診断ログを出す。
  `false` なら従来どおり `"needs-fix"` を返す。

**遷移表の変更は不要**: override が抑止されると code-fixer の verdict は `completionVerdict = "approved"`
のまま確定する。既存の `code-fixer approved → conformance when active===code-review AND
lastVerdict(code-review)===approved`（標準経路 `reviewer-chain.ts:191-202`）／
composed-path の `code-fixer approved → coordinator`（default）が、そのまま次段へ前進させる。
本 request は新しい遷移行を追加しない。

**代替案**:
- **`detectNoOp` に `state` を渡し内部で判定**: `no-op-detect.ts` が reviewer-chain に依存し、generic
  な「source 変更ゼロ検出」の責務が code-fixer 固有知識で汚れる。executor 側算出の方が層の分離が明確。
- **executor で無条件にフラグ算出**: `step.noOpDetect` でガードし、非 code-fixer step で reviewer-chain
  ロジックを走らせない。

**理由**: `detectNoOp` の単一責務（source 変更ゼロ検出）を保ち、pipeline routing の知識は executor /
reviewer-chain に閉じる。architect 採用案（「executor 呼び出しに情報を渡す」）に一致。

## Risks / Trade-offs

### [Risk] conformance-after-fixable で真の空振りを握り潰す

code-review approved+fixable → fixer(exempt) → conformance needs-fix:code-fixer → fixer(no-op) の
2 回目で誤って exempt すると、conformance の実問題を握り潰す。

**Mitigation**: D1 条件 1（`conformanceFixInProgress` ガード）で除外。`getConformanceFixContext` の
recency 判定が conformance 由来 entry を識別するため、2 回目は `false` → override → escalate。
T-03 のテストで固定する。

### [Risk] composed-path の coordinator/gate no-op を握り潰す

custom reviewer 経路で `resolveActiveReviewer` が member を返すため、coordinator needs-fix 起動の
fixer no-op を誤って exempt する恐れ。

**Mitigation**: D1 条件 3（`active===code-review`）で除外。member / regression-gate が active のときは
`false`。既存の conformance / regression-gate テストが無変更で green（要件 4）。

### [Risk] approved 経路で fixer が本来直すべき fixable を放置しても素通りする

approved 経路の fixable は定義上 non-blocking（high/critical なし。`deriveJudgeVerdict` より
approved verdict には critical/high・decision-needed が存在しない）。よって no-op は正当であり、
放置は「Ignore LOW」方針・「medium only if no design changes」方針の想定内。PR に取り込まない方針は
Non-Goals で維持。後退なし。

### [Risk] `findingsRoutingApproved` の default 値

`detectNoOp` の新 param を optional（default `false`）にすることで、将来の別呼び出し元が渡し忘れても
安全側（#734 の escalate 挙動）に倒れる。唯一の呼び出し元は executor（`grep detectNoOp` で確認済み）。

## Open Questions

なし（要件 1-4 と発見した edge case について根本原因・実装方針・除外条件が確定済み）。
