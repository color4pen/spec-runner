# Step 実行パラメータの config.json 外出し

**Date**: 2026-05-07
**Status**: proposed

## Context

PR #91 で各 step に model / maxTurns をハードコードし、ADR `skill-20260506-propose-openspec-cli-and-step-model-config` の D3 で maxTurns を `AgentStep` に宣言的に設定した。しかし dogfood で implementer の maxTurns: 60 が不足して pipeline が失敗し、コード変更なしに実行パラメータを調整する手段がないことが判明した。PR #60 で session timeout を撤廃した際も設定の口を用意しなかった前例がある。

## Decision

`~/.config/specrunner/config.json` に `steps` セクションを追加し、step ごとの model / maxTurns / timeoutMs をコード変更なしで設定可能にする。5 つの設計判断を採用した。

**D1: config schema に `steps?: StepConfigMap` を追加。** `StepConfigMap` は index signature `[stepName: string]` ベースとし、step 名の追加時に型変更を不要にした。`defaults` キーで全 step 共通のフォールバック値を設定可能。`null` は「制限なし」を意味し、`undefined`（未指定）は次の優先度へフォールバックする。

**D2: `getStepExecutionConfig()` を純粋関数として `src/config/step-config.ts` に実装。** 4 段階の解決チェーン（step-level config → defaults config → step 定義ハードコード値 → SDK デフォルト）で値を解決する。Step オブジェクトの model / maxTurns は引数として受け取り、config の値で上書きする設計。Step 自体は config-agnostic のまま保つ。

**D3: ClaudeCodeRunner が解決済みの値を SDK `query()` に渡す。** `step.maxTurns ?? 30` のフォールバックを削除し、`getStepExecutionConfig` の解決チェーンに置き換える。`maxTurns: null` の場合は SDK に maxTurns を渡さない（= unlimited）。

**D4: `specrunner init --runtime=local` で `steps.defaults` を生成。** 既存 config に `steps` が既にある場合は上書きしない。デフォルト値は model: `claude-sonnet-4-6`、maxTurns: null（unlimited）、timeoutMs: null（no timeout）。

**D5: ManagedAgentRunner は対象外。** Managed Agents API は session 作成後の model / maxTurns 変更をサポートしないため、config の `steps` 設定は local runtime でのみ効果を持つ。

## Alternatives Considered

### Alternative 1: Step オブジェクト自体に config 解決ロジックを持たせる

- **Pros**: Step が自己完結。呼び出し元が解決関数を意識しない
- **Cons**: Step が config に依存し、テストで config fixture が必要になる。Step の単純さが失われる
- **Why not**: Step を config-agnostic に保つことで、config なしに Step 単体をテスト可能にする。解決は外側（Runner 層）の責務

### Alternative 2: 環境変数で上書き

- **Pros**: 実装が簡単。CI 環境での切替が容易
- **Cons**: step ごとの細粒度設定が煩雑（`SPECRUNNER_STEP_IMPLEMENTER_MAX_TURNS` 等）。JSON の構造的表現に劣る
- **Why not**: config.json が既に存在し、そこに集約するのが自然。環境変数は将来の優先度レイヤーとして追加可能

### Alternative 3: ハードコード値を調整するだけ（外出しせず）

- **Pros**: 変更範囲が最小。ADR `skill-20260506` の D3 Alt 3 で「YAGNI。値が安定したら外部化」と判断した
- **Cons**: dogfood で実際に maxTurns 不足が発生し、コード変更 → ビルド → デプロイのサイクルが運用ボトルネックになった
- **Why not**: 「値が安定したら」の前提が崩れた。dogfood で即座に調整が必要な場面が発生し、YAGNI の判断を覆す根拠が得られた

## Consequences

### Positive

- コード変更なしに step の model / maxTurns を調整可能。dogfood での迅速なチューニングが実現する
- 4 段階解決チェーンにより、config 未設定でも既存動作が完全に維持される（後方互換）
- Step オブジェクトが config-agnostic のまま保たれ、単体テストの容易さを維持
- `null` と `undefined` の明示的区別により、「unlimited を意図」と「設定していない」の意味が型レベルで分離される

### Negative

- `step.maxTurns ?? 30` の暗黙フォールバックが削除され、step 定義に maxTurns を明示しない step は unlimited になる。意図的な設計だが、新規 step 追加時に maxTurns の指定を忘れるリスクがある
- `validateConfig()` の steps バリデーションブロックが 55 行に膨張。将来のフィールド追加でさらに増加する見込み

### Risks

- config の `steps` に存在しない step 名を書いた場合、サイレントに無視される。将来的に `specrunner doctor` で検証可能にするが、本 change では対象外
- ManagedAgentRunner では config の `steps` 設定が効かないことをユーザーが認識していない可能性がある。ドキュメントで明示する必要がある

### Known Design Debt

- **`validateConfig()` の膨張**: steps バリデーションブロックが 55 行あり、pipeline.maxRetries の validation と構造的に重複。`validateNumericField` / `validateStepFields` 等のヘルパー関数への分離が候補（review-feedback-001 Finding #2）
- **`StepConfigMap` の型と request.md の記述の差異**: 実装は index signature `[stepName: string]` を採用したが、request.md では各 step 名を明示的に列挙した型定義を記載。design.md D1 で Record-based を選択した理由は妥当だが、ドキュメント間の不整合が残る（review-feedback-001 Finding #3）
