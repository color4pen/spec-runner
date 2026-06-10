# 判定系 step の出荷時デフォルトモデルを sonnet に変更する

## Meta

- **type**: chore
- **slug**: judge-default-model-sonnet
- **base-branch**: main
- **adr**: false

## 背景

出荷時デフォルトで opus を使う step を design のみに限定する。判定系（spec-review / code-review / conformance）は、judge の verdict 導出が CLI 側に移り（findings 契約）、判定の構造化が進んだことで、sonnet で十分な精度が出ることが運用実績で確認されている。コスト既定値を下げ、opus を使いたい利用者は config（steps.<step>.model / byRequestType）で引き上げる方向に既定を倒す。

## 現状コードの前提

- `src/core/step/spec-review.ts:13` — `SPEC_REVIEW_AGENT_MODEL = "claude-opus-4-6[1m]"`
- `src/core/step/code-review.ts:13` — `CODE_REVIEW_AGENT_MODEL = "claude-opus-4-6[1m]"`
- `src/core/step/conformance.ts:11` — `CONFORMANCE_AGENT_MODEL = "claude-opus-4-6[1m]"`
- design（`src/core/step/design.ts:12`）も `claude-opus-4-6[1m]` で、これは変更しない
- worker 系（implementer / fixer / test-case-gen / adr-gen / request-review）は既に `claude-sonnet-4-6`
- モデル解決はハードコードが最弱の第 5 段（`src/config/step-config.ts:77-82`）で、config の defaults / step 指定があれば上書きされる

## 要件

1. spec-review / code-review / conformance の 3 step のハードコードモデルを `claude-sonnet-4-6` に変更する
2. design のハードコード（opus）は変更しない
3. README の設定例・モデル既定値に関する記載があれば実態に合わせる（出荷時デフォルトの説明がある場合のみ。なければ変更不要）

## スコープ外

- design のモデル変更
- config 解決ロジックの変更
- byRequestType の既定値追加

## 受け入れ基準

- [ ] 出荷時デフォルトで opus を参照する step が design のみである（grep で確認可能）
- [ ] モデル registry との整合テスト（model-registry.test.ts の step 既定検証）が green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- 既定値は安価側に倒し、高価なモデルは opt-in にする。判定の信頼性は judge-verdict の決定的導出と実在検証（構造）が担っており、モデルの格に依存する設計ではない
