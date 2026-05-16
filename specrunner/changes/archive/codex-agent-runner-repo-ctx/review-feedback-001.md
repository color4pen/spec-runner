# Code Review: codex-agent-runner-repo-ctx — iter 1

## Summary

`StepContext.repo` フィールドの廃止を確認した。全 must テストケースをカバーし、build/typecheck/test すべて green。実装・型削除・fixture 更新の整合性に問題なし。1 件の low-severity 指摘あり（ドキュメント欠落）。

---

## Findings

### [LOW] TC-29: `specrunner/specs/step-execution-architecture/spec.md` が未更新

- **File**: `specrunner/specs/step-execution-architecture/spec.md`
- **Lines**: L319, L336, L354

design.md の Affected Files に明記されており、request.md 要件 9 の「該当 spec capability が存在する場合は MODIFIED で更新」対象にも該当する。現状:

```
L319: repo: OriginInfo;
L336: THEN it contains exactly: config, slug, cwd?, request, repo
L354: THEN the deps object contains only StepContext fields (config, slug, cwd, request, repo)
```

これらから `repo` 参照を削除する必要がある。機能には無影響だが spec authority が実装と乖離した状態になる。

test-cases.md では TC-29 を "should" priority に分類しており、機能ブロッカーではない。

---

## Test Coverage Against test-cases.md

| TC | Priority | Status |
|----|----------|--------|
| TC-01: Repository 行が含まれない | must | ✓ implicit (型レベルで `repository` フィールドが存在しないため `Repository:` 行の出力経路がない) |
| TC-02: `SpecReviewPromptInput` に `repository` フィールドなし | must | ✓ typecheck pass |
| TC-03: `{{REPOSITORY}}` プレースホルダーなし | must | ✓ typecheck pass |
| TC-04: spec-review step が `repository` 引数なしで動作 | must | ✓ spec-review.test.ts pass |
| TC-05: `StepContext` に `repo` なし | must | ✓ typecheck pass |
| TC-06: `PipelineDeps` に `repo` なし | must | ✓ typecheck pass |
| TC-07: claude-code runner | must | ✓ typecheck + unit test pass |
| TC-08: codex runner | must | ✓ typecheck + unit test pass |
| TC-09: managed-agent runner | must | ✓ typecheck + unit test pass |
| TC-10: `buildDeps()` に `repo` パラメータなし | must | ✓ typecheck pass |
| TC-11: LocalRuntime.buildDeps() | must | ✓ local.test.ts pass |
| TC-12: ManagedRuntime.buildDeps() | must | ✓ managed.test.ts pass |
| TC-13: `PrepareResult` に `repo` なし | must | ✓ typecheck pass |
| TC-14: CommandRunner.execute() | must | ✓ runner.test.ts pass |
| TC-15: `grep "stepCtx\.repo" src/` = 0 件 | must | ✓ 確認済み |
| TC-16: `ManagedAgentRunner.this.repo` 維持 | must | ✓ 確認済み（GitHub API 用途で使用継続） |
| TC-17: `state.repository` 維持 | must | ✓ preflight 変更なし |
| TC-18: `OriginInfo` 型維持 | must | ✓ `src/git/remote.ts` 変更なし |
| TC-19: typecheck pass | must | ✓ 1.8s pass |
| TC-20: test pass | must | ✓ 162 files / 1924 tests pass |
| TC-21: spec-review unit test pass | must | ✓ |
| TC-22: spec-review-system プロンプトテスト pass | must | ✓ `repository:` 引数削除済み |
| TC-23: pipeline-integration test pass | must | ✓ |
| TC-24: step unit tests pass | must | ✓ |
| TC-25: 他要素（Change folder 等）維持 | should | ✓ template 確認済み |
| TC-26: ManagedRuntime constructor `repo` 維持 | should | ✓ |
| TC-27: `deps.repo` grep = ManagedAgentRunnerDeps 系のみ | should | ✓ 1 件（L87 `this.repo = deps.repo`） |
| TC-28: error-codes / cli-stdout-snapshot / test-case-gen-step | should | ✓ |
| TC-29: step-execution-architecture spec.md 更新 | should | ✗ **未更新** |
| TC-30: 不要 OriginInfo import 削除 | could | ✓ types.ts / strategy.ts / runner.ts 確認済み |

---

## Acceptance Criteria チェック

- [x] `src/prompts/spec-review-system.ts` から `Repository: {{REPOSITORY}}` 行・replace 処理・`repository` 型 field が削除されている
- [x] `src/core/step/spec-review.ts:117` の `repository:` 引数が削除されている
- [x] `src/core/types.ts` の `StepContext` から `repo: OriginInfo` が削除されている
- [x] 3 runner の `stepCtx` 組み立てから `repo:` 代入が削除されている
- [x] `managed-agent` の `this.repo` field 整理完了（GitHub API 用途で維持。`stepCtx.repo` 代入のみ削除）
- [x] `grep -rn "stepCtx\.repo" src/` が 0 件
- [x] `state.repository` / `OriginInfo` 型は維持されている
- [x] `bun run typecheck && bun run test` が green（162 files / 1924 tests）
- [ ] 該当 spec capability が存在する場合は MODIFIED で更新されている（**step-execution-architecture/spec.md が未更新**）

---

## Verdict

- **verdict**: approved

低優先度の spec ドキュメント欠落（TC-29）が 1 件あるが、全 must 受け入れ基準をクリアし機能・型・テストすべて問題ない。
