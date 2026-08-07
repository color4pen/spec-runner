# Code Review Feedback — dedup-verified-safe — iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --name-only`: 15 src/ ファイル + 1 tests/ ファイル（現 HEAD の net 変更）を確認
- `verification-result.md`: build / typecheck / test / lint / changed-line-coverage すべて passed、727 test files / 10686 tests / 1 pre-existing skip を確認
- `design.md` / `tasks.md` / `test-cases.md` を再通読し、iter 1 以降の変更を把握
- **iter 1 F-001** (`io-iteration.ts` stale comment): `computeCodeReviewIteration` への言及が削除されていることを確認 ✅
- **iter 1 F-002** (TC-016 不整合): `test-cases.md` に「意図的残置」注記が追加されており、実装判断と整合していることを確認 ✅

### 受け入れ基準 5 項目

| 基準 | 確認結果 |
|------|--------|
| 既存 test が 1 ファイルも無改変で green | ✅ 727 test files / 10686 tests / 0 test files modified |
| verification 結果 markdown の skip 文言が変更前と同一 | ✅ `_(skipped — previous ${args.skipLabel} failed)_` テンプレートが "command" / "phase" 双方で byte-identical |
| `run` と `job start` の `--help` 出力が変更前と同一 | ✅ 各エントリに `"request.md\|slug"` / `"slug\|file"` を個別保持、`runJobHandler` は共通 |
| 削除した symbol が src/ tests/ で grep 0 件 | ✅ 4 関数・`PROBE_SLUG` とも code として 0 件（comment/string は test のパターン除外対象） |
| `typecheck && test` が green | ✅ verification-result.md で confirmed |

### C1 (run / job-start 統合)

`RUN_JOB_FLAGS` 定数と `runJobHandler` 関数が `command-registry.ts:371-422` に定義され、`run` エントリ（line 455-458）と `job.subcommands.start` エントリ（line 529-532）の両方から `handler: runJobHandler` で参照されていることを確認。ポジショナルラベルの差（`"request.md|slug"` / `"slug|file"`）が各エントリに保持されていることを確認。

### C2 (compute*Iteration 削除)

4 ステップファイルすべてで `nextIteration(state, STEP_NAMES.X)` に置き換え済み。`computeCodeReviewIteration`・`computeSpecReviewIteration`・`computeRequestReviewIteration`・`computeConformanceIteration` が src/ / tests/ の code 箇所から完全に消去されていることを確認。`io-iteration.ts` コメントから stale 参照も除去済み（iter 1 F-001 解消）。

### C3 (detectPackageManager phase-1)

`detect-pm.ts:58-61` で `findLockfile(cwd, fs)` 呼び出しに置き換えられ、inline の `while (true)` walk ループが除去されていることを確認。

### C4 (loadConfig 委譲)

`store.ts:77-78` が `return (await loadConfigWithSourceMetadata(repoRoot)).config;` 1 行になっていることを確認。

### C5 (journal append 統合)

`_appendRecord` private メソッドが `job-journal.ts:191-193` に追加。`appendEventRecord(` call expression は 1 件のみ（import 行を除く）。4 つの public メソッド（`appendInterruption`, `appendLineage`, `appendOperatorEvent`, `appendFindingRecency`）は署名を維持したまま `_appendRecord` へ委譲。`writeAllToJournal` はモジュールレベル関数から private class method `_writeAllToJournal` に変換済み（tasks.md T-06 に明示）。

### C6 (verification tail 抽出)

`finalizeVerificationRun` が `runner.ts:320-411` に抽出され、`skipLabel: "command" | "phase"` パラメータ経由でテンプレート文字列を生成。`runVerificationCommands` は `skipLabel: "command"` で、`runVerificationPhases` は `skipLabel: "phase"` で呼び出し。

### C7 (worktreePath helper)

`src/core/resume/resolve-worktree-path.ts` が作成され、`resume.ts:274` と `reopen.ts:309` の両方がインポートして `resolveLivenessWorktreePath` を呼び出していることを確認。`resolvedSlug ?? ""` で null→空文字変換しており、helper 内の `if (!resolvedWorktreePath && slug)` の falsy チェックで空文字がスキップされる（元コードの `if (!resolvedWorktreePath && resolvedSlug)` と同一挙動）。

### C8 (dead code 除去)

- `PROBE_SLUG` alias: `descriptor-input-completeness.ts` から削除済み、`VALIDATOR_PROBE_SLUG` を直接使用
- 空 if ブロック: `job-state-projection.ts` から削除済み（"Counters are stale" grep 0 件）
- identity `enrichContext`: `spec-review.ts:93` に意図的残置。`tests/prompts/spec-review-system.test.ts` が `typeof SpecReviewStep.enrichContext === 'function'` を assert しており、削除すると test ファイル改変が必要になるため受け入れ基準優先で維持。TC-016 にその旨注記済み（iter 1 F-002 解消）

## 検証できなかった項目

None — 主要な確認項目はすべて静的解析で検証済み。

## Findings 詳細

None。iter 1 の 2 件（stale comment / TC-016 不整合）はいずれも解消されており、新規の blocking 指摘はない。
