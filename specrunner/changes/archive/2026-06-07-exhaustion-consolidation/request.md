# ループ枯渇判定を1箇所に集約する

## Meta

- **type**: refactoring
- **slug**: exhaustion-consolidation
- **base-branch**: main
- **adr**: false

## 背景

`pipeline.ts` のメインループ内で「iteration が `maxIterations` に達したか」を判定して `handleExhausted` を呼ぶパターンが3箇所にインラインで書かれている（L336 / L360 / L379）。

- L336: reviewer step 自身が上限到達
- L360: 次 step に進む前にループ iteration + fixer 上限チェック
- L379: fixer の iteration が上限到達

3箇所とも「counter を進める → maxIterations と比較 → handleExhausted」の同じパターンだが、判定条件が微妙に異なりインラインに散在するため、ループ制御の全体像が読みにくい。

## 要件

1. 枯渇判定（iteration counter の上限チェック + handleExhausted 呼び出し）を統一メソッドに集約する。
2. 3箇所の呼び出しを統一メソッドの呼び出しに置き換える。
3. 既存の枯渇挙動（escalation / awaiting-resume 遷移 / resumePoint 記録）を変えない。

## スコープ外

- `maxIterations` の値の変更やループ戦略の変更
- `handleExhausted` 自体のロジック変更（resume-simplify で修正済み）
- `LOOP_ERROR_CODES` の変更

## 受け入れ基準

- [ ] 枯渇判定が1つのメソッドに集約され、pipeline.ts のメインループからインラインの maxIterations 比較が消える
- [ ] 既存の枯渇関連テストが全て通る（挙動変更なし）
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

TBD
