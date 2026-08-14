# Code Review Feedback — iteration 002

<!-- verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。 -->

## 検証した項目

- `git diff main...HEAD --stat` でスコープを確認（34 ファイル変更）
- D1〜D6 各決定を実装ファイルで照合:
  - `src/core/step/judge-verdict.ts`: `selectFixerTargetFindings` が `collectFixableFindings` と同義になっていることを確認
  - `src/core/pipeline/findings-ledger.ts`: `excludeKnownUnfixedRegressions` が削除されていることを確認
  - `src/core/step/step-completion.ts`: 2 つの呼び出しブロックが削除されていることを確認
  - `src/core/step/code-fixer.ts`: 全 5 分岐の文言を "regardless of severity" で確認
  - `src/prompts/code-fixer-system.ts`: "LOW は無視" の文言が消去されていることを確認
  - `src/core/step/no-op-detect.ts`: `findingsRoutingApproved` パラメータが削除されていることを確認
  - `src/core/step/executor.ts`: `codeReviewFindingsRoutingActive` import/呼び出しが削除されていることを確認
  - `src/core/pipeline/reviewer-chain.ts`: `codeReviewFindingsRoutingActive` 関数が削除されていることを確認
  - `src/core/step/regression-gate.ts`: ledger 指示が LOW 含む全 severity に更新されていることを確認
- テストカバレッジを test-cases.md の 15 TC と照合（全 TC が severity-fixability-split.test.ts に実装済み）
- `bun run typecheck`: exit 0 を確認
- `bun run test`: 765 files / 11417 passed / 1 skipped を確認
- design.md Existing Test Update Ledger の列挙と実際のテスト変更を照合

## 検証できなかった項目

None — 全受け入れ基準を機械的に確認済み。

## Findings 詳細

### [LOW] 到達不能な transition table 行が `buildParallelReviewerTransitions` に残存

**場所**: `src/core/pipeline/reviewer-chain.ts:406-420`

```typescript
// approved + fixable findings → code-fixer
transitions.push({
  step: REGRESSION_GATE_STEP_NAME,
  on: "approved",
  to: STEP_NAMES.CODE_FIXER,
  when: (s) => {
    ...
    return collectFixableFindings(findings).length > 0;
  },
});
```

D2 後、`deriveRegressionGateVerdict` は fixable が 1 件でも存在すれば `needs-fix` を返す。regression-gate が `approved` を返すのは fixable が 0 件のときのみであり、`when` 条件 `collectFixableFindings(...).length > 0` は `approved` verdict と組み合わさると常に `false` になる。

`regressionGateActive` のコメントには "The approved+fixable branch is structurally unreachable and has been removed." とあるが、これは関数内部ロジック（approved+fixable 分岐の削除）を指しており、`buildParallelReviewerTransitions` の transition table 行は削除されていない。コメントと実態に軽微な乖離がある。

**影響**: 機能正確性に影響なし。transition は構造的に fire しない。
**修正案**: 行を削除するか、「D2 後 dead code — deriveRegressionGateVerdict が approved+fixable を排除するため到達不能」旨のコメントを付ける。
