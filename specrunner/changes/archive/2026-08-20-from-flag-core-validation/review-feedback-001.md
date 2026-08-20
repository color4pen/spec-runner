# Code Review Feedback — from-flag-core-validation — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### diff 範囲

`git diff main...HEAD --stat` で確認: src/ 変更は 8 ファイル（実装 3 + テスト 5）。

### command-registry.ts

- resume (line 1065) と reopen (line 1201) の `from` flag が `{ type: "string" }` に変更されていることを確認。`values:` 制約は完全に撤去されている。
- `JOB_RESUME_USAGE` (lines 368–374): "composite steps ... are not valid --from targets" が削除され、"Note: jobs with custom reviewers also accept: regression-gate, custom-reviewers, or reviewer member names..." に置換されている。`bite-evidence` の注記は維持されている。
- `REOPEN_USAGE` (lines 500–504): 同趣旨の注記が追加されている。
- `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` は usage text テンプレート（"Valid steps: ..."）で引き続き使用されており、import 整理の必要なし（T-01 チェック済みと一致）。

### resume.ts

- catch ブロック (line 267): `PrepareError(this.options.from !== undefined ? 2 : 1, ...)` に変更されている。
- `execute()` override (lines 124–134): `PrepareError.exitCode` をそのまま返す実装であり、exit code 2 / 1 が正しく伝播する。
- `logError((err as Error).message)` は変更なし。core が生成する "Available step names: ..." メッセージがそのまま表示される。

### reopen.ts

- catch ブロック (line 227): `PrepareError(2, ...)` に変更されている（無条件）。
- `ReopenOptions.from` が `string`（必須、非 optional）であることを型定義で確認。
- CLI handler (command-registry.ts:1220–1223): `!fromStep` を確認して `process.exit(ARG_ERROR)` を呼ぶため、ReopenCommand に `from === undefined` が渡ることはない。unconditional exit 2 は正しい。

### resolve-step.ts

スコープ外（触らない）として確認。コードは変更なし。`buildAllowedStepSet` / `resolveResumeStep` / `mapMemberToCoordinator` の実装は既存のまま。

### from-flag-no-enum.test.ts（新規）

- TC-001..004: `parseFlags` に実際の `resumeFlags` / `reopenFlags` を渡して "regression-gate", "custom-reviewers", "alice" が FlagParseError を throw しないことを検証。flag 定義は `COMMANDS["job"]!.children!["resume"]!.flags!` から取得しており、実際の registry 定義を参照している。
- TC-013a/b/c/d/e: `JOB_RESUME_USAGE` の文字列内容を直接アサート。
- TC-014: `REOPEN_USAGE` に "custom reviewers" が含まれることを確認。
- TC-015: "build-fixer" が FlagParseError を throw しないことを確認。

### resume-from-exit-code.test.ts（新規）

- **実 `resolveResumeStep` を使用**（mocked でない）。TC-005/006/007 の success path では `buildAllowedStepSet` → `resolveResumeStep` が本番ロジックで実行される。
- TC-005: reviewers=[{name:"security"}], from="regression-gate" → `buildAllowedStepSet` が regression-gate を許可集合に追加 → resolve 成功 → `result.startStep === "regression-gate"` を確認。
- TC-006: from="custom-reviewers" → same reviewer set → resolve 成功 → `result.startStep === "custom-reviewers"` を確認。
- TC-007: from="alice", reviewers=[{name:"alice"}] → `mapMemberToCoordinator` が "alice" → "custom-reviewers" に写像 → `result.startStep === "custom-reviewers"` を確認。
- TC-008: from="bogus-step", reviewers なし → resolver が throw → `PrepareError.exitCode === 2` を確認。
- TC-009: from="regression-gate", reviewers なし → regression-gate は静的集合に存在しない → throw → exit 2 を確認（空配列ケースも追加で確認）。
- TC-012: from 未指定, state.step="init" → `toStepName("init")` は passthrough cast、resolver が throw ("init" は pipeline step でない) → `from === undefined` → `PrepareError(1, ...)` → exit 1 を確認。
- モック構成: `detectSpecrunnerWorktree(cwd)` は非モックだが、cwd="/repo" が存在しないため fail-open（`{ isSpecrunnerWorktree: false }`）を返すことを確認。`resolveLivenessWorktreePath` も非モックだが state.worktreePath が未設定かつサイドカーが存在しないため null を返し、worktree ブロックがスキップされることを確認。

### reopen-command.test.ts（追記）

- TC-010/011: 既存の `resolveResumeStep` mock（`mockImplementationOnce` で throw）を使用して reopen.ts の exit code 変更を検証。`getReopenExitCode(err) === 2` を確認。
- 既存のモック構造と一貫しており、ファイルの既存アーキテクチャに整合している。

### 既存テストの確認

- `resume-help.test.ts`: TC-016 の assertion が "composite step" → "custom reviewers" に更新されている。変更後の usage text と一致。
- `specrunner-resume-dispatch.test.ts`: TC-DISPATCH-003..006 が「CLI が拒否する」→「core に pass-through する」に行動変容が正しく反映されている。

### verification-result.md

- build / typecheck / test / lint / changed-line-coverage: すべて passed。
- test: 798 ファイル, 11923 passed, 1 skipped, 2 todo。

## 検証できなかった項目

None。

## Findings 詳細

指摘なし。
