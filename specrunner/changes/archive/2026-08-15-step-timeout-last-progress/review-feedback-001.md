# Code Review Feedback — step-timeout-last-progress — iter 1

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認（20 files、実装 7 ファイル + テスト 3 ファイル）
- `src/adapter/shared/last-tool-tracker.ts` — tracker API・状態・hint 文字列の3ケース
- `src/adapter/shared/__tests__/last-tool-tracker.test.ts` — TC-001〜004・TC-016 coverage
- `src/adapter/claude-code/message-types.ts` — isToolResult guard + isToolUse の id 型拡張
- `src/adapter/claude-code/agent-runner.ts` — observeMessage closure・3サイトの置換・hint attachment
- `src/adapter/codex/agent-runner.ts` — item.started/item.completed wiring・hint attachment
- `src/adapter/claude-code/__tests__/agent-runner-timeout-last-tool.test.ts` — TC-005〜007・TC-011〜015
- `src/adapter/codex/__tests__/agent-runner-timeout-last-tool.test.ts` — TC-008〜010
- `src/core/step/step-halt.ts:makeTimeoutHalt` — err.hint の ErrorInfo.hint への伝播を確認
- AC-#5 6 ファイルの git diff（出力なし = 変更なし）を確認
- verification-result.md: build/typecheck/test/lint/coverage すべて passed

## 検証できなかった項目

- events.jsonl への実際の書き込み経路（event-journal.ts）はエンドツーエンドでテストされていないが、
  設計 D1 が「hint → ErrorInfo.hint → event-journal.ts の既存書き込み」経路を code 確認済みと
  明示しており、makeTimeoutHalt 境界での TC-011 テストで十分と判断
- TC-017（step:progress が3サイト全て emit される）は "should" テストで未実装（後述 Finding 1）

## Findings 詳細

### Finding 1 (low) — TC-017 未実装

`observeMessage` は `emitToolProgress` を先頭で呼んでから tracker ロジックを実行するため、
`step:progress` は依然として同一サイトで emit される。実装は正しいが、この順序に対する
明示的なテスト assertion が存在しない。TC-017 は test-cases.md で "should" 優先度であり
ブロッキングではない。

**推奨（任意）**: TC-005 などに `step:progress` spy assertion を追加し、
tool_use ごとに正確に1回 emit されることをピンする。

---

## 受け入れ基準チェック

| AC | 状態 | 根拠 |
|----|------|------|
| claude-code: tool_use 後 timeout → hint に tool/target/elapsed | ✓ | TC-005 |
| codex: item.started 後 timeout → hint に tool/target/elapsed | ✓ | TC-008 |
| tool 完了後の無音 timeout → completed（in-flight でない） | ✓ | TC-006, TC-009 |
| tool 未観測 timeout → "no tool observed" | ✓ | TC-007, TC-010 |
| AC-#5 既存 watchdog テストファイル: 更新対象列挙・列挙外は無変更で green | ✓ | git diff 出力なし（6ファイル全て変更なし） |
| typecheck && test green | ✓ | verification-result.md 全フェーズ passed |
