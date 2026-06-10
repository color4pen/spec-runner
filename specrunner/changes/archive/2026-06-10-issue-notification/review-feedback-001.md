# Code Review Feedback — issue-notification — iter 1

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | testing | tests/unit/core/pipeline/pipeline.notification.test.ts | TC-011 (must): managed runtime path に専用テストなし。`test-cases.md` は "must" と分類しているが対応テストが存在しない。設計上の保証（notifyJobTerminal は pipeline 収束点に置かれ runtime 分岐なし、architecture invariant B-8 で検証済み）は成立しているが、managed runtime 経路が将来変更された際の回帰を捕捉するテストがない。 | managed runtime で pipeline を実行し terminal 状態へ遷移する統合テストを追加し、createIssueComment が呼ばれることを検証する | no |
| 2 | low | testing | tests/unit/core/pipeline/pipeline.notification.test.ts | TC-022 (must): handleExhausted（経路3）を実際に通過するテストなし。TC-PN-002 は "loop-exhausted" と記載されているが、実装は `{ on: "error", to: "escalate" }` による直接 escalation（経路2）を使っており `handleExhausted` コードパスを通過していない。通知ロジックは status 駆動のため機能的欠陥はないが、テストの記述と実装が乖離している。 | TC-PN-002 を maxIterations 到達で handleExhausted を実際に呼ぶ形に修正するか、経路3専用のテストケースを追加する | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 9.45

## Summary

実装・設計ともに request の要件を正確に満たしている。7 つの受け入れ基準はすべて達成済み（typecheck + 3732 tests green）。

収束点設計（D1）・best-effort 隔離（D7）・DSM 適合（B-1/B-7/B-8）・CLI 配線（D4）のいずれも設計どおりに実装されている。port 拡張は forge 中立なシグネチャを維持し、adapter 実装は既存 createPullRequest と対称なパターンに倣っている。issueNumber の CLI 検証（Number + isInteger + > 0）と validateJobState の backward compat 検証も仕様どおり。

指摘は test coverage の 2 点（TC-011・TC-022）のみで、いずれも機能的正当性には影響しない。TC-011 は architecture invariant で保証され、TC-022 は status 駆動の通知ロジックが経路に依存しないことで等価性が担保される。code-fixer での対処は不要と判断したため Fix 列を no とした。

