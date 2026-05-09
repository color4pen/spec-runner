# Code Review: session-state-handling — Iteration 1

## Summary

SSE ストリームとポーリングのセッション状態ハンドリングを網羅する変更。実装は仕様に忠実で、全 10 要件をカバーしている。TerminationReason 型拡張、SDK ナローイング関数、ポーリングの rescheduling 上限、stop_reason 区別（events.list 経由）の設計判断はいずれも妥当。新規テスト 20 件追加、typecheck green、vitest 1360 tests green。

- **verdict**: approved

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 9 | 0.25 | 2.25 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.05** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | src/adapter/managed-agent/agent-runner.ts:159-162 | SSE 経由で requires_action / retries_exhausted / session_error / session_deleted が発生した場合、汎用の `sessionTerminatedError()` (SESSION_TERMINATED) が throw される。ポーリング経由では専用エラーコード（SESSION_REQUIRES_ACTION 等）が使われるため、同一根本原因でも経路によってエラーコードが異なる | `sseResult.terminationReason` に応じて T6 で追加した専用ファクトリ関数を使い分ける。T9 で Optional と記載済みのため今回は許容 |
| 2 | MEDIUM | testing | tests/completion.test.ts | TC-SS-01〜TC-SS-07（must）は runSseStream の統合動作として定義されているが、テストはナローイング関数の単体テストのみ。SSE ループ内の条件分岐（terminated=true の設定、break 動作）は直接テストされていない | proposal.md で「SSE 統合テストは scope 外」と deferred 済み。次の変更で runSseStream のモック統合テストを追加する |
| 3 | MEDIUM | maintainability | tests/completion.test.ts | TC-POLL-05 / TC-POLL-06 で `rejects.toThrow` の後に try/catch で 2 つ目の mockClient を作成して error.code を検証している。1 回の呼び出しで `.rejects.toMatchObject({ code: "SESSION_REQUIRES_ACTION" })` を使えば重複を排除できる | `rejects.toMatchObject` または `rejects.toThrow` + `expect(err).toHaveProperty("code", ...)` パターンに統一する |
| 4 | LOW | maintainability | src/core/port/session-client.ts:79 | terminationReason のリテラル union が 9 値に増加。sse-stream.ts の TerminationReason 型と手動同期が必要で、値追加時の同期漏れリスクがある | proposal.md で意図的分離と記載済み（core は adapter に依存不可）。tasks.md の実装ノートにも注意事項あり。現状維持で可 |

## Verification

| Check | Result |
|-------|--------|
| `bun run typecheck` | ✅ green (exit 0) |
| `vitest run` | ✅ 1360 passed (136 files) |
| `bun test tests/completion.test.ts` | ✅ 27 passed, 0 fail |
| `isProposeComplete` 残存参照 | ✅ なし（src/ 内に 0 件） |
| Pre-existing test failures | ⚠️ main にも 146 fail あり（本変更起因ではない） |

## Test Coverage (test-cases.md)

### Must scenarios

| TC | Status | Notes |
|----|--------|-------|
| TC-SS-01〜TC-SS-07 | ⚠️ 間接 | ナローイング関数で間接カバー（統合テストは deferred） |
| TC-SS-08, TC-SS-09 | ✅ | 既存テストでリグレッション確認済み |
| TC-POLL-01〜TC-POLL-06, TC-POLL-10 | ✅ | 直接テストあり |
| TC-NARROW-01〜TC-NARROW-07 | ✅ | 直接テストあり |
| TC-TYPE-01〜TC-TYPE-05 | ✅ | typecheck green で確認 |
| TC-ERR-01〜TC-ERR-04 | ✅ | 直接テストあり |
| TC-RENAME-01〜TC-RENAME-03 | ✅ | 直接テスト + grep 確認 |
| TC-BUILD-01〜TC-BUILD-03 | ✅ | typecheck + vitest green |

### Should scenarios

| TC | Status | Notes |
|----|--------|-------|
| TC-SS-10 | ⚠️ 間接 | SSE ループ内の未知 stop_reason 分岐は直接テストなし |
| TC-POLL-07〜TC-POLL-09 | ⚠️ 未実装 | unknown stop_reason / events.list 失敗 / idle イベント不在 |
| TC-NARROW-02, TC-NARROW-08 | ✅ | 直接テストあり |

## Acceptance Criteria

- [x] AC1: SSE が新しい状態を適切にハンドリングする
- [x] AC2: ポーリングが rescheduling を認識し、上限超過でエラーを throw
- [x] AC3: ポーリングが idle の stop_reason を区別し、end_turn 以外をエラーとして扱う
- [x] AC4: TerminationReason 型が新しい状態を表現できる
- [x] AC5: `bun run typecheck && bun run test` が green
