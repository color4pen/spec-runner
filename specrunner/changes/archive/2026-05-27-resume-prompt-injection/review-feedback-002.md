# Code Review Feedback: resume-prompt-injection
**Iteration**: 2  
**Reviewer**: code-review agent  
**Date**: 2026-05-27

---

## Summary

iteration 1 で指摘した F-01〜F-03（must カバレッジ不足）がすべて修正された。実装品質・型安全性・後方互換は引き続き問題なし。`bun run typecheck && bun run test` は 269 files / 3018 tests all green。

---

## Iteration 1 Findings の対応状況

| # | severity | 指摘内容 | 対応 |
|---|----------|----------|------|
| F-01 | minor | TC-02 未カバー（`--prompt-file` ファイル読み込みパス） | TC-DISPATCH-011 を追加 ✓ |
| F-02 | minor | TC-05 未カバー（存在しないファイルパス → exit 1） | TC-DISPATCH-012 を追加 ✓ |
| F-03 | minor | TC-15/TC-16 未カバー（ManagedAgentRunner resumePrompt 注入） | polling / SSE 双方のテストを追加 ✓ |
| F-04 | cosmetic | test-cases.md TC-03 の stderr 文言と実装の不一致 | 対応なし（cosmetic のため許容） |

---

## Findings（iteration 2）

新規 findings なし。

---

## Positive Notes

- **F-01 修正（TC-DISPATCH-011）**: 一時ファイルを実際に書き出して `--prompt-file=<path>` で渡し、`runResume` に `prompt: "fix content"` が届くことを確認。正しいテスト設計。
- **F-02 修正（TC-DISPATCH-012）**: 存在しないパスを `--prompt-file` に渡したとき、`exit(1)` かつ stderr に `"Cannot read prompt file"` が含まれることを確認。exit code まで検証している点が丁寧。
- **F-03 修正（TC-15/TC-16）**: polling パス（`sendUserMessage` の引数を検証）と SSE パス（`streamEvents` の `requestContent` を検証）の両方でカバー。absent 時にタグが含まれないことも対称的にテスト済み。
- **全体的な設計**: データフロー全層（CLI → ResumeOptions → PrepareResult → PipelineDeps → executor → AgentRunContext → adapter）が設計通りに実装され、one-shot 消費も正確。

---

## Verdict

- **verdict**: approved
