# Spec Review Result: remove-localruntime-legacy-path

- **iteration**: 1
- **verdict**: needs-fix
- **date**: 2026-05-11
- **reviewer**: spec-reviewer

## Summary

request.md と design.md は明確で整合的。ただし tasks.md が positional 呼び出し 1 箇所（line 481）と比較テストの削除を漏らしている。typecheck が安全網として機能するが、タスク分解の網羅性に欠陥がある。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | completeness | tasks.md (Task 1) | positional 呼び出しが 19 箇所あるのに 18 箇所と記載。line 481 `const positional = new LocalRuntime(tempDir, githubClient, manager1, spawnFn1)` が Task 1 の行リストから漏れている | Task 1 の 4-arg パターンに line 481 を追加し、箇所数を 19（4-arg: 11, 3-arg: 8）に修正する |
| 2 | HIGH | correctness | tasks.md (Task 1) | line 474-487 の比較テスト「named options and positional constructor produce equivalent runtimes」は positional パス削除後に存在意義がない。単純な named options 変換ではなく、テストケース自体の削除が必要 | Task 1 に「TC-LR-011 の比較テスト（lines 474-487）を削除する」サブタスクを追加する |
| 3 | MEDIUM | consistency | design.md | 「positional 呼び出しが 18 箇所残存」は実際には 19 箇所 | 18 → 19 に修正する |

## Review Scope

| Category | Scope | Result |
|----------|-------|--------|
| architecture | verify | PASS — 変更は constructor signature のみ。Ports & Adapters パターンへの影響なし |
| correctness | verify | FAIL — Finding #2: 比較テストの扱いが未定義 |
| completeness | task decomposition only | FAIL — Finding #1: 呼び出し箇所の列挙漏れ |
| consistency | reduced | Finding #3: 箇所数の不一致（軽微） |
| feasibility | skip | — |
| security | skip | — |
