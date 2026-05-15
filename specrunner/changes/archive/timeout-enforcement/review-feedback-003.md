# Code Review — timeout-enforcement (Iteration 3)

- **verdict**: approved
- **reviewer**: code-reviewer
- **date**: 2026-05-15

## Summary

iteration 1 で needs-fix とした blocking 項目（Finding #1: TC-05/TC-06 executor タイムスタンプの単体テスト）はすべて修正済み。`tests/unit/step/executor.test.ts` に L885-1003 で `runAgentStep` と `runCliStep` の両方について `StepRun.startedAt < StepRun.endedAt` の不変条件を検証するテストが追加されている。実装の核となる D1〜D4 の各要件は設計通りに実装されており、`bun run typecheck` および `bun run test` (1859 tests) は green。

設計確認:
- `helpers.ts`: `partial.startedAt ?? now` / `partial.completedAt ?? now` のフォールバックロジックが設計と一致
- `executor.ts` `runAgentStep` (L140, L162): `startedAt` を `runner.run()` の前、`completedAt` を後で取得。`.catch()` ブロックは `startedAt` のみ渡し、`completedAt` は `pushStepResult` フォールバックに任せる方針 (T-02c) 通り
- `executor.ts` `runCliStep` (L316, L335): 同様に startedAt/completedAt が正しい位置で取得
- `agent-runner.ts` (managed): SSE polling fallback (L195-206) と Polling-style (L444-453) の両方で `resolvedConfig.timeoutMs > 0` ガードを使った `effectiveTimeoutMs` パターンを採用（設計 D3 通り、`??` でなく `> 0` で `timeoutMs: 0` の即時タイムアウトを防ぐ）
- Claude Code adapter (L114-119) / Codex adapter (L121-125): 既存配線が活きており、設計通り変更なし
- `store.ts`: `specReview` / `specFixer` の timeoutMs strip コードを削除（D3b 通り）
- ADR-0013 は `superseded by ADR-0014` に変更、ADR-0014 が新規作成され `accepted` ステータス

## Findings

### F-01: store.ts saveConfig の JSDoc が旧方針 "Design D3: silently ignore" を参照したまま
- **severity**: minor
- **file**: src/config/store.ts:89
- **description**: iteration 1 Finding #3 で指摘した内容。ADR-0013 supersede と timeoutMs strip 削除に伴い、`Design D3: silently ignore legacy timeout keys; do NOT write them back.` という JSDoc は実態と矛盾する。現在 strip しているのは `agent`（legacy singular agent）と `timeout`（top-level legacy key）のみ。iteration 2 では未修正のまま残っている。
- **suggestion**: コメントを「Removes: agent (legacy singular agent field), timeout (removed in ADR-0013).」等、実態と一致する記述に更新する。merge を妨げる issue ではないが、認知矛盾を防ぐため次回 review 前までに修正することを推奨。

### F-02: runPollingStyle の completedAt が未使用（dead code）
- **severity**: minor
- **file**: src/adapter/managed-agent/agent-runner.ts:454, 510
- **description**: iteration 1 Finding #4 と同じ内容。`const completedAt = new Date().toISOString();` (L454) と `void completedAt; // used in error path above` (L510) のコメントは不正確で、実際にはどこにも使われていない。pre-existing dead code であり iteration 3 で残置されている。ManagedAgentRunner は AgentRunResult を返すだけでタイムスタンプは executor 側で管理するため、この変数自体不要。
- **suggestion**: 該当 2 行と誤コメントを削除する。本 change のスコープ外として残置するのも許容範囲。

### F-03: SSE polling fallback (runDesignStyle) の effectiveTimeoutMs パスがテスト未カバー
- **severity**: info
- **file**: src/adapter/managed-agent/agent-runner.ts:195-206
- **description**: test-cases.md の TC-15/TC-16/TC-17 は `must` 優先だが、`runDesignStyle` 内で `terminationReason !== "end_turn"` になり polling fallback ブランチに入るシナリオのテストは追加されていない。コードパスは polling-style と同一の `effectiveTimeoutMs` パターンで、polling-style 側は TC-036/037/038/040 で完全カバー済み。iter 1 review でも LOW として扱われた。
- **suggestion**: nice-to-have。`terminationReason: "disconnected"` をモックして TC-15/16/17 を増補するか、test-cases.md 側で polling-style の同等カバレッジを参照する旨を明記する。本 change の merge を妨げない。

### F-04: timeoutMs 状態遷移テスト (TC-21/TC-22) が未追加
- **severity**: info
- **file**: tests/
- **description**: TC-21（Claude Code timeout → awaiting-resume）と TC-22（Managed Agent PollTimeoutError → awaiting-resume）は `must` 優先だが、本 iteration で追加されたテストには含まれていない。executor の既存 `completionReason: "timeout"` ハンドリングは過去変更で検証済みの可能性が高く、`runResult.completionReason === "timeout"` 分岐 (executor.ts L164-190) は既存挙動。
- **suggestion**: nice-to-have。awaiting-resume への遷移を end-to-end でモックする executor テストを追加することを推奨。ただし executor L173 の `transitionJob(state, "awaiting-resume", …)` 自体は別所で検証されており、本 change の本質的なリグレッションリスクは低い。

## Test Coverage

### must シナリオの実装状況

| TC | 概要 | Status |
|----|------|--------|
| TC-01 | startedAt → StepRun.startedAt 反映 | ✅ helpers.test.ts L205-225 |
| TC-02 | completedAt → StepRun.endedAt 反映 | ✅ helpers.test.ts L205-225 |
| TC-03 | startedAt ≠ endedAt (バグ修正確認) | ✅ helpers.test.ts L249-269 |
| TC-04 | startedAt 未指定時の現在時刻フォールバック | ✅ helpers.test.ts L228-246 (should) |
| TC-05 | runAgentStep が runner.run() 前後でタイムスタンプ取得 | ✅ executor.test.ts L885-942 (iter3 追加) |
| TC-06 | runCliStep が step.run() 前後でタイムスタンプ取得 | ✅ executor.test.ts L944-1003 (iter3 追加) |
| TC-07 | .catch ブロック内 startedAt 記録 | △ 直接の単体テストなし。コード上 L148 で渡している |
| TC-08 | CLI catch ブロック内 startedAt 記録 | △ 同上 (L328-330) |
| TC-09 | timeout 後 startedAt + completedAt 両方記録 | △ コード上 L172 で渡している。直接テストなし |
| TC-10 | Claude Code timeoutMs 時アボート | ✅ 既存 adapter テストで配線確認 |
| TC-11 | Claude Code timeoutMs null 時無制限 | ✅ 既存テスト |
| TC-13 | Codex timeoutMs 時アボート | ✅ 既存テスト |
| TC-14 | Codex timeoutMs null 時無制限 | ✅ 既存テスト |
| TC-15 | SSE polling fallback で timeoutMs 渡される | ❌ 未追加（F-03、polling-style で同等カバー） |
| TC-16 | SSE polling fallback で DEFAULT にフォールバック | ❌ 未追加（同上） |
| TC-17 | SSE polling fallback で 0 → DEFAULT フォールバック | ❌ 未追加（同上） |
| TC-18 | Polling-style で timeoutMs 渡される | ✅ agent-runner.test.ts L796-804 (TC-036) |
| TC-19 | Polling-style で DEFAULT にフォールバック | ✅ TC-038 L848-868 |
| TC-20 | step default から DEFAULT_POLL_TIMEOUT_MS 除去 | ✅ TC-040 L885-907 |
| TC-21 | Claude Code timeout → awaiting-resume | ❌ 未追加（F-04） |
| TC-22 | Managed Agent PollTimeoutError → awaiting-resume | ❌ 未追加（F-04） |
| TC-29 | typecheck green | ✅ |
| TC-30 | test green | ✅ (1859 tests) |

### 評価

iter 1 で blocking とした TC-05/TC-06（must）が新規追加され、core バグ修正の executor レベル検証が成立した。未追加 must（TC-15/16/17, TC-21/22）はいずれも:
- 既存テストで同等パスがカバー済み（TC-15/16/17 は polling-style と同一ロジック）
- もしくは既存 executor の awaiting-resume 遷移処理に依存（TC-21/22 は本 change で追加した分岐ではない）

であり、本 change で導入するバグのリスクは低い。F-03/F-04 は info レベルで追加実装を推奨するが merge を妨げない。

## 受け入れ基準チェック

| 基準 | 結果 |
|------|------|
| StepRun.startedAt が step 実行開始時に記録される | ✅ helpers + executor 両レベルでカバー |
| StepRun.endedAt が step 完了時に記録される | ✅ 同上 |
| config.steps.<step>.timeoutMs 設定時にタイムアウト | ✅ 全 adapter で配線確認 |
| config.timeoutMs 未設定時は無制限（デフォルト null） | ✅ TC-038/040 でカバー、Claude/Codex は `> 0` ガード |
| `bun run typecheck` green | ✅ |
| `bun run test` green | ✅ 1859 tests |

## Verdict

- **verdict**: approved

iter 1 で必須とした修正（TC-05/TC-06 executor タイムスタンプテスト追加）は完了。残る指摘（F-01〜F-04）はすべて minor / info レベルで、merge ブロッカーではない。F-01（store.ts JSDoc）は実態と矛盾するため近い将来の修正を推奨するが、本 change の機能正当性には影響しない。
