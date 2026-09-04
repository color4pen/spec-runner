# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Code Assertion Fact-Check

| 主張 | 検証結果 |
|------|---------|
| `CommandHandler`: `Promise<void>` | ✓ `src/cli/command-handler.ts:11` で確認 |
| handler 件数 30 | ✓ `src/cli/command-registry.ts` の `handler:` エントリ数が 30 件 |
| 所有モジュール 21 件 | ✓ registry の handler 系 import が 21 モジュール（型 import 除く）|
| production `src/cli` 内 `process.exit(...)`: 74 件 | ✓ テストファイルを除くと 74 件（`grep -n "process\.exit("` + `grep -v "__tests__"` で確認）|
| 対象ファイル数 24 | ✓ 同条件で 24 ファイル |
| `bin/specrunner.ts` 内 `process.exit(...)`: 15 件 | ✓ `grep -n "process\.exit("` で 15 件確認 |

### 読んだファイル・確認したコード

1. `src/cli/command-handler.ts` — CommandHandler 型定義（`Promise<void>`）
2. `src/cli/command-registry.ts` — 30 handler エントリ、21 owning module import を確認
3. `bin/specrunner.ts` — dispatch error boundary の実装を確認
4. `src/cli/job-archive-handler.ts` — 典型的なハンドラパターン（早期 process.exit、try/catch、SpecRunnerError 共通変換）を確認
5. `src/errors.ts` — EXIT_CODE 定数（SUCCESS:0, GENERAL_ERROR:1, ARG_ERROR:2）
6. `src/cli/__tests__/architecture-ratchet.test.ts` — 現行 ratchet（Check 2 は command-registry.ts 限定）
7. `src/cli/__tests__/command-registry-reopen.test.ts`, `archive-from-issue.test.ts`, `from-issue.test.ts`, `resume-from-issue.test.ts`, `detach-flag-cli.test.ts` — process.exit をモックしているテスト（計 5 ファイル）

### 現状の dispatch 境界の確認

`bin/specrunner.ts` は既に以下の完全な error boundary を持つ:
- `FlagParseError` → `process.exit(2)`
- `SpecRunnerError` → `process.exit(err.exitCode)`
- unknown error → `process.exit(1)`

dispatch は `await spec.handler!(parsed, ctx)` であり、返り値を使っていない。
リファクタリング後は `process.exit(await spec.handler!(parsed, ctx))` へ変更することで完結する。

### 非実行チェック項目（静的確認）

- `handleJobArchive` パターン：早期 `process.exit(EXIT_CODE.ARG_ERROR)` → `return EXIT_CODE.ARG_ERROR`、末尾 `process.exit(await runArchive(...))` → `return await runArchive(...)`、共通 SpecRunnerError catch → 削除して上位伝播 — 全て機械的に適用可能
- `emitHelp` 関数（`bin/specrunner.ts`、`never` 型）は handler ではなく entrypoint 内部関数であり、変更不要

## 検証できなかった項目

None。コード数値は全て静的 grep で確認できた。

## Findings 詳細

None。指摘事項はない。

全数値が正確であることを確認した。リファクタリングの技術的アプローチ（handler の return 型変更・早期 process.exit → return・共通 catch 削除・dispatch での process.exit(await handler(...)) ）は現行コードと整合しており、フィジビリティに問題はない。
