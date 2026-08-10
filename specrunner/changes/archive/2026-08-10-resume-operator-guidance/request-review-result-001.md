# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証（Code Assertion Fact-Check）

すべてのファイル:行番号アサーションを実コードで照合した。

| アサーション | 確認結果 |
|---|---|
| `src/core/command/resume.ts:296-393` — apply-canon gate | ✓ line 296 の `if (resolvedWorktreePath !== null && resolvedSlug !== null)` から始まり line 393 の `}` で終わる gate |
| `src/core/command/resume.ts:398-440` — adopt gate | ✓ line 398 の `{` から line 440 の `}` で終わる adopt gate ブロック |
| `src/core/command/resume.ts:382, 389` — dirty canon halt Hint が slug なし | ✓ 両行とも `stderrWrite("Hint: Use --apply-canon to commit these changes ...")` でスラグ埋め込みなし |
| `src/errors.ts:404-413` — `egressResolutionOptions(slugLabel)` | ✓ line 404 で関数定義、line 408 で `specrunner job resume ${slugLabel} --adopt-commits` 含む 3 択 |
| `src/cli/command-registry.ts:632-646` — resume エントリに `usage` フィールドなし | ✓ line 632 `resume:` エントリに `usage` フィールドなし。`positional` と `flags` と `handler` のみ |
| `src/cli/command-registry.ts:197` — `NO_DETAILED_HELP_USAGE` 定数 | ✓ `"No detailed help available.\nRun 'specrunner --help' for the command list.\n"` |
| `src/cli/command-registry.ts:633-645` — resume flags 11 個 | ✓ from/force/verbose/quiet/prompt/prompt-file/json/no-worktree/apply-canon/adopt-commits/detach = 11 個 |
| `src/cli/command-registry.ts:649` — `--detach + --json` 相互排他 | ✓ line 649 で排他チェック |
| `src/cli/command-registry.ts:674` — `--prompt + --prompt-file` 相互排他 | ✓ line 674 で排他チェック |
| `src/core/command/resume.ts:131-143` — slug 解決失敗 → Job ID prefix fallback | ✓ line 131-143 で `JobStateStore.resolveId` に fallback |
| `src/store/job-catalog.ts:288` — `"no job ID starts with '...'"` | ✓ line 288 の `SpecRunnerError` で message が `"Job not found: no job ID starts with '${prefix}'"` |
| `src/cli/command-registry.ts:634` — `--from` の values 検証 | ✓ `values: [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]` |
| `src/kernel/step-names.ts:13` — `AGENT_STEP_NAMES` | ✓ line 13 で export const AGENT_STEP_NAMES 定義開始 |
| `src/core/command/__tests__/resume-adopt-commits.test.ts:486, 775` — `toContain("--adopt-commits")` | ✓ 両行とも `expect(allOutput).toContain("--adopt-commits")` |

### help ディスパッチ経路の確認

`bin/specrunner.ts` の `emitHelp` 関数（line 15-18）が `usage ?? NO_DETAILED_HELP_USAGE` を write する。`job resume --help` 時、resume エントリの `usage` が undefined なので `NO_DETAILED_HELP_USAGE` が表示される。要件 4 の前提が成立している。

### 参照テストファイルの存在確認

受け入れ基準で指定された全テストファイルの存在を確認:
- `src/core/command/__tests__/resume-apply-canon.test.ts` ✓
- `src/core/command/__tests__/resume-adopt-commits.test.ts` ✓
- `src/core/command/__tests__/resume-partial-canon.test.ts` ✓
- `src/core/resume/__tests__/apply-canon-provenance.test.ts` ✓
- `tests/operator-canon-apply-on-resume-e2e.test.ts` ✓
- `tests/resume-partial-canon-quarantine-e2e.test.ts` ✓
- `tests/resolve-job-id.test.ts` ✓
- `tests/unit/cli/doctor-help.test.ts` ✓

### 設計整合性の確認

- dirty canon halt 時に adopt detection が実行されない事実（gate 1 が throw すると gate 2 未到達）をコードで確認 ✓
- `buildAdoptEscalationMessage` は `src/core/resume/adopt-commits.ts` に実装され、`egressResolutionOptions` を呼んで 3 択を生成する ✓
- `detectUnadoptedCommits` は pure read（git rev-list のみ）で副作用なし。preflight 用途に安全 ✓
- 要件 3（fail-closed 維持）の実装整合性: preflight で `detectUnadoptedCommits` を追加呼び出しするだけで既存の ledger 書き込みパスは変更不要 ✓

## 検証できなかった項目

None

## Findings 詳細

指摘なし。すべてのコードアサーションが実コードと一致し、設計根拠も妥当。
