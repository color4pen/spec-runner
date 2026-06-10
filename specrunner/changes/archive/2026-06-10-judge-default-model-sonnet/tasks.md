# Tasks: judge-default-model-sonnet

## T-01: 判定系 3 step のモデル定数を sonnet に変更する

- [x] `src/core/step/spec-review.ts:13` の `SPEC_REVIEW_AGENT_MODEL` を `"claude-sonnet-4-6"` に変更する
- [x] `src/core/step/code-review.ts:13` の `CODE_REVIEW_AGENT_MODEL` を `"claude-sonnet-4-6"` に変更する
- [x] `src/core/step/conformance.ts:11` の `CONFORMANCE_AGENT_MODEL` を `"claude-sonnet-4-6"` に変更する

**Acceptance Criteria**:
- `grep -r "claude-opus" src/core/step/` の出力が `design.ts` のみを含む（spec-review / code-review / conformance は含まない）
- `bun run typecheck && bun run test` が green

## T-02: model-registry テストの step デフォルト検証が通ることを確認する

- [x] `bun run test tests/config/model-registry.test.ts` を実行し、"step default models resolve without CONFIG_INVALID" describe ブロックが全 pass であることを確認する

**Acceptance Criteria**:
- `tests/config/model-registry.test.ts` の全テストが green（`SpecReviewStep.agent.model` / `CodeReviewStep.agent.model` / `ConformanceStep.agent.model` が `resolveProvider` で `'anthropic'` を返す）
