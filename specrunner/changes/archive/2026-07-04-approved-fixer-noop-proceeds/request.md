# code-review が approved のとき code-fixer の no-op を escalate しない

## Meta

- **type**: spec-change
- **slug**: approved-fixer-noop-proceeds
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

code-review が `approved`（マージ可）で、findings が非ブロッキング（low severity）の fixable のみのとき、pipeline が code-fixer で halt する。approved なのに nit が1つでもあると PR まで到達できず、無人運用が成立しない。

原因は3つの機構の相互矛盾である。「approved + low のみ fixable」ケースで、routing は fixer が無視するよう指示された作業を送り込み、no-op 検知はその（正しい）無作為を失敗として escalate する。

1. routing: approved の review + fixable finding が1つでもあれば（severity 不問）code-fixer に遷移する。
2. code-fixer prompt: 「Ignore LOW severity findings」。findings が low のみなら code-fixer は指示通り source を変更しない。
3. no-op 検知（#734 で追加）: source 変更ゼロを無条件で needs-fix に override し escalate する。triggering verdict / severity を参照しない。

no-op escalation の本来の目的は「code-fixer が**必須**の findings（high/critical）を直すべきなのに空振りした」ことの検出である。approved 経路には必須 findings が存在しないため、no-op は正当な結果であり escalate すべきでない。

## 現状コードの前提

- `src/core/pipeline/reviewer-chain.ts:151-162`: approved の reviewer verdict + `collectFixableFindings(findings).length > 0` で code-fixer にルーティングする（severity を区別しない）。同ファイル `:251-264`（`regressionGateActive`）に「approved but fixable = findings-routing 経路」を判定する既存イディオムがある。
- `src/core/step/code-fixer.ts:191,236,263,314,335`: code-fixer prompt の全 variant が「Fix all HIGH and CRITICAL（mandatory）/ Fix MEDIUM only if no design changes / Ignore LOW severity findings」と指示する。
- `src/core/step/no-op-detect.ts:44-60`: `step.noOpDetect === true` かつ `completionReason === "success"` かつ source file 変更ゼロのとき、無条件で verdict を `needs-fix` に override する。triggering verdict も findings severity も参照しない。
- `src/core/step/executor.ts:549` 付近: `detectNoOp` の呼び出し箇所。
- `src/core/step/code-fixer.ts:119`: code-fixer は `noOpDetect: true`。
- 帰結: approved の code-review が low-only fixable findings を出すと、code-fixer が指示通り no-op → `no-op-detect` が needs-fix override → escalate → `awaiting-resume`（halt）。

## 要件

1. **findings-routing（approved）経路で起動された code-fixer の no-op を escalate しない。** code-fixer を起動した triggering reviewer verdict が `approved`（＝必須の high/critical findings が無く、fixable findings による findings-routing 経路）のとき、code-fixer が source 無変更でも verdict を `needs-fix` に override せず、pipeline を次段へ進める。
2. **needs-fix 経路の no-op escalation は維持する。** triggering verdict が `needs-fix`（fixer が high/critical を直すべき経路）で source 無変更のとき、従来通り `needs-fix` override → escalate する（#734 の真の空振り検出を回帰させない）。
3. **fixer が実際に source を変更した場合の挙動は不変。** approved 経路でも code-fixer が low/medium fixable を適用して source を変更したら、従来通り re-review へループする。

## スコープ外

- code-fixer prompt の「Ignore LOW」方針の変更（low を PR に取り込まない方針は妥当なので変えない）。
- routing（`reviewer-chain.ts`）で approved+low-only を code-fixer に送らないようにする案は、実装手段としては可だが要件ではない。medium-requiring-design も legitimate な no-op を生むため、no-op escalation を triggering verdict に依存させるのが本質。外形挙動は要件1-3で固定する。
- conformance / regression-gate 由来の code-fixer no-op（本 request は code-review→code-fixer の findings-routing 経路が対象。他経路の挙動は不変とする）。

## 受け入れ基準

- [ ] code-review が `approved` + low-only fixable findings のとき、code-fixer が source 無変更でも pipeline が halt せず次段へ進むことをテストで固定する。
- [ ] code-review が `needs-fix`（high/critical）で code-fixer が source 無変更のとき、従来通り `needs-fix` override → escalate することをテストで固定する（#734 回帰防止）。
- [ ] approved 経路で code-fixer が source を変更した場合は re-review へループする（テストで固定、または既存テスト無変更 green）。
- [ ] 既存の conformance / regression-gate no-op 挙動が不変であることを既存テスト無変更 green で確認する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

**採用**

- no-op escalation を triggering verdict に依存させる。`detectNoOp`（またはその executor 呼び出し `src/core/step/executor.ts:549`）に、code-fixer を起動した経路が findings-routing（approved）か needs-fix かの情報を渡し、findings-routing 経路では source 無変更でも override を抑止する。
- findings-routing 判定は `src/core/pipeline/reviewer-chain.ts:251-264`（`regressionGateActive` の approved-but-fixable 判定）と同じイディオム（active reviewer の latest verdict が approved かつ fixable findings > 0）を再利用する。

**却下**

- routing で「approved + low-only fixable」を code-fixer に送らない案のみ: medium-requiring-design の fixable も legitimate な no-op を生むため取りこぼす。no-op escalation の verdict 依存化が根本。
- `noOpDetect` を code-fixer で無効化する案: needs-fix 経路の真の空振り検出（#734）まで失われるため却下。
