# Code Review Feedback — iteration 002

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
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | testing | src/core/archive/__tests__/orchestrator.test.ts | TC-004・TC-005（should）が未カバー。T-03a/b/c はいずれも `code: "ENOENT"` のエラーのみテストしており、ENOENT 以外（例: EACCES）での `stderrWrite` 呼び出しを検証するケースが存在しない。review-001 finding #2 の「Fix: yes」指摘が未解消。 | ENOENT 以外のエラー（`{ code: "EACCES" }` など）で reject するよう `unlinkImpl` を設定し、`vi.mocked(stderrWrite)` に warning 文字列が含まれることを assert するテストを liveness / marker それぞれ 1 件ずつ追加する。`stderrWrite` は `../../../logger/stdout.js` のモックで既に `vi.fn()` として取得済み。 | yes |

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

review-001 finding #1（高）は完全に解消。`orchestrator.ts` の両 catch ブロックが `(err as NodeJS.ErrnoException).code !== "ENOENT"` を正しく分岐し、ENOENT はサイレント、それ以外は `stderrWrite` で warning を出す実装になっている。受け入れ基準の "must" 3 件（TC-001: marker.json 削除、TC-002: liveness.json 削除、TC-006: typecheck + test green）はすべて充足。

残る問題は 1 件のみ: T-03a/b/c が ENOENT ケースしか網羅しておらず、非 ENOENT エラー時の warning 出力を検証するテストがない。`stderrWrite` は既にモック済みで追加コストは小さい。
