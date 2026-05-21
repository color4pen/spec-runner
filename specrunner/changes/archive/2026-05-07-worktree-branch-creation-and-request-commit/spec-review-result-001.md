# Spec Review Result — worktree-branch-creation-and-request-commit

- **reviewer**: spec-reviewer
- **iteration**: 1
- **date**: 2026-05-08
- **verdict**: approved

## Summary

request.md の全 17 要件が proposal / design / tasks / delta specs に過不足なく展開されている。設計判断（D1-D6）は既存コード構造と整合し、failure mode 3 件を構造的に解消する妥当なアプローチ。後方互換（resume パス、setsBranch フォールバック）も明示的に考慮済み。

## Completeness

| request.md 要件 | 対応する artifact | 充足 |
|----------------|------------------|------|
| 1. branch 名は CLI が決定（現状通り） | design D1, tasks 1.1-1.4, 8.1-8.3 | ✅ |
| 2. local: WorktreeManager.create() に branchName 追加 | design D1, tasks 1.1-1.2, specs/step-execution-architecture | ✅ |
| 3. managed: setupWorkspace で git checkout -b + push | design D6, tasks 3.1-3.4 | ✅ |
| 4. branchName 省略時は --detach で後方互換 | design D1 alternatives, tasks 1.4, 2.4, 3.3 | ✅ |
| 5. resume パスでは branch 作成しない | design Non-Goals, tasks 2.4, 3.3 | ✅ |
| 6. local: request.md を git commit | design D2, tasks 2.1-2.3 | ✅ |
| 7. managed: request.md を commit + push | design D2, tasks 3.1-3.2 | ✅ |
| 8. propose agent は change folder を追加 commit | proposal, specs/propose-session, specs/propose-pipeline | ✅ |
| 9. PROPOSE_SYSTEM_PROMPT から branch 作成指示を削除 | design D5, tasks 5.1-5.4 | ✅ |
| 10. PROPOSE_INITIAL_MESSAGE_TEMPLATE から register_branch 指示を削除 | design D5, tasks 5.5 | ✅ |
| 11. buildInitialMessage に渡す branch 名は state.branch から | tasks 5.6, specs/step-execution-architecture Scenario: ProposeStep.buildMessage uses state.branch | ✅ |
| 12. register-branch.ts を削除 | design D4, tasks 7.1, specs/register-branch-tool (全 REMOVED) | ✅ |
| 13. managed toolset から register_branch を除外 | tasks 7.2-7.3, specs/propose-session | ✅ |
| 14. buildAdditionalInstructions の Do NOT call register_branch 指示を削除 | tasks 6.3 | ✅ |
| 15. setsBranch フォールバック — 既存ロジック変更不要 | design Non-Goals, specs/step-execution-architecture | ✅ |
| 16. setupWorkspace で jobState.branch を早期記録 | design D3, tasks 2.3, 4.1-4.2 | ✅ |
| 17. 受け入れ基準 10 項目 | tasks 9.1-9.3 + 各 spec の scenario | ✅ |

## Consistency

- **propose-pipeline spec** と **propose-session spec** が `register_branch` 除外で整合している
- **step-execution-architecture spec** の `setsBranch` fallback 記述が executor.ts の既存ガード (`!state.branch`) と一致している
- **design D1** の `git worktree add -b` と **tasks 1.2** の実装指示が一致している
- **proposal.md** の Impact セクションに listed されたファイルと tasks のタスク対象ファイルが一致している

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | completeness | tasks.md:11 | Task 2.1 で `branchName` の計算を `setupWorkspace()` 内で行うか `WorkspaceOptions` で受け取るか二案併記されている。どちらを採用するか明示されていない | design D1 では `create()` のパラメータとして受け取る設計であり、Task 8.3 で `PipelineRunCommand.prepare()` → `WorkspaceOptions.branchName` 経由を明記しているため、Task 2.1 の括弧内の二案を削除し `WorkspaceOptions.branchName` から取得する旨に統一する |
| 2 | LOW | consistency | specs/propose-pipeline/spec.md:14 | Requirement タイトルが「propose セッションは標準ツール + custom_tools = [register_branch] で作成される」のまま。本文では register_branch を含めないと書いているがタイトルが旧仕様を反映している | タイトルを「propose セッションは標準ツールで作成される（custom_tools なし）」等に修正する |

## Verdict Rationale

- CRITICAL: 0, HIGH: 0
- 全要件が delta spec に展開済み。設計判断は既存コード構造と整合
- LOW 2 件はいずれも実装に影響しない記述上の曖昧さ・不整合であり、承認を阻止する要因ではない
