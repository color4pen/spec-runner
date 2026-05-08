# Code Review — interactive-create-dialog — iter 1

- **reviewer**: code-reviewer
- **iteration**: 1
- **date**: 2026-05-08
- **verdict**: approved

## Summary

4 phase 構造、generator prompt による REPL、draft 永続化、CLI ファサード更新のすべてが design.md の決定に忠実に実装されている。新規ファイル 4 本（create-dialog.ts / create-dialog prompts / draft-store / message-types 追加）＋ CLI ファサード更新という構成は責務が明確に分離されている。テストは 77 件 all green、typecheck も通過。CRITICAL / HIGH の指摘なし。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|---------|
| correctness | 7 | 0.30 | 2.10 |
| security | 7 | 0.25 | 1.75 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **7.45** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | security | src/state/draft-store.ts:37 | `saveDraft()` が slug をそのままパスに組み込んでおり、`../` 等のパストラバーサルを検証していない。CLI 経由の slug は `slugify()` 通過済みだが、draft-store 単体での防御がない | `saveDraft()` 入口で `slug.includes('/') \|\| slug.includes('..') \|\| slug === ''` を reject する。または既存の `slugify()` で正規化済みであることを型レベル（branded type）で保証する |
| 2 | MEDIUM | correctness | src/core/command/create-dialog.ts:311-349 | `textBuffer` は `text_delta` の蓄積で構築し、`type === "assistant"` でリセットする。SDK がツール実行の中間で "assistant" メッセージを emit する場合、バッファが途中リセットされ `<!-- FINAL_DRAFT -->` 検出に失敗する可能性がある | SDK のメッセージストリームの仕様を確認し、ツール実行を含むターンで "assistant" が複数回 emit されないことを検証する。もし emit される場合は "result" メッセージのみでバッファリセットに変更する |
| 3 | MEDIUM | testing | tests/unit/core/command/create-dialog.test.ts | `executeCreateDialog()` の統合テストが ManagedRuntime 拒否の 1 ケースのみ。mock SDK メッセージストリームを流して dialogLoop → detectCompletion → finalize の E2E パスを検証するテストがない | `queryInteractive` を mock し `[stream_event(text_delta), assistant]` のメッセージ列を流す統合テストを追加。FINAL_DRAFT 検出 → 確認 → finalize の正常系パスを検証する |
| 4 | LOW | maintainability | src/core/command/create-dialog.ts:302 | `isStreamEvent(msg) && isTextDelta(msg)` — `isTextDelta()` は内部で `isStreamEvent()` を呼んでいるため、前段の `isStreamEvent()` チェックは冗長 | `if (isTextDelta(msg))` のみにする |
| 5 | LOW | correctness | src/core/command/create-dialog.ts:76,85 | `detectCompletion()` の `.trim()` により、FINAL_DRAFT マーカー直後の意図的な空行（request.md の先頭）が除去される。`parseRequestMdContent()` が `# Title` を先頭行として期待する場合は問題ないが、LLM が余白を含めた場合に挙動が変わる | `.trim()` の代わりに `.replace(/^\n+/, '')` で先頭改行のみ除去し、末尾の空白は保持する。低リスクだが明示的な方が安全 |
