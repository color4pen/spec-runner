# request review agent prompt に設計案の複雑化リスク評価観点を追加する

## Meta

- **type**: spec-change
- **slug**: request-review-complexity-eval
- **base-branch**: main
- **adr**: false
- **close-issues**: 395

## 背景

request review agent が設計案を複数列挙するだけで「どれが良いか」を評価しない問題が繰り返し発生している。`delta-validation-post-code-review` request では、2 つのアーキテクチャアプローチ（separate step name vs. state-based routing）が並列で提示されたが、複雑化リスクや既存資産の再利用可否についての評価がなかった。

reviewer が選択肢を並べるだけでは、request 作成者が自分で技術評価をやり直す必要があり、review の価値が半減する。

## 要件

### 1. request review prompt に複雑化リスク評価観点を追加

request review agent の prompt に以下の評価観点を追加する:

- **複雑化リスク**: 提案が既存アーキテクチャをどの程度複雑にするか
- **DRY 違反**: 既存の類似機構との重複がないか
- **既存資産の再利用可否**: 既に実装済みの仕組みで要件を満たせないか

reviewer が複数の設計アプローチを検出した場合、並列列挙ではなく推奨案を 1 つ提示し、根拠を示すこと。

### 2. 複数アプローチ検出時の推奨提示

複数の設計アプローチを検出した場合、並列列挙ではなく推奨案を 1 つ提示し、根拠（複雑化リスク / DRY / 既存資産再利用の観点）を示すこと。最終判断は request 作成者が行う。

## スコープ外

- **request review の verdict 体系変更** — prompt 観点の追加のみ、verdict 値は変えない
- **他の agent（design / code-review）への観点追加** — 本 request は request review のみ
- **過去 request の再 review** — prompt 改善のみ、遡及適用は行わない

## 受け入れ基準

- [ ] request review prompt に複雑化リスク / DRY 違反 / 既存資産再利用の評価観点が含まれている
- [ ] 複数アプローチ検出時に推奨案 + 根拠を提示する指示がある
- [ ] 重複機構を持つリクエストに対して推奨案が 1 案 + 根拠付きで出力されるシナリオが動作確認可能
- [ ] `bun run typecheck && bun run test` が green
