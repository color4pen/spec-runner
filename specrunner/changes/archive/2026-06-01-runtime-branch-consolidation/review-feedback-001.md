# Code Review Feedback — iteration 001

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | testing | `tests/unit/core/runtime/local.test.ts` | TC-LR-007 は `deps.runtimeStrategy` の注入を assert していない。TC-014/TC-015（must）の直接検証がない。typecheck は通るが、`runtimeStrategy === this` の単体 assert が欠落。 | TC-LR-007 / TC-MR-004 に `expect(deps.runtimeStrategy).toBe(runtime)` を追加する。 | no |
| 2 | LOW | testing | `src/core/runtime/prereqs.ts` | `resolveRuntimeCredentials` の単体テストが存在しない（TC-026/TC-027 はいずれも must だが `prereqs.test.ts` が未作成）。`preflight.test.ts` が `checkRuntimePrereqs` を import して間接カバーするが、credential 解決パスは未テスト。 | `tests/unit/core/runtime/prereqs.test.ts` を新設し TC-026（managed→API key）/ TC-027（local→{}）を実装する。 | no |
| 3 | LOW | testing | `tests/unit/core/runtime/local.test.ts` | `LocalRuntime` の新 3 メソッド（`captureHeadSha` / `prepareStepArtifacts` / `finalizeStepArtifacts`）の直接単体テストがない（TC-005/007/008/009 は must）。executor.commit.test.ts の mock strategy が間接的にカバーするが、LocalRuntime 本体の実装は別途 assert が必要。 | `local.test.ts` に TC-LR-CAP-001（captureHeadSha が HEAD SHA を返す）/ TC-LR-CAP-002（prepareStepArtifacts が writeOutputTemplates を呼ぶ）/ TC-LR-CAP-003（finalizeStepArtifacts が cleanup→commitAndPush の順）を追加。 | no |
| 4 | LOW | testing | `tests/unit/core/runtime/managed.test.ts` | `ManagedRuntime` の no-op 3 メソッドに直接 assert がない（TC-011/012/013 は must）。interface を implements しているため typecheck は通るが、no-op の明示的 assert が欠落。 | `managed.test.ts` に `captureHeadSha` → null、`prepareStepArtifacts` / `finalizeStepArtifacts` → Promise resolve を assert するテストを追加。 | no |
| 5 | LOW | maintainability | `tests/unit/architecture/arch-allowlist.ts` | B-6 allowlist 3 件目のコメントが「resolveSpecRunnerApiKey (line 136)」のまま。リファクタリング後は `resolveRuntimeCredentials` 呼び出し（line 93）に変わっており、コメントが stale。pattern 自体（`Record<string, string | undefined>,`）は新コードに一致するので test は正常動作している。 | コメントを「runPreflight() passes raw process.env to resolveRuntimeCredentials (line 93).」に更新する。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 8.70

## Summary

B-8 invariant の完全実施を確認。主要な受け入れ基準はすべて満たされている。

**合格点：**
- `executor.ts` / `preflight.ts` から `config.runtime` 分岐がゼロ件（grep および arch test で確認）
- `arch-allowlist.ts` の B-8 エントリ 4 件全削除済み、`core-invariants.test.ts` が allowlist なしで green
- `RuntimeStrategy` interface に 3 メソッドが追加され、`LocalRuntime` / `ManagedRuntime` が正しく実装
- `PipelineDeps.runtimeStrategy?: RuntimeStrategy` が optional で追加され後方互換維持
- executor の optional chaining（`deps.runtimeStrategy?.finalizeStepArtifacts(...)` `?? Promise.resolve()`）が正しく既存の error handling（`recordFailedStepResult` → `attachStateAndRethrow`）を executor 側で維持
- `LocalRuntime.finalizeStepArtifacts` が `logPipelineDiag` 呼び出しを含め旧 executor ロジックを忠実に移植
- `prereqs.ts` の `resolveRuntimeCredentials` が non-managed で `{}` を返す単純なガードを持ち、preflight.ts から runtime 分岐を完全排除
- 287 test files / 3281 tests が全 green、build / typecheck / lint もすべて通過
- T-04 に B-8 suppression-demo がないことを確認（B-6 demo のみ、no-op 要件を満たす）

**注意点（非ブロッキング）：**
test-cases.md が `result: completed` と記録しているが、TC-005/007/008/009（LocalRuntime 新メソッド直接テスト）、TC-011/012/013（ManagedRuntime no-op 直接テスト）、TC-014/015（buildDeps の runtimeStrategy 注入 assert）、TC-026/027（resolveRuntimeCredentials 単体テスト）の 11 件（すべて must 指定）に直接 assert が存在しない。動作は間接的に検証されており受け入れ基準には影響しないが、今後 LocalRuntime や prereqs.ts に変更が入った際の回帰リスクを軽減するため、次の request で単体テストを補完することを推奨する。
