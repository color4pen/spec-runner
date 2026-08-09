# low/medium finding の偽ループを解消し regression-gate を新規退行の検出に限定する

## Meta

- **type**: spec-change
- **slug**: regression-gate-false-loop
- **base-branch**: main
- **adr**: true

## 背景

low / medium severity の fixable finding が、one-shot で処理されるはずの経路（reviewer approved + fixable → code-fixer → 次 reviewer へ前進）から regression-gate のループに引き戻され、修正されないことが確定している対象を最大 3 周再検証する（issue #952）。直近 12 job の実測では regression-gate の needs-fix 5 件すべてがこの偽ループで、新規に検出された退行は 0 件。成功確率ゼロの再検証がイテレーション予算 3 周を毎回使い切っている。

原因は 3 箇所の相互矛盾: (1) routing は severity 不問で fixable を code-fixer に渡す、(2) code-fixer の prompt が受け取った入力を「LOW は無視」と severity で再フィルタして捨てる、(3) regression-gate の ledger が未修正の finding を severity・修正実績不問で拾い直し、判定が any fixable → needs-fix でループさせる。加えて regression-gate の system prompt は ledger を「code-fixer が修正した findings の完全リスト」と説明しているが、実装は「reviewer が指摘した fixable findings 全件」を渡しており、記述が虚偽になっている。

## 現状コードの前提

- src/core/step/judge-verdict.ts:188-192 — `collectFixableFindings` は `resolution === "fixable"` のみで抽出し severity 不問
- src/core/step/routed-findings.ts:113 — 上記を code-fixer への routing 抽出に使用
- src/core/step/code-fixer.ts:150,194,221,272,293 — prompt 全 5 変種に「Ignore LOW severity findings」の再フィルタ指示
- src/core/pipeline/reviewer-chain.ts:165-186 — approved + fixable → code-fixer → next の one-shot 前進経路（設計意図通り）
- src/core/pipeline/findings-ledger.ts:35 `collectFindingsLedger` / :131 `collectSpecReviewLedger` — reviewer の fixable finding を severity・修正実績不問で全件収集
- src/core/step/regression-gate.ts:45 `REGRESSION_GATE_MAX_ITERATIONS = 3`、:114-116,145-147 — ledger を gate の入力に合成
- src/core/step/judge-verdict.ts:210-224 `deriveRegressionGateVerdict` — `findings.some((f) => f.resolution === "fixable")` で needs-fix（severity・既知性不問）
- src/prompts/regression-gate-system.ts:25 — ledger を「code-fixer が修正した fixable findings の完全リスト」と記述（実装と不一致）

## 要件

1. approved 判定時に fixable として one-shot 経路へ routing 済みの finding が未修正のまま残っていても、regression-gate はそれを事由に needs-fix を返さず前進する。needs-fix を返すのは**新規検出の退行**（既知 finding と同一と判定されない fixable finding）に限る。既知性の判定は findings-ledger の既存 dedupe / 指紋機構を流用する。
2. code-fixer への routing 対象集合と code-fixer prompt の指示対象を一致させ、「渡してから無視させる」二重フィルタを解消する。severity 別の扱い（LOW を修正対象外とする等）は routing 層 1 箇所でのみ表現し、prompt 全 5 変種から severity 再フィルタ行を除去する。
3. regression-gate の system prompt の ledger 説明を実装の実態（reviewer が指摘した fixable findings 全件であり、修正済みとは限らない）と一致させる。
4. gate の本務を弱めない: 既知 finding と同一と判定されない新規の fixable finding に対しては従来通り needs-fix を返す。
5. 本変更は挙動変更を含むため、期待値の変更が必要な既存テストは design.md で列挙した上で変更する。列挙外の既存テストは無改変で green。

## スコープ外

- one-shot 前進経路（reviewer-chain の routing 構造）自体の再設計
- reviewer/fixer 収束ロジックの循環依存整理（#812）
- findings ledger の jobId キー化（#944）
- code-fixer が「修正した finding の一覧」を構造化報告する仕組みの導入（fixer 自己申告への依存を増やすため採らない）

## 受け入れ基準

- [ ] 再現テスト: approved + low fixable（code-fixer が修正しない）→ regression-gate が needs-fix を返さず前進し、gate ↔ fixer の再検証ループが発生しないことを判定ロジックの単体テストで固定する
- [ ] 新規退行テスト: 既知 finding と同一と判定されない fixable finding に対して gate が needs-fix を返すことを固定する（要件 4 の歯）
- [ ] `grep -rn "Ignore LOW severity" src/` が 0 件（要件 2 の歯）
- [ ] regression-gate-system.ts の ledger 記述が実装と一致している（「修正した findings」という記述が残っていない）
- [ ] 期待値変更した既存テストが design.md の列挙と一致している
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **既知未修正の除外は gate の判定層（deriveRegressionGateVerdict への入力整形または判定自体）で指紋照合により行う**。code-fixer の自己申告（「修正した一覧」）を ledger の根拠にする案は、agent 自己申告を検証なしに信頼することになるため却下。gate は従来通り全件を検証してよいが、既知未修正を退行として routing しない。
- **prompt 記述は実装に寄せる**（実装を fixed-only ledger に変える案は上記と同じ理由で却下）。
- **LOW の対象外化は routing 層 1 箇所**。prompt 層の再フィルタは削除する。routing で落とした LOW は ledger 側でも needs-fix 事由にならないこと（要件 1 と一貫）。
- 偽ループの解消により regression-gate は本来の意味（新規退行の検出）に戻る。issue #952 の実測（needs-fix 5/5 が偽、真の退行 0）がこの限定の妥当性の根拠。
