# Code Review — refactor-executor-finalize-step — Iteration 1

## Summary

振る舞い不変リファクタリングとして高品質。成功パスの 7 ステップシーケンスが `finalizeStep` に正しく集約されており、executor.ts は 270 行に縮小。全 1283 テスト pass、typecheck green。設計判断（D1〜D4）が忠実に実装されている。

- **verdict**: approved

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 8 | 0.25 | 2.00 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **8.35** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | maintainability | src/core/step/executor.ts:216-269 | `finalizeStep` メソッド本体に空行が一切なく、7 つの論理ブロック（parse → fallback → emit → pushResult → history → branch → persist）が密結合に見える。リファクタリング前の各パスには空行で区切りがあった | verdict パース、event emit、pushStepResult、branch 設定、persist の間に空行を挿入して論理ブロックを視覚的に分離する |
| 2 | LOW | performance | src/core/step/executor.ts:200,230 | CLI step で `step.resultFilePath(state, deps)` が `runCliStep` L200 と `finalizeStep` L230 で 2 回呼ばれる。元コードでは 1 回。純粋関数なので正確性に問題はないが冗長 | `finalizeStep` に `findingsPath` を引数で渡すか、現状維持（影響は微小） |
| 3 | LOW | maintainability | src/core/step/executor.ts:234-235 | `"completionVerdict" in step` 後の `(step as { completionVerdict?: Verdict \| null })` 型アサーション。設計 D2 の意図は理解できるが、`in` ガード後に `as` が必要な点はやや fragile | `Step` 型に optional な `completionVerdict` フィールドを追加するか、`step.kind === "agent"` で discriminated union narrowing を使う。ただし D2 で代替案を検討済みのため現状維持も可 |
| 4 | LOW | testing | openspec/changes/refactor-executor-finalize-step/test-cases.md:113 | TC-13 は `store.persist` 数を「3 以下」と定義しているが実際は 4（finalizeStep 1 + runAgentStep エラーパス 2 + runCliStep エラーパス 1）。tasks.md の 5.5 で既に認識されている | test-cases.md の TC-13 期待値を `4` に修正する |

## Scenario Coverage (test-cases.md)

| TC | Level | Status | Notes |
|----|-------|--------|-------|
| TC-01 | must | pass | `pushStepResult` 呼び出し 1 箇所（import 除く） |
| TC-02 | must | pass | `verdict:parsed` emit 1 箇所 |
| TC-03 | must | pass | 270 行 ≤ 280 |
| TC-04 | must | pass | 1283 tests passed |
| TC-05 | must | pass | typecheck green |
| TC-06 | must | pass | `resultContent !== null` → `parseResult` 呼び出し（L232-233） |
| TC-07 | must | pass | `"completionVerdict" in step` フォールバック（L234-235） |
| TC-08 | must | pass | fileContent null → escalation（L237-240） |
| TC-09 | must | pass | warning に `step.kind` と `step.name` 含む（L238） |
| TC-10 | should | pass | D4 形式の統一メッセージ |
| TC-11 | must | pass | `events.emit("verdict:parsed", ...)` L241 |
| TC-12 | must | pass | `appendHistory` L254-258 |
| TC-13 | must | **注意** | persist は 4 箇所（3 以下でない）。ただしコードは正しい — TC 期待値が不正確 |
| TC-14 | must | pass | sessionId → session entry（L242-244） |
| TC-15 | should | pass | sessionId undefined → null（L243 条件分岐） |
| TC-16 | should | pass | modelUsage 透過（L253） |
| TC-17 | should | pass | agentResult undefined → modelUsage undefined |
| TC-18 | must | pass | agentBranch → state.branch（L260-261） |
| TC-19 | should | pass | `!state.branch` ガード（L260） |
| TC-20 | must | pass | setsBranch → getBranchPrefix（L263-265） |
| TC-21 | should | pass | `!state.branch` ガード（L263） |
| TC-22 | should | pass | CliStep に setsBranch なし → 分岐不発火 |
| TC-23 | must | pass | 呼び出し 1 箇所（import 含め 2、TC 意図は call site = 1） |
| TC-24 | must | pass | エラーパスは catch 内で attachStateAndRethrow、finalizeStep 未到達 |
| TC-25 | must | pass | 同上（CLI エラーパス） |
| TC-26 | must | pass | `return this.finalizeStep(...)` で直接 return |
| TC-27 | could | pass | resultContent 非 null → parseResult 優先（L232 が先に評価） |

## Verdict Justification

- CRITICAL: 0, HIGH: 0
- Total score: 8.35 ≥ 7.0 threshold
- 全 must シナリオ pass（TC-13 は期待値の記述ミスであり、コード自体は正しい）
- 振る舞い不変が typecheck + 1283 テストで確認済み
