# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだドキュメント
- `request.md`、`design.md`、`tasks.md`、`spec.md` を精読

### アーキテクチャ
- Ports & Adapters の境界は維持されている（shim 削除後の import 経路は canonical 実体へ 1 ホップになる）
- `REPORT_TOOL` を本番コードからテストローカル fixture へ移す決定（D2）は妥当。`reportTool` フィールドの型は `ReportToolSpec?` であり、stub で代替可能
- `LEVEL_ORDER` の un-export（D4）、archive `--dry-run` の unit 削除（D5）、shim 削除の実体 repoint（D3）は全て設計上正当

### 正確性
- `assertBreakAfterCompletion`（completion.ts:179）は両分岐とも return void の実質 no-op で、sse-stream.ts:134 の `break` が実際の制御フローを担うことを確認。削除後も loop exit は維持される
- `checkConfigComplete`（validation.ts:722-728）は無条件で null を返す no-op。削除後 preflight.ts の if-block も削除され挙動は変わらない
- `this.spawnFn` は agent-runner.ts 内で代入のみで呼び出しゼロを確認（grep で確認）
- `LEVEL_ORDER` は `isLevelEnabled`(:55) 内でのみ使用されており un-export が安全

### タスク網羅性
- request.md で列挙された 17 カテゴリの死コード（session-runner、isResultMessage/isTextDelta、assertBreakAfterCompletion、deleteSession、turnCount、_spawnFn/git-exec.ts、transient-error/session-log-writer shims、REPORT_TOOL/REPORT_TOOL_CUSTOM_TOOL_SPEC、formatAge/truncate、MANAGED_RESET_USAGE/bin exports、archive --dry-run、cwd deprecated、FileConfigStore/saveProjectConfig、checkConfigComplete、logDebug/getLogLevel/LEVEL_ORDER、resolveXdgStateDir、draftPathLegacy/draftUsageJsonPath）が T-01〜T-17 で網羅されていることを確認

## 検証できなかった項目

- inbox `--dry-run` と prune dry-run の挙動（スコープ外の live コードであり、既存テストで保護されているとの前提で読んでいる。実ファイルは精査していない）
- `SpawnFn` の TypeScript 型解決（tsconfig に `noUnusedLocals` がないため、不要な型 import が残っても compile error にはならないが、lint でひっかかる可能性がある）

## Findings 詳細

### F-01: T-06 の SpawnFn 操作が acceptance criteria と矛盾している

T-06 タスク本文は「SpawnFn import を `agent-runner.js` から `../../../../src/util/git-exec.js` へ repoint せよ」と指示しているが、acceptance criteria は `grep -r "_spawnFn\|spawnFn\|defaultSpawnFn\|git-exec" src/adapter/claude-code/ tests/unit/adapter/claude-code/` が 0 件であることを要求している。

repoint した場合、`agent-runner.test.ts` の import 行が `from "../../../../src/util/git-exec.js"` となり `git-exec` にマッチするため、acceptance criteria が失敗する。

`SpawnFn` は `makeGitSimulatingSpawnFn`（削除対象）の戻り型アノテーションでのみ使用されている（grep 確認済み）。`makeGitSimulatingSpawnFn` を削除すれば `SpawnFn` も不要になるため、import から完全に除去するのが正しい。

**修正**: `SpawnFn` を repoint するのではなく、import から削除する（`import type { QueryFn, CreateMcpServerFn } from "../../../../src/adapter/claude-code/agent-runner.js";` にする）。

---

### F-02: T-08 の fixture 定数名が design.md と tasks.md で食い違っており acceptance criteria を壊す

`design.md:38` は fixture 名を `REPORT_TOOL_FIXTURE` と明記している。しかし `tasks.md`（T-08）は `const REPORT_TOOL = {...}` と指示している。

`const REPORT_TOOL` という名前のまま codex test ファイルに残すと、T-08 acceptance criteria `grep -r "REPORT_TOOL\b\|REPORT_TOOL_CUSTOM_TOOL_SPEC" src/ bin/ tests/` が tests/ でマッチを返し、0 件要件が失敗する（`\b` は `REPORT_TOOL` 後が空白でも境界を認識するため `PRODUCER_REPORT_TOOL` 等はマッチしないが `REPORT_TOOL =` はマッチする）。

`REPORT_TOOL_FIXTURE` という名前にすれば、`_F` が続くため `\bREPORT_TOOL\b` のパターンにはマッチせず、acceptance criteria は通過する（design.md の記述通り）。

**修正**: tasks.md の fixture 定数名を `REPORT_TOOL_FIXTURE` に修正し、テスト内の `reportTool: REPORT_TOOL` 参照も `reportTool: REPORT_TOOL_FIXTURE` に置き換える。

---

### F-03: T-15 の acceptance criteria が LEVEL_ORDER について自己矛盾している

T-15 acceptance criteria の第 1 項は `grep -r "\blogDebug\b\|\bgetLogLevel\b\|\bLEVEL_ORDER\b" src/ bin/ tests/` が 0 件と要求している。しかし同じ criteria の第 2 項は「`LEVEL_ORDER` is present in `src/logger/stdout.ts` without `export`」と要求している。

un-export された `const LEVEL_ORDER` は `stdout.ts` に残るため grep がマッチし、0 件要件を満たせない。

**修正**: 第 1 項の grep パターンを `\blogDebug\b\|\bgetLogLevel\b\|export.*LEVEL_ORDER` に変更する（`LEVEL_ORDER` 自体の存在ではなく export を検出する）。
