# Code Review: fix-create-dialog-repl-timing (iteration 1)

## Summary

generator 方式から while ループ + 毎ターン `query()` 呼び出しへの切り替えは正しく実装されている。LLM 応答と readline 入力の直列化が構造的に保証され、根本原因が解消されている。dead code (`queryInteractive`, `SdkQueryFn`, `createPromptGenerator`) の削除も漏れなく完了。session_id の明示追跡、`resume` / `continue` の排他制約遵守、systemPrompt の初回限定も仕様通り。typecheck green、全 1278 テスト green。

## Verification

- `bun run typecheck`: ✅ green
- `bun run test`: ✅ 129 files, 1278 tests passed

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | maintainability | src/core/command/create-dialog.ts:248,545 | `slugProposalTurnCount` が processAssistantTurn 内（local copy、line 248）と外側ループ（line 545）で二重インクリメントされている。内側の increment は比較に使われるが return されず、外側は slug 確定後も無条件にカウントする。現状の MAX=3 では正しく動作するが、dual-increment パターンは変更時に off-by-one を誘発しやすい | processAssistantTurn の戻り値に `slugProposalTurnCount` を含めて外側で代入する方式に統一するか、内側の increment を除去して比較を `slugProposalTurnCount + 1 >= MAX` に書き換える |
| 2 | LOW | maintainability | src/core/runtime/local.ts:87 | JSDoc "Shared by query() and queryInteractive()" が stale。`queryInteractive()` は本 PR で削除済み | "Used by query()" に修正する |
| 3 | LOW | maintainability | src/core/command/create-dialog.ts:317 | `isResultMessage` の型ガードが `session_id` を含まないため `(msg as Record<string, unknown>)["session_id"]` キャストが必要。型安全性が低い | `isResultMessage` の戻り型に `session_id?: string` を追加する（message-types.ts 側の改修。本 PR scope 外でも可） |

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 9 | 仕様通りの実装。直列化が構造的に保証されている。slug counting の dual-increment は正しく動作する |
| security | 9 | セキュリティ変更なし。terminal REPL のみ |
| architecture | 9 | processAssistantTurn の抽出、dead code 削除、session_id 明示管理。phase 構造維持 |
| performance | 9 | 変更なし |
| maintainability | 7 | dual-increment パターンと stale JSDoc。全体的には可読性向上 |
| testing | 8 | TC-CD-011〜014 で主要パスをカバー。collision feedback path のテストは未追加だが pure function テストで補完 |

**Total**: 9×0.30 + 9×0.25 + 9×0.15 + 9×0.10 + 7×0.10 + 8×0.10 = 2.70 + 2.25 + 1.35 + 0.90 + 0.70 + 0.80 = **8.70**

## Verdict

- **verdict**: approved
