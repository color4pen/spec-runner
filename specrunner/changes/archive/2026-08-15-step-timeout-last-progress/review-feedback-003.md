# Code Review Feedback — iteration 003

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 読んだファイル・辿った diff

- `src/adapter/shared/last-tool-tracker.ts` — 全文精読
- `src/adapter/shared/__tests__/last-tool-tracker.test.ts` — 全文精読
- `src/adapter/claude-code/message-types.ts` — `isToolUse` の `id?` 拡張・`isToolResult` 追加を確認
- `src/adapter/claude-code/agent-runner.ts` — `observeMessage` クロージャ・`tracker.reset()` 位置・catch ブロックを精読
- `src/adapter/claude-code/__tests__/agent-runner-timeout-last-tool.test.ts` — 全文精読
- `src/adapter/codex/agent-runner.ts` — `extractCodexProgress` 分岐・tracker 呼び出し位置・catch ブロックを精読
- `src/adapter/codex/__tests__/agent-runner-timeout-last-tool.test.ts` — 全文精読
- `src/core/step/step-halt.ts` — `makeTimeoutHalt` が `err.hint` を `ErrorInfo.hint` にコピーすることを確認
- `specrunner/changes/step-timeout-last-progress/verification-result.md` — typecheck + test 全 green を確認
- `git diff main...HEAD` で既存テストファイル 6 本（design.md AC#5 リスト）の変更ゼロを確認

### 確認した設計対応

**D2: last-tool-tracker 実装**

`onToolEnd` の相関ロジック `last.id === undefined || id === last.id` を確認:
- id 付き start + id なし end → `last.id === undefined` が false → correlate しない → in-flight 維持 ✓
- id なし start + 任意 end → `last.id === undefined` が true → correlate → done ✓（TC-016 双方向）

**D3: 観測サイト 3 箇所**

`observeMessage` クロージャが 3 サイトすべてに到達することを追跡:
1. メインワークループ (agent-runner.ts:679): `observeMessage(message)` ✓
2. postWork follow-up (agent-runner.ts:966): `runFollowUpQueryWithRetry(..., observeMessage)` ✓
3. output-repair ループ (agent-runner.ts:1043): `observeMessage(message)` ✓

tool-report retry (retryPrompt パス、agent-runner.ts:941) は `observeMessage` を渡さない。これは設計 D3 の「3 サイト」記述と一致しており、既存の `emitToolProgress` の挙動を変更していない。

**replay skip**

`observeMessage` 先頭の `isReplay === true → return` が `onToolStart`・`onToolEnd` 両方をスキップすることを確認。TC-022 でテスト済み。

**TC-020: 既存テスト無変更**

`git diff main...HEAD` で下記 6 ファイルの変更がゼロであることを確認:
- `src/adapter/shared/__tests__/inactivity-watchdog.test.ts`
- `src/core/step/__tests__/executor-sequential-regression.test.ts`
- `src/core/step/__tests__/commit-orchestrator.test.ts`
- `src/core/step/__tests__/executor-drift-detection.test.ts`
- `src/core/step/__tests__/no-op-detect-exemption.test.ts`
- `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts`

### must テストケース全数確認

| TC | 内容 | 対応テストファイル | 結果 |
|----|------|-------------------|------|
| TC-001 | tracker in-flight | last-tool-tracker.test.ts | ✓ |
| TC-002 | tracker completed | last-tool-tracker.test.ts | ✓ |
| TC-003 | tracker no tool | last-tool-tracker.test.ts | ✓ |
| TC-004 | non-matching end | last-tool-tracker.test.ts | ✓ |
| TC-005 | cc tool_use → in-flight hint | agent-runner-timeout-last-tool.test.ts(cc) | ✓ |
| TC-006 | cc tool_result → completed hint | agent-runner-timeout-last-tool.test.ts(cc) | ✓ |
| TC-007 | cc no tool → no tool observed | agent-runner-timeout-last-tool.test.ts(cc) | ✓ |
| TC-008 | codex item.started → in-flight | agent-runner-timeout-last-tool.test.ts(codex) | ✓ |
| TC-009 | codex item.completed → completed | agent-runner-timeout-last-tool.test.ts(codex) | ✓ |
| TC-010 | codex non-tool → no tool observed | agent-runner-timeout-last-tool.test.ts(codex) | ✓ |
| TC-011 | hint→ErrorInfo.hint 到達 | agent-runner-timeout-last-tool.test.ts(cc) | ✓ |
| TC-012 | awaiting-resume 遷移維持 | agent-runner-timeout-last-tool.test.ts(cc) | ✓ |
| TC-013 | message テキスト不変 | agent-runner-timeout-last-tool.test.ts(cc) | ✓ |
| TC-014 | isToolResult true | agent-runner-timeout-last-tool.test.ts(cc) | ✓ |
| TC-015 | isToolResult false | agent-runner-timeout-last-tool.test.ts(cc) | ✓ |
| TC-019 | typecheck + test green | verification-result.md | ✓ |
| TC-020 | 既存テストファイル無変更 | git diff | ✓ |

should/could 優先度のケース (TC-016, TC-017 × 3, TC-018, TC-021, TC-022) もすべてテスト済み。

## 検証できなかった項目

None。全 must テストケースをコードとテストの双方で確認済み。

## Findings 詳細

指摘なし。

実装は設計・仕様・受け入れ基準に完全に適合している。以下は情報のみの観察：

- `observeMessage` 内で `isToolUse` と `extractTarget` が 2 回ずつ呼ばれる（`emitToolProgress` 内と、その直後の明示的チェック）。マイクロ冗長だが設計 D3 の「`emitToolProgress` を触らず既存挙動を保つ」方針に沿った意図的トレードオフ。
- `test-cases.md` 末尾の Result ブロックに `should: 2, total: 20` とあるが、実際の should 優先度ケースは 4 件、total は 22 件。spec 文書のカウント誤り（実装への影響なし）。
- TC-022 が test-cases.md では `category: unit` と分類されているが、実装は claude-code runner のインテグレーションテストとして書かれている。benign な分類ずれ（カバレッジは正しい）。
