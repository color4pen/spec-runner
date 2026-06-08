# Code Review Feedback — iteration 001

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | testing | tests/unit/adapter/managed-agent/agent-runner.test.ts | TC-005（must）が未実装。`environmentNotSetError("design")` を直接呼んで `code`・message の stepName・hint の remediation（"specrunner managed setup"）を検証するユニットテストが存在しない。統合テスト（T-02）は `code` のみを確認しており、message/hint の文字列仕様は無検証 | `describe("TC-005: environmentNotSetError factory", ...)` を追加し、factory の返り値の code / message / hint を直接アサートする | yes |
| 2 | LOW | correctness | src/adapter/managed-agent/agent-runner.ts:633,656 | T-03 タスクで「`!` が残らないこと」と宣言したが `sendUserMessage(sessionId!, initialMessage)` の `!` が L633（fallback 経路）と L656（else 経路）に残存。tasks.md チェックボックスが [x] で完了済みと記載されているが実態と乖離している | `createSession` の port 型は `Promise<{ sessionId: string }>` なので L656 は `!` 不要なはず。除去して typecheck が通るか確認する。L633（outer catch 内 nested try/catch）は TypeScript narrowing 制限で除去できない場合、tasks.md の記述を実態に合わせて修正する | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 10 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 9.35

## Summary

3 箇所の非 null アサーション（`config.environment!.id`・`return sessionId!`・`state.branch!`）はすべて正しく安全なアクセスに置き換えられている。`resolveEnvironmentId` helper の設計は `branchNotSetError` パターンと一貫しており clean。`ENVIRONMENT_NOT_SET` error code / factory の追加、`sessionId === undefined` の明示 guard、`state.branch === null` の throw も要件通り。TC-001〜TC-004 の統合テストは揃っており、verification（build / typecheck / test / lint）はすべて green。変更スコープは managed adapter と errors.ts に正しく閉じている。

修正が必要な点は 2 つ。(1) TC-005（must）の factory ユニットテスト不在 — 統合テストは `code` のみ確認しており、message/hint の文字列仕様が直接検証されていない。(2) T-03 で除去すると宣言した `sessionId!` が L633・L656 に残存 — TypeScript の narrowing 制限で除去できない場合はタスクの記述を実態に合わせることで完結する。

