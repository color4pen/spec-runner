# Code Review Feedback — step-timeout-last-progress — iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認（実装 4 ファイル + テスト 3 ファイル新規）
- `src/adapter/shared/last-tool-tracker.ts` — API・状態構造・hint 3ケース・id 相関ロジック
- `src/adapter/shared/__tests__/last-tool-tracker.test.ts` — TC-001〜004・TC-016・TC-021 coverage
- `src/adapter/claude-code/message-types.ts` — `isToolResult` guard・`isToolUse` narrowed type に `id?: string` 追加
- `src/adapter/claude-code/agent-runner.ts` — `observeMessage` closure・3 サイト置換・`tracker.reset()` 位置・hint 付与
- `src/adapter/codex/agent-runner.ts` — `item.started`/`item.completed` wiring・`tracker.reset()` 位置・hint 付与
- `src/adapter/claude-code/__tests__/agent-runner-timeout-last-tool.test.ts` — TC-005〜007・TC-011〜015・TC-017 spy・TC-022
- `src/adapter/codex/__tests__/agent-runner-timeout-last-tool.test.ts` — TC-008〜010
- `src/core/step/step-halt.ts:makeTimeoutHalt` — `err.hint` → `ErrorInfo.hint` への伝播を確認
- AC-#5 6 ファイルの `git diff`（出力なし = 変更なし）を確認
- `verification-result.md` — build/typecheck/test/lint/coverage すべて passed

## 受け入れ基準チェック

| AC | 状態 | 根拠 |
|----|------|------|
| claude-code: tool_use 観測後 timeout → hint に tool/target/elapsed/in-flight | ✓ | TC-005 |
| codex: item.started 観測後 timeout → hint に tool/target/elapsed/in-flight | ✓ | TC-008 |
| tool 完了後の無音で timeout → in-flight でない旨 | ✓ | TC-006, TC-009 |
| tool 未観測で timeout → "no tool observed" | ✓ | TC-007, TC-010 |
| AC-#5 既存 watchdog テストファイル: 列挙外は無変更 green | ✓ | git diff 出力なし（6 ファイル全て変更なし） |
| typecheck && test green | ✓ | verification-result.md 全フェーズ passed |

## iter 1 Finding 1 の対応確認

iter 1 Finding 1（TC-017: `step:progress` assertion 未実装）について、code-fixer が TC-005 に `emitSpy` を追加し
`expect(emitSpy).toHaveBeenCalledWith("step:progress", expect.objectContaining({ tool: "Bash" }))` をピンした。
`observeMessage` は単一 closure であり 3 サイト全てが同じ関数を呼ぶため、1 サイトの assertion がコード上も担保する。

## Findings 詳細

### Finding 1 (low) — TC-017 "should" assertion が main loop サイトのみ

TC-005 の spy assertion は `step:progress` が emit されることを確認するが、
postWork onMessage（サイト 2）と output-repair loop（サイト 3）は個別テストなし。
`observeMessage` が 3 サイト全てで同一 closure として呼ばれることはコードで確認済みのため
実装の正しさは担保されており、TC-017 の優先度は "should" でブロッキングではない。

推奨（任意）: postWork/repair ループをトリガーするシナリオを追加して 3 サイト全てを個別 assertion でピン。

## 検証できなかった項目

- events.jsonl への実際の書き込みはエンドツーエンドでテストされていないが、
  設計 D1 が hint → ErrorInfo.hint → event-journal の既存書き込みを code 確認済みと明示し、
  `makeTimeoutHalt` 境界での TC-011 assertion で代替されており実用上十分と判断する。
- TC-018（wall-clock timeout も hint を受け取る）は "could" 優先度で未実装。許容範囲。
