# reviewer の approved を fixer 予算切れで覆さない — 任意修正の省略を明示して次工程へ進む

## Meta

- **type**: spec-change
- **slug**: approved-not-overturned-by-fixer-budget
- **base-branch**: main
- **adr**: false

<!-- 振る舞い（routing 契約）を変える修正のため bug-fix でなく spec-change。新しい port/adapter や設計選択の追加は無いため adr は false。既存の「approve は停止ゲートであり、非ブロッキング指摘でループしない」方針の適用にあたる。 -->

## 背景

reviewer が `approved` を返しているのに、pipeline が「承認されなかった」と称して停止する経路がある。

発火条件は、reviewer が `approved`（blocking な critical / high finding が無い）で、`Fix: yes` の fixable finding が 1 件以上あり、かつ paired fixer の iteration budget を使い切っている場合。approved は fixable findings routing により fixer へ遷移し、fixer 突入前の exhaustion 検査が発火して escalation する。

結果として次の2つの問題が同時に起きる。

1. **承認が覆る**: blocking でない指摘のために、承認済みの成果物で pipeline が停止する。手動 resume が必要になる
2. **表示が事実と異なる**: 停止理由が `<step> did not approve after N iterations` と表示されるが、実際には approve されている。原因（fixer 予算切れ）が読み取れず、原因追跡を誤らせる

本 request は routing を修正し、承認が予算切れで覆らないようにする。あわせて「任意修正を予算切れで省略した」ことを記録に残し、後から追える形にする。

リリース 0.4.1 のブロッカーとして扱う。

## 現状コードの前提

- `src/core/pipeline/reviewer-chain.ts:154` — standard 経路（`buildReviewerChainTransitions`）に `step: CODE_REVIEW / on: "approved" / to: CODE_FIXER` の遷移があり、`when` は `collectFixableFindings(findings).length > 0`（`:162`）。
- `src/core/pipeline/reviewer-chain.ts:381` — custom / parallel 経路（`buildParallelReviewerTransitions`）に同型の遷移があり、`when` は同じく fixable findings の有無（`:390`）。**両経路に存在するため、片方だけの修正では塞がらない。**
- `src/core/pipeline/pipeline.ts:493-499` — 次ステップが fixer のとき `tryExhaust(...)` を `phase: "review-after-final-fix"` / `reportIteration: effectiveMax` で呼ぶ。ここが exhaustion を発火させる位置。
- `src/core/pipeline/pipeline.ts:563` — `tryExhaust` は `opts.iteration < effectiveMax` なら素通り、達していれば `handleExhausted` を呼ぶ。**直前の reviewer verdict を参照していない。**
- `src/core/pipeline/types.ts:179` — 停止メッセージは `LOOP_ERROR_CODES` の `(n) => \`code-review did not approve after ${n} iterations\``。verdict に関係なくこの文言が使われる。
- verdict は findings から導出される（blocking rules: `decision-needed` ≥1 → escalation、`critical` または `high` ≥1 → needs-fix、それ以外 → approved）。markdown の verdict 行は機械 routing に使われない。

## 要件

1. **approved は fixer 予算切れで覆らない**: 直前の reviewer verdict が `approved` の場合、paired fixer の iteration budget を使い切っていても exhaustion による escalation を発火させない。standard 経路・custom / parallel 経路の**両方**で成立させる。

2. **fixable findings は記録に残す**: 予算切れで適用されなかった low / medium の fixable finding を破棄しない。findings が参照可能な形（既存の review-feedback 成果物）で残ることを保証する。

3. **省略を明示して次工程へ進む**: 「任意修正を予算切れで省略した」ことを history / event に明示的に記録した上で、approved の遷移先（reviewer chain の次段、または coordinator）へ進む。記録は後から「なぜ適用されなかったか」を追える内容にする（対象 step 名・省略した fixable finding 件数を含む）。黙って省略しない。

4. **`needs-fix` の予算切れは従来どおり停止する**: verdict が `needs-fix` のまま fixer budget を使い切った場合の escalation 挙動は変更しない。停止メッセージも従来どおり。

5. **停止メッセージが verdict と矛盾しない**: 要件1 により approved で停止しなくなるため、`did not approve` の文言は verdict が approved でない場合にのみ出力される状態にする。

## スコープ外

- reviewer の verdict 導出規則（blocking rules）の変更。本 request は verdict を所与として routing のみを扱う
- fixer の maxIterations 既定値の変更
- 停止時の hint 文言の全面見直し（要件5 の矛盾解消を超える範囲）
- `verification` / `conformance` / `regression-gate` など、reviewer 以外の loop step の exhaustion 挙動

## 受け入れ基準

- [ ] **T1（standard 経路・承認を覆さない）**: standard reviewer 構成で、reviewer が `approved` かつ fixable finding あり、paired fixer が budget 使い切り済みの状態から、pipeline が escalation せず approved の遷移先へ進むことを固定する。**破壊確認**: 修正を無効化すると本テストが escalation で落ちること。
- [ ] **T2（custom / parallel 経路・承認を覆さない）**: custom reviewer（parallel 構成）で同条件から escalation しないことを固定する。T1 と独立に置く（`buildParallelReviewerTransitions` は別経路のため、T1 の green は本経路の証拠にならない）。
- [ ] **T3（省略の明示）**: 上記の省略が発生したとき、history / event に「任意修正を予算切れで省略した」旨と対象 step 名・省略した fixable finding 件数が記録されることを固定する。
- [ ] **T4（needs-fix は従来どおり停止）**: verdict が `needs-fix` のまま fixer budget を使い切った場合、従来どおり escalation し、停止メッセージも従来どおりであることを固定する（回帰防止）。
- [ ] **T5（findings の保持）**: 省略された fixable findings が review-feedback 成果物から失われないことを固定する。
- [ ] **T6（backward-compat）**: 既存の pipeline / exhaustion / reviewer-chain / custom-reviewers のテストが無変更で green（本 request で意味が変わる approved-exhaustion 系の期待更新を除く）。`typecheck && test` が green。

## architect 評価済みの設計判断

- **exhaustion 検査は直前の reviewer verdict を参照して判断する**。→ 却下: 遷移表から「approved → fixer」の行を削除する（予算に余裕がある通常時の任意修正適用まで失われる）。
- **standard 経路と custom / parallel 経路の両方を同時に直す**。→ 却下: `code-review` の行だけ直す（custom reviewer 構成で同じ停止が残る）。
- **省略は history / event に明示する**。→ 却下: 黙って次工程へ進める（暫定の省略が記録に残らず、後から追えない）。
- **`needs-fix` の停止挙動は変更しない**。→ 却下: exhaustion 全体を緩める（blocking な指摘を予算切れで素通しすることになる）。
