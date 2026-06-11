# レビュー収束後の退行ゲートで累積 findings を最終コードと再照合する

## Meta

- **type**: new-feature
- **slug**: review-regression-gate
- **base-branch**: main
- **adr**: true

## 背景

直列 reviewer チェーン（#622）では、後段 reviewer のループで code-fixer がコードを変更しても、承認済みの上流 reviewer は再実行されない。上流の approved は承認時点のコードに対する保証であり、最終コードに対する保証ではない。conformance は spec 照合のみを行うため、spec に表現されていない reviewer レンズの退行は検出されない。全チェーン完走後に、修正済み findings が最終コードでも修正されたままかを照合する退行ゲートを置き、この空白を埋める。#622 の着地を前提とする。

## 現状コードの前提

- conformance の判定対象は tasks.md / design.md / spec.md / request.md の 4 成果物照合に固定されている（`src/prompts/conformance-system.ts:25-30`）。reviewer findings の退行は判定項目に含まれない
- findings は judge 契約の toolResult として step 記録に残る（`state.steps[step][n].outcome.toolResult` — `src/core/pipeline/types.ts:159` が参照する形）
- 修正対象 findings の抽出関数 `collectFixableFindings` が存在する（`src/core/pipeline/types.ts:161` で使用）

## 要件

1. 全 reviewer チェーン（code-review + カスタムレビューワー）の完走後・conformance 前に退行ゲート step を実行する
2. ゲートの入力は累積 findings 台帳 — needs-fix / fixable として報告され fixer が修正した findings の集合。開放的な再レビューではなく、台帳項目が最終コードで修正されたままかの照合に限定する
3. ゲートは judge 契約に乗る（findings 報告・verdict の CLI 導出・実在検証・escalation）
4. 退行検出時は code-fixer ループで修正する。修正が他の台帳項目を壊す矛盾は escalation に落とす
5. 退行の可能性がない構成（カスタムレビューワーがゼロで code-review 単独）ではゲートを skip し、現行挙動と完全一致する
6. ゲート自身の iteration 予算と exhaustion を持つ

## スコープ外

- conformance の判定範囲の拡張
- 並列 reviewer 構成での退行保証
- findings 台帳の job をまたぐ永続化

## 受け入れ基準

- [ ] カスタムレビューワー 1 件以上の job でチェーン完走後にゲートが実行される
- [ ] 修正済み finding の退行が検出され code-fixer ループに入る
- [ ] 修正が他の台帳項目を壊す矛盾が escalation に落ちる
- [ ] カスタムレビューワーゼロでゲートが skip され、既存テストが無変更で green
- [ ] exhaustion 超過で escalation する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- チェーン先頭からの再走ではなく台帳照合を選ぶ。再走は reviewer 間の矛盾要求による振動（互いの修正の差し戻し合い）で予算を食い潰すリスクがあるのに対し、台帳照合は項目数で収束が有界であり、矛盾は「直すと別項目が壊れる」という形で顕在化して escalation として人間に届く
- ゲート位置は conformance の前。実装品質の収束を完結させてから spec 照合（受け入れゲート）に渡す既存の段構成を保つ
