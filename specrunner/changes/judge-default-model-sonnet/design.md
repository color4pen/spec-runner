# Design: judge-default-model-sonnet

## Context

3つの判定系 step（spec-review / code-review / conformance）がハードコードデフォルトとして `claude-opus-4-6[1m]` を使用している（step-config 解決チェーン第 5 段）。worker 系（implementer / fixer / test-case-gen / adr-gen / request-review）は既に `claude-sonnet-4-6`。design step は opus を維持する。

該当箇所：
- `src/core/step/spec-review.ts` — `SPEC_REVIEW_AGENT_MODEL = "claude-opus-4-6[1m]"`
- `src/core/step/code-review.ts` — `CODE_REVIEW_AGENT_MODEL = "claude-opus-4-6[1m]"`
- `src/core/step/conformance.ts` — `CONFORMANCE_AGENT_MODEL = "claude-opus-4-6[1m]"`

判定の構造化（findings 契約）が完成しており、判定の信頼性はモデルの格ではなく judge-verdict の決定的導出と構造検証が担っている。运用实績でも sonnet で十分な精度が確認されている。

## Goals / Non-Goals

**Goals**:
- spec-review / code-review / conformance の 3 step のハードコードデフォルトを `claude-sonnet-4-6` に変更する
- 出荷時デフォルトで opus を使う step を design のみにする

**Non-Goals**:
- design step のモデル変更
- config 解決ロジック（step-config.ts）の変更
- byRequestType の既定値追加
- README 変更（既存の opus 記載はすべて設定例であり、判定系 step の出荷時デフォルト説明ではない）

## Decisions

### D1: 各 step ファイルのモデル定数のみ変更する

ハードコードモデル定数（解決チェーン第 5 段）を書き換えるだけで要件を満たせる。AgentDefinition の構造、プロンプト、config 解決ロジックはすべて変更不要。config の defaults / step 指定があれば第 1〜4 段で上書きされるため、既存の設定を持つユーザーへの影響はない。

**Rationale**: step-config 解決チェーンの設計上、ハードコードは最弱の第 5 段であり、上位層を変更せずにデフォルトを下げることができる。

**Alternatives considered**:
- `step-config.ts` のデフォルト値で一括変更 → 却下。全 step に横断的に影響し、per-step 制御を失う。

### D2: README 変更は不要

README の opus 記述はすべて `byRequestType` の設定例であり、判定系 step の出荷時デフォルト値を説明するものではない。変更しても事実に反する記載にはならないため、変更しない。

## Risks / Trade-offs

[Risk] エッジケースで判定精度が若干低下する可能性がある。
Mitigation: findings 契約による構造強制により、精度の主要部分はモデルの格に依存しない。opus を使いたい利用者は config で opt-in できる（第 1〜4 段）。

## Open Questions

なし。
