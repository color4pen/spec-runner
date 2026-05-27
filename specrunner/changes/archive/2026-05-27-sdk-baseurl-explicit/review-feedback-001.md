# Code Review Feedback: sdk-baseurl-explicit — iter 1

- **verdict**: approved

## Summary

実装は正確で受け入れ基準をすべて満たしている。2 箇所の `new Anthropic({...})` に `baseURL: "https://api.anthropic.com"` が追加され、`ANTHROPIC_BASE_URL` env override が構造的に無効化されている。verification も全フェーズ green。

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | Test Coverage | — | `test-cases.md` の must 優先度テスト TC-01〜TC-04（`baseURL` 明示と `ANTHROPIC_BASE_URL` 無視の検証）が未実装。将来 `baseURL` が誤って削除されても回帰が検出されない。`design.md` が「既存テストの green 確認のみ」と明記し spec-review が approved しているため、今回スコープでは設計上許容された gap。 | TC-01〜TC-04 に対応する unit test を追加し、`ANTHROPIC_BASE_URL` env が設定された状態で両関数の `baseURL` が固定値であることを検証する | no |

## Acceptance Criteria Check

| 基準 | 結果 |
|------|------|
| `createAnthropicClient()` が `baseURL: "https://api.anthropic.com"` を明示する | ✅ `client.ts:11` |
| `createAnthropicClientAdapter()` も同様に `baseURL` を明示する | ✅ `anthropic-client.ts:72` |
| `bun run typecheck && bun run test` が green | ✅ 全フェーズ pass（verification-result.md 参照） |
