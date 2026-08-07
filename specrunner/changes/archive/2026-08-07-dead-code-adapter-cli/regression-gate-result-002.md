# Regression Gate Result — dead-code-adapter-cli / Iteration 2

## Per-Finding Status

### [MEDIUM] T-06: SpawnFn import 操作がタスク本文と acceptance criteria で矛盾
**Status: FIXED (持続)**

`tasks.md` T-06 は SpawnFn を完全 remove（repoint ではなく削除）する指示を維持。acceptance criteria `grep -r "_spawnFn\|spawnFn\|defaultSpawnFn\|git-exec" src/adapter/claude-code/ tests/unit/adapter/claude-code/` は 0 件。

---

### [MEDIUM] T-08: fixture 定数名が design.md (REPORT_TOOL_FIXTURE) と tasks.md (REPORT_TOOL) で食い違い
**Status: FIXED (持続)**

`tasks.md` T-08 line 114 は `REPORT_TOOL_FIXTURE` を fixture 名として宣言。acceptance criteria `grep -r '\bREPORT_TOOL\b' tests/` は `REPORT_TOOL_FIXTURE` を拾わず 0 件。

---

### [LOW] T-15: LEVEL_ORDER acceptance criteria が自己矛盾
**Status: FIXED (持続)**

`tasks.md` T-15 acceptance criteria:
```
grep -r "\bexport.*LEVEL_ORDER\b\|\bLEVEL_ORDER\b" src/ bin/ tests/ --include='*.ts' | grep -v 'src/logger/stdout.ts'
```
`stdout.ts` を除外する記述を維持。`src/logger/stdout.ts` では `const LEVEL_ORDER` が un-export で存在し `isLevelEnabled` 内部からのみ使用されていることを確認。

---

### [MEDIUM] REPORT_TOOL ローカル変数が acceptance criteria の grep 0 件条件を違反
**Status: FIXED (持続)**

`tests/unit/contract/agent-runner-contracts.test.ts:73` は `const REPORT_TOOL_SPEC: ReportToolSpec = { ... }` となっており、`\bREPORT_TOOL\b` パターンにはマッチしない（`REPORT_TOOL_SPEC` は `_` が word boundary を阻む）。

補足: `tests/dead-code-adapter-cli.test.ts:474` のコメントに "const REPORT_TOOL in contracts.test.ts" という outdated な記述が残るが、同テストは自ファイルを grep から除外（line 478-479）しており、テスト結果に影響しない。

---

### [LOW] turnCount がコメントに残存（コメント内の言及含む条件に違反）
**Status: FIXED**

`src/adapter/claude-code/query-one-shot.ts` の `numTurns` フィールド JSDoc を確認。現在の記述:
```
* Number of SDK turns used in this invocation.
* SDK result num_turns. undefined if not provided by the runtime.
```
`turnCount` への言及は消去済み。`grep -r 'turnCount' src/` は 0 件。

---

### [LOW] turnCount が describe/コメント/文字列引数に複数残存
**Status: FIXED**

`tests/unit/adapter/claude-code/query-one-shot-metrics.test.ts` を全文確認。`turnCount` は一切出現せず。describe は `numTurns` ベースで書き直され、`hasOwnProperty.call(result, "numTurns")` を使用（line 124）。

---

### [LOW] formatAge がコメントに残存
**Status: FIXED**

`src/core/job-list/operations-view.ts:340` の JSDoc は:
```
* Format a job's age in human-readable form.
```
`formatAge` への言及は消去済み。`grep -r '\bformatAge\b' src/core/job-list/operations-view.ts` は 0 件。

---

### [LOW] ADR D1 references deleted assertBreakAfterCompletion as break-invariant guard
**Status: FIXED**

`specrunner/adr/2026-04-27-cli-core-pipeline.md` D1 の該当箇所（line 24）を確認:
```
SSE で `session.status_idle` + `stop_reason: "end_turn"` を観測した時点で **必ず break** する（`sse-stream.ts` の break ステートメントで実装）
```
`assertBreakAfterCompletion` への言及は D1 テキストから消去済み。Design Debt 欄 L4 に `assertBreakAfterCompletion` の言及が残るが、これは「削除を記録する」文脈であり D1 の誤誘導とは異なる。`grep` で `assertBreakAfterCompletion` は ADR の Design Debt 行のみに存在、`src/` および `tests/` には 0 件。

---

## Evidence Summary

| # | Finding | 前回 | 今回 |
|---|---------|------|------|
| 1 | T-06: SpawnFn tasks.md 矛盾 | ✅ Fixed | ✅ Fixed |
| 2 | T-08: REPORT_TOOL_FIXTURE 名前不一致 | ✅ Fixed | ✅ Fixed |
| 3 | T-15: LEVEL_ORDER AC 自己矛盾 | ✅ Fixed | ✅ Fixed |
| 4 | REPORT_TOOL ローカル変数 contracts.test.ts | ✅ Fixed | ✅ Fixed |
| 5 | turnCount JSDoc query-one-shot.ts:81 | ❌ Regression | ✅ Fixed |
| 6 | turnCount query-one-shot-metrics.test.ts | ❌ Regression | ✅ Fixed |
| 7 | formatAge コメント operations-view.ts:341 | ❌ Regression | ✅ Fixed |
| 8 | ADR D1 assertBreakAfterCompletion 参照 | ❌ Regression | ✅ Fixed |

全 8 件修正確認済み。
