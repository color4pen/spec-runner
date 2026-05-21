# Proposal: spec-review lightweight mode enhancement

## Why

`specReviewMode: "lightweight"` は refactoring / chore で有効化されているが、現在の lightweight instruction は「セキュリティレビュー省略」の 1 行のみ。completeness（要件網羅性）、consistency（既存 spec 照合）、feasibility（工数見積）は依然として full と同等に検証され、振る舞い不変の変更に不要な findings を生む。さらに maxTurns も full と同じ 15 のため、不要な検証に turn を消費する。

## What Changes

| File | Change |
|------|--------|
| `src/prompts/spec-review-system.ts` | `buildSpecReviewModeInstruction()` を拡充。lightweight 時に verify / simplify / skip の観点を明示する |
| `src/core/step/types.ts` | `AgentStep` に `getMaxTurns?(state): number \| undefined` を追加 |
| `src/core/step/spec-review.ts` | `getMaxTurns` を実装。lightweight → 10、full → undefined（fallback to maxTurns: 15） |
| `src/adapter/claude-code/agent-runner.ts` | `step.getMaxTurns?.(ctx.state) ?? step.maxTurns` で stepDefaults を算出 |
| tests | instruction 内容・maxTurns 値のユニットテスト |

## Capabilities

- **Modified**: spec-review lightweight instruction — 観点別の verify / simplify / skip を明示
- **New**: AgentStep.getMaxTurns — 実行時の state に基づく動的 maxTurns 解決

## Impact

- refactoring / chore の spec-review で不要な findings（feasibility 工数見積、consistency spec 照合）が減少
- lightweight 時の maxTurns が 15 → 10 に削減され、turn 消費が抑制される
- full mode（new-feature / spec-change / bug-fix）は一切影響なし
- config.steps["spec-review"].maxTurns による外部 override は引き続き最優先（resolution chain 不変）
