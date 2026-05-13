# Review Feedback: dynamic-context-integration-tests

- **verdict**: approved

## Summary

TC-DC-101〜TC-DC-108 の 8 テストケースが実装されており、test-cases.md の must/should 全ケースをカバーしている。verification-result.md で 1723 tests passed / typecheck passed が確認済み。

---

## Findings

### [info] TC-DC-106 は enrichContext を mock 実装で差し替えており実挙動を検証していない

- **severity**: info
- **file**: `tests/pipeline-integration.test.ts:1005-1009`
- **description**: TC-DC-106 の enrichContext spy は `mockImplementation` で本物の実装を呼ばず `dynamicContext` をそのまま返す。test-cases.md では「enrichContext の返り値に baselineSpecs が含まれない」を検証する意図だったが、実際のファイルシステム（delta spec ディレクトリ不在）で本物の実装を通す TC-DC-105 的アプローチと一貫性がない。TC-DC-105 が real implementation を通しているため coverage は担保されているが、TC-DC-106 は「enrichContext が何も変えない境界条件」を本物の実装で通せていない。
- **impact**: TC-DC-106 が本物の実装でなく mock に依存しているため、将来 enrichContext の実装が変わった場合に TC-DC-106 がそれを検知できない。
- **suggestion**: TC-DC-106 でも TC-DC-105 と同様に `realEnrichContext` を通す spy through パターンを使うことで境界条件を実装で検証できる。ただし動作上の問題はないため修正は任意。

---

### [info] enrichContext に dynamicContext が undefined のとき non-null assertion が安全でない（production code の潜在バグ）

- **severity**: info
- **file**: `src/adapter/managed-agent/agent-runner.ts:314`
- **description**: `step.enrichContext(stepCtx.dynamicContext!, ...)` の非 null アサーションは、`ctx.dynamicContext` が `undefined`（TC-DC-108 の backward-compat ケース）のとき `undefined` を `enrichContext` に渡す。`spec-review.ts` の `enrichContext` は `{ ...dynamicContext, baselineSpecs }` とスプレッドするため、`dynamicContext` が `undefined` だと `spread of undefined` で実行時エラーになる可能性がある。現在のテストでは TC-DC-108（dynamicContext なし）でも `SpecReviewStep.enrichContext` が呼ばれる経路（spec-review ステップ）を通るが、この組み合わせがテストされていない。
- **impact**: `dynamicContext` を渡さずに spec-review ステップが実行された場合、production code がランタイムエラーになる可能性がある。ただし現実的なフローでは `collectDynamicContext` が常に呼ばれるため顕在化しにくい。
- **suggestion**: `src/adapter/managed-agent/agent-runner.ts:313-315` に `if (step.enrichContext && stepCtx.dynamicContext)` のガードを追加するか、`enrichContext` の引数型を `DynamicContext | undefined` にするか検討する。この修正は本 PR の scope 外なので別 request として立てることを推奨。

---

### [info] TC-DC-101/TC-DC-102 が TC-DC-103/TC-DC-104 と deps を共有していない（cwd 未設定）

- **severity**: info
- **file**: `tests/pipeline-integration.test.ts:821-831`
- **description**: TC-DC-101/102 は `cwd` を deps に渡していないため `process.cwd()` にフォールバックし、実際の `specrunner/project.md` が存在した場合に `projectContext` が意図せず注入される可能性がある。テスト環境（CI 等）では問題にならないが、ローカルで specrunner repo 内で実行した場合に `project.md` が存在すると TC-DC-101/102 の assert が変わる。
- **impact**: ローカル環境依存の可能性。CI では問題なし。
- **suggestion**: TC-DC-101/102 も `cwd: tempDir` を設定することで環境依存を排除できる。

---

## Coverage Matrix

| Test Case | Priority | Implemented | Notes |
|-----------|----------|-------------|-------|
| TC-DC-101 | must | yes | TC-DC-101 — dynamicContext forwarding |
| TC-DC-102 | must | yes | TC-DC-102 — specIndex propagation |
| TC-DC-103 | must | yes | TC-DC-103 — allowlist projectContext |
| TC-DC-104 | must | yes | TC-DC-104 — non-allowlist projectContext undefined |
| TC-DC-105 | must | yes | TC-DC-105 — enrichContext / baselineSpecs |
| TC-DC-106 | should | yes (partial) | TC-DC-106 — mock 実装で差し替え（info 参照） |
| TC-DC-107 | should | yes | TC-DC-107 — project.md 不在 fallback |
| TC-DC-108 | should | yes | TC-DC-108 — backward compatibility |
| TC-DC-109 | must | yes | 1723 tests passed（既存テスト健全性） |

All `must` test cases are covered. No critical or major issues found.
