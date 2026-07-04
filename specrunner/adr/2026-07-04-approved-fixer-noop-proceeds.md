# ADR-20260704: code-review approved 経路の code-fixer no-op を escalate しない

## ステータス

accepted

## コンテキスト

code-review が `approved`（マージ可）で findings が non-blocking（low/medium の fixable）のみのとき、pipeline が code-fixer で halt する問題があった。原因は 3 つの機構の相互矛盾である。

1. **routing**（`src/core/pipeline/reviewer-chain.ts:151-164`）: reviewer verdict が `approved` でも `collectFixableFindings(findings).length > 0` なら severity 不問で code-fixer に遷移する（findings-derived routing）。
2. **code-fixer prompt**: 全 variant が「Fix HIGH/CRITICAL（mandatory）/ Fix MEDIUM only if no design changes / **Ignore LOW**」と指示する。findings が low のみなら code-fixer は指示どおり source を変更しない。
3. **no-op 検知**（#734 で追加）: `step.noOpDetect === true` かつ `completionReason === "success"` かつ source file 変更ゼロのとき、**無条件で** verdict を `needs-fix` に override する。triggering verdict も findings severity も参照しない。

帰結として、approved + low-only fixable → code-fixer no-op → `no-op-detect` が `needs-fix` override → code-fixer の遷移表に `needs-fix` 行が無いため未マッチ → escalate → `awaiting-resume`（halt）となり、無人運用が成立しない。

no-op escalation の本来の目的（#734）は「code-fixer が**必須**の findings（high/critical）を直すべきなのに空振りした」ことの検出である。approved 経路には必須 findings が存在しないため、no-op は正当な結果であり escalate すべきでない。#734 の design.md（D3 Risk）自身がこの後退を予見していた（「変更ゼロ = needs-fix となると、code-fixer が "正当に何もしなかった" ケースでもループが回る可能性」）。

### 発見した edge case

ナイーブな「active reviewer approved+fixable」判定のみで除外すると、以下の 2 経路で正当な escalation が抑止される。

- **conformance-after-fixable**: code-review approved+fixable → fixer(no-op, 本 ADR で exempt) → conformance が実 non-conformity を検出し `needs-fix:code-fixer` → fixer(no-op)。この 2 回目でも `resolveActiveReviewer` は code-review を返し、その verdict は依然 approved+fixable。ナイーブ判定は true → conformance の真の空振りを握り潰す。
- **composed-path の coordinator/gate 経路**: custom reviewer 群は coordinator 経由で fixer を起動する。`resolveActiveReviewer` は最新 member を返すため、coordinator needs-fix 起動の fixer no-op でも、たまたま最新 member が approved+fixable だと true になり、regression-gate/coordinator の真の空振りを握り潰す。

## 決定

### D1: no-op 除外判定を純粋関数 `codeReviewFindingsRoutingActive` として reviewer-chain.ts に追加する

`src/core/pipeline/reviewer-chain.ts` に、code-fixer の起動が「code-review の findings-routing（approved + fixable）」由来かを判定する純粋関数を追加する。既存の `conformanceFixInProgress` / `regressionGateActive` / `codeReviewLoopActive` と同じ predicate 群に属する。

判定は次の 3 条件の AND とする。

1. **conformance 由来でない**: `getConformanceFixContext(state, STEP_NAMES.CODE_FIXER) === null`（= conformance が実 non-conformity で fixer を起動した場合は escalate を保持）。上記 edge case「conformance-after-fixable」を除外する。
2. **triggering verdict が approved + fixable**: `state.steps["code-review"]` の latest run の verdict が `"approved"` かつ fixable finding が 1 件以上。`regressionGateActive` の approved-but-fixable イディオムを code-review に適用したもの。
3. **code-review が active reviewer**: `resolveActiveReviewer(state, deriveImplFixerChain(state))` が `STEP_NAMES.CODE_REVIEW` を返す（code-review の後に custom reviewer / regression-gate が走っていない）。上記 edge case「composed-path」を除外する。

「code-review が approved+fixable かつ active」であることが findings-routing 起動の必要十分に近い identification になる理由: reviewer chain のうち approved+fixable が fixer に直行するのは code-review だけである（custom member の verdict は coordinator が集約し、regression-gate の approved は fixable を含み得ない）。条件 1 の conformance ガードが、標準経路での conformance-after-fixable 誤判定を塞ぐ。

### D2: `detectNoOp` の呼び出し側（executor）で除外フラグを算出し、`detectNoOp` は override を抑止する

`detectNoOp` を generic なまま保ち（source 変更ゼロ検出のみ）、reviewer-chain の知識は executor 側に置く。

- `src/core/step/executor.ts` の `detectNoOp` 呼び出しに `findingsRoutingApproved: step.noOpDetect === true ? codeReviewFindingsRoutingActive(state) : false` を渡す。
- `src/core/step/no-op-detect.ts` の `detectNoOp` params に `findingsRoutingApproved?: boolean` を追加（省略時 `false` = #734 の既存挙動を安全側 default）。source 変更ゼロかつ `findingsRoutingApproved === true` のとき override せず `undefined` を返し、診断ログを出す。

**遷移表の変更は不要**: override が抑止されると code-fixer の verdict は `completionVerdict = "approved"` のまま確定する。既存の `code-fixer approved → conformance when active===code-review AND lastVerdict(code-review)===approved`（標準経路）および composed-path の `code-fixer approved → coordinator` が、そのまま次段へ前進させる。

## 検討した代替案

### Alternative 1: routing で approved+fixable を code-fixer に送らない

- **Pros**: upstream で問題を消せる。
- **Cons**: medium-requiring-design の fixable も legitimate な no-op を生む（code-fixer は「medium は design changes があれば無視」と指示されている）。routing-level fix は low-only ケースしか救わない。
- **Why not**: no-op escalation を triggering verdict に依存させることが根本対策。routing 変更は要件の部分集合しか解決しない。

### Alternative 2: code-fixer で `noOpDetect` を無効化する

- **Pros**: 実装が最小（`noOpDetect: false` に変更するだけ）。
- **Cons**: needs-fix 経路の真の空振り検出（#734）まで失われる。code-fixer が high/critical を直すべきなのに source を変更しなかったケースが素通りする。
- **Why not**: #734 の検出は維持が要件。

### Alternative 3: `detectNoOp` に `state` を渡し内部で判定する

- **Pros**: executor 側の実装が簡潔になる。
- **Cons**: `no-op-detect.ts` が reviewer-chain に依存し、generic な「source 変更ゼロ検出」の責務が code-fixer 固有知識で汚れる。
- **Why not**: executor 側でフラグ算出（D2）の方が層の分離が明確。`detectNoOp` の単一責務を保てる。

### Alternative 4: active reviewer のみで判定（conformance/composed-path ガードなし）

- **Pros**: 実装が単純。
- **Cons**: 上記 edge case（conformance-after-fixable、composed-path coordinator）で正当な escalation を握り潰す。
- **Why not**: D1 の 3 条件 AND でガードする方式が採用。

## 影響

- approved + fixable findings 経路で code-fixer が source 無変更でも pipeline が halt せず次段へ進む
- needs-fix 経路（high/critical）の no-op escalation は #734 のまま維持される
- approved 経路で code-fixer が source を変更した場合は従来どおり re-review へループする
- conformance / regression-gate / coordinator 由来の no-op escalation は不変
- `detectNoOp` の `findingsRoutingApproved` は optional（default `false`）のため、将来の別呼び出し元が渡し忘れても安全側（escalate）に倒れる
- 遷移表（`types.ts`）および code-fixer prompt は無変更

## 参照

- Request: `specrunner/changes/approved-fixer-noop-proceeds/request.md`
- Design: `specrunner/changes/approved-fixer-noop-proceeds/design.md`
- Spec: `specrunner/changes/approved-fixer-noop-proceeds/spec.md`
- Implementation: `src/core/pipeline/reviewer-chain.ts` · `src/core/step/no-op-detect.ts` · `src/core/step/executor.ts`
- Related: `2026-06-12-reviewer-chain-regression-gate.md`（`regressionGateActive` イディオムの定義元）
