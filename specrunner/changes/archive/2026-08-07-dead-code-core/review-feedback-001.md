# Code Review Feedback — iteration 1

<!-- verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。 -->

## 検証した項目

- `git diff main...HEAD --stat` で変更スコープ確認（65 files、src: 削除のみ、tests: 対応削除 + 新規 dead-code-core.test.ts）
- `design.md`・`tasks.md`・`test-cases.md` を通読し、削除対象・保護対象・スコープ外を把握
- `verification-result.md` を確認（build/typecheck/test/lint/coverage 全 phase green）
- 各 T-01〜T-13 の acceptance criteria を個別に grep/Read で実機確認:
  - T-01: `PrViewData`/`ResolvedTarget`/`FinishContext`/`FinishFlags`/`fetchPrViewWithRetry`/`resolveTarget` が src/ tests/ で 0 件、`FinishFs` が `src/core/finish/types.ts` に残存
  - T-02: `slugify` が src/ tests/ で 0 件（`src/util/paths.ts` コメント更新済み）
  - T-03: `state/reconcile` ファイル削除済み
  - T-04: factory 7 個 + ERROR_CODES 7 エントリが src/ tests/ で 0 件、保護対象 3 コードが残存
  - T-05: barrel 4 ファイル削除済み（後述の残存コメントあり）
  - T-06: `src/core/request/manager.ts` に `resolve` なし・`list` あり・ファイル存在
  - T-07: `src/core/tools/` ディレクトリ削除済み、readdir assertion ブロック削除済み
  - T-08: `src/core/validation/` ディレクトリ削除済み、2 テストが `src/parser/validation/` から直接 import
  - T-09: `src/core/doctor/index.ts` 削除済み・`allChecks` と個別 re-export block 削除済み・`DoctorContext` const 削除済み（interface は残存）
  - T-10: `src/core/port/index.ts` 削除済み・TC-010 describe ブロック削除済み
  - T-11: `buildSpecFixerSystemPrompt`/`SpecFixerPromptInput`/`buildSpecReviewSystemPrompt` が src/ tests/ で 0 件、`requestReviewResultPath` re-export 削除済み
  - T-12: `defineCustomTool`/`CustomTool`/`CustomToolDefinition` が src/ tests/ で 0 件、`CustomToolContext`/`CustomToolResult`/`CustomToolHandler` が残存
  - T-13: `deriveAndWriteUsage`/`DeriveUsageResult`/`derive-usage` が src/ tests/ で 0 件
- `error-codes.test.ts` の import リストと assertion を確認（`branchNotRegisteredError`/`stateFileInvalidError` 除去済み・BRANCH_NOT_REGISTERED/STATE_FILE_INVALID assertion 残存）
- `generate-chain-removed.test.ts` の TC-010 ブロック削除を確認
- `tests/unit/adapter/managed-agent/agent-runner.test.ts` の "only types.ts remains" ブロック削除を確認（TC-016/TC-017 は残存）
- `tests/unit/doctor/next-steps.test.ts` の fallback 経路コメント更新確認
- `tests/unit/doctor/xdg-integration.test.ts` の `DoctorContext` const 動的 import 削除確認
- `tests/unit/step/executor.commit.test.ts` / `executor.test.ts` の NO_COMMIT_DETECTED 参照がコメントのみに更新済みことを確認

## 検証できなかった項目

- `typecheck` / `test` のリアルタイム実行（worktree 内でビルドは未実行、verification-result.md で代替）

## Findings 詳細

### F-01: T-05 acceptance criteria `from.*state/store` grep が 0 件にならない

T-05 の受け入れ基準「`from.*state/store` が src/ tests/ で grep 0 件」を満たしていない。

以下の 2 箇所にコメント参照が残存する:

```
src/core/runtime/managed.ts:121
   * Replaces the deprecated updateJobState() from state/store.ts.

tests/finish-job-state.test.ts:71
/** Helper replacing the removed loadJobState(id) from state/store.ts */
```

いずれも実際の import 文ではなく「削除済みの state/store.ts から置き換えた」という趣旨の JSDoc/コメントである。
実行時の影響はない。ただし request.md の受け入れ基準には「コメント含む」と明記されており、T-05 の acceptance criteria は字義通り 0 件を要求している。

修正は当該コメント行の文言調整のみ（ファイルパス参照を削除するか、より一般的な表現に変更）で完了する。
