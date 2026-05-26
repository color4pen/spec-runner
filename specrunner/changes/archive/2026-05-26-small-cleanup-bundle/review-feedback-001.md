# Code Review — small-cleanup-bundle — iter 1

- **verdict**: approved

## Summary

2 件の修正（module-boundary spec の grep pattern 更新 + gitignore Exception dedup）はいずれも正しく実装されている。受け入れ基準を満たし、verification は全フェーズ green。MEDIUM 2 件（must test カバレッジ漏れ）と LOW 2 件（スコープ外変更）を記録するが、ブロッカーなし。

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | testing | tests/unit/util/gitignore.test.ts | TC-GI-13（must）が未実装。TC-GI-12 は `exceptionLines.length === 1` のみ検証し、先頭出現が保持されているか（= 残行が `node_modules/` より前にあるか）を確認していない。実装は正しく first-occurrence を保持するが、テストはそれを保証していない | TC-GI-13 のシナリオを追加: 入力 `.specrunner/*\n!.specrunner/config.json\ndist/\n!.specrunner/config.json\n`、期待 exceptionIdx < distIdx | no |
| 2 | MEDIUM | testing | tests/unit/util/gitignore.test.ts | TC-GI-16（must）が未実装。Exception dedup 後に 2 回目の呼び出しで内容が変わらないことを確認するシナリオがない。TC-GI-08 は初期状態からの idempotency をテストするが、dedup 後の idempotency は未カバー | TC-GI-16 のシナリオを追加: 重複 exception 行を含む入力 → 1 回目実行後の内容を保存 → 2 回目実行後が同一であること | no |
| 3 | LOW | maintainability | src/prompts/fragments.ts:80 | スコープ外変更: 承認閾値の説明に `≥ 7.0` を追記。機能影響なし・品質改善だが本 request の変更範囲外 | 許容可。別 PR または chore として管理することが望ましい | no |
| 4 | LOW | maintainability | tests/pipeline-integration.test.ts:2119 | スコープ外変更: `!t.when` フィルター追加。フォールバック遷移を正しく特定するための修正で意図は正しいが、本 request の変更範囲外 | 許容可。コメントで意図が明記されており問題なし | no |

## Acceptance Criteria Check

| 受け入れ基準 | 状態 |
|------------|------|
| module-boundary spec の grep pattern が `@anthropic-ai/(sdk|claude-agent-sdk)` に更新されている | ✅ |
| 旧 `claude-code` パターンが削除されている | ✅ |
| `ensureDotSpecrunnerGitignore()` が `!.specrunner/config.json` の重複を dedup する | ✅ |
| Exception 行 dedup の regression test が追加されている | ✅ TC-GI-12 追加済み |
| `bun run typecheck && bun run test` が green | ✅ verification-result.md で確認 |

## Must TC Coverage

| TC | Priority | Status |
|----|----------|--------|
| TC-MB-01 | must | ✅ spec.md L42 で確認 |
| TC-MB-02 | must | ✅ spec.md L42 `claude-code` 削除確認 |
| TC-MB-03 | must | ✅ spec.md L39 prose 更新確認 |
| TC-GI-12 | must | ✅ gitignore.test.ts に追加済み |
| TC-GI-13 | must | ❌ 未実装（finding #1） |
| TC-GI-16 | must | ❌ 未実装（finding #2） |
| TC-QG-01 | must | ✅ typecheck passed |
| TC-QG-02 | must | ✅ 2965 tests passed |

## Rationale

MEDIUM 2 件はいずれも「実装は正しいが test で保証されていない」ケース。本 PR の機能的な正しさに影響しないため `Fix: no` とした。次のメンテナンス機会に追加することを推奨する。
