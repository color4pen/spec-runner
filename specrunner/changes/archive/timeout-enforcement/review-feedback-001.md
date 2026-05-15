# Code Review: timeout-enforcement — Iteration 1

- **verdict**: needs-fix
- **reviewer**: code-reviewer
- **date**: 2026-05-15

---

## Summary

実装の方向性・設計判断はすべて正しい。`helpers.ts` の startedAt/endedAt バグ修正、`executor.ts` のタイムスタンプ取得位置変更、`agent-runner.ts` の poll timeout と step timeout の分離、ADR 更新、いずれも設計通りに実装されている。`bun run typecheck && bun run test` (1857 tests) は green。

needs-fix の主因は **test-cases.md の must 優先シナリオが executor レベルでカバーされていない** 点。helpers.ts の単体テストはあるが、executor が `pushStepResult` に正しいタイムスタンプを渡しているかを検証するテストがない。

---

## Findings

### Finding #1: TC-05/TC-06 — executor タイムスタンプの単体テストなし [MEDIUM]

**対象**: `src/core/step/executor.ts`, `tests/`

test-cases.md では以下が `must` 優先として定義されている:

- TC-05: `runAgentStep` が `runner.run()` の **前** に `startedAt` を取得し、**後** に `completedAt` を取得する
- TC-06: `runCliStep` が `step.run()` の前後でタイムスタンプを取得する

`tests/state/helpers.test.ts` は `pushStepResult()` への入力→出力を検証するが、executor が正しいタイムスタンプを `finalizeStep()` に渡しているかは検証していない。本 change の core バグ修正（D1）の検証が helpers レベルで止まっており、executor レベルの回帰テストがない。

TC-07/TC-08/TC-09（エラーパス・タイムアウトパスの startedAt 記録）も同様に未カバー。

**必要な修正**: executor の `runAgentStep` / `runCliStep` に対するユニットテストを追加し、`StepRun.startedAt < StepRun.endedAt` が成立することを検証する。最小ケース: 成功パスの TC-05/TC-06 のみでも可。

---

### Finding #2: TC-15/TC-16/TC-17 — SSE polling fallback パスのタイムアウトが未テスト [LOW]

**対象**: `src/adapter/managed-agent/agent-runner.ts` L190-206 (`runDesignStyle` の needsPollingFallback ブランチ)

polling-style パスは TC-036/037/038/040（既存テスト）でカバーされているが、`runDesignStyle` の SSE 切断後 polling fallback ブランチに入る `effectiveTimeoutMs` ロジックのテストがない。test-cases.md で TC-15/TC-16/TC-17 が `must` として定義されているが、設計スタイルの step で `terminationReason !== "end_turn"` になるシナリオをテストするモックが追加されていない。

コードパスは polling-style と同一の `effectiveTimeoutMs` パターンであり、バグリスクは低い。ただし TC-38 等で polling-style の等価動作が検証済みであるため、SSE fallback を含む完全カバレッジは technically nice-to-have に近い。

**推奨**: `runDesignStyle` の polling fallback ブランチに入る mock テスト（`terminationReason: "disconnected"` など）を追加し、TC-15/TC-16 を検証する。TC-17（timeoutMs: 0 → DEFAULT_POLL_TIMEOUT_MS fallback）も合わせてカバーすることを推奨。

---

### Finding #3: `store.ts` の JSDoc が ADR-0013 supersede 後も旧方針を参照 [LOW]

**対象**: `src/config/store.ts` L89-90

```typescript
/**
 * Save config to disk using atomic write. Enforces 0600 permissions.
 * Writes only new canonical schema — legacy fields are stripped.
 * Design D3: silently ignore legacy timeout keys; do NOT write them back.  ← ここ
 */
```

T-05a で `specReview`/`specFixer` の timeoutMs stripping を削除したが、JSDoc の "Design D3: silently ignore legacy timeout keys" というコメントが残っている。ADR-0013 は superseded であり、"silently ignore" 方針はもう存在しない。現在この関数が実際に strip しているのは `agent`（レガシー singular agent フィールド）と `timeout`（旧トップレベルキー）のみ。

**修正**: JSDoc を実態に合わせて更新する。例:

```typescript
/**
 * Save config to disk using atomic write. Enforces 0600 permissions.
 * Writes only new canonical schema — legacy fields are stripped.
 * Removes: agent (legacy singular agent field), timeout (removed in ADR-0013).
 */
```

---

### Finding #4: `runPollingStyle` の `completedAt` が未使用（dead code）[LOW]

**対象**: `src/adapter/managed-agent/agent-runner.ts` L454, L510

```typescript
const pollResult = await this.sessionClient.pollUntilComplete(sessionId!, { timeoutMs: effectiveTimeoutMs });
const completedAt = new Date().toISOString();   // ← 取得されるが使われない
// ...
void completedAt; // used in error path above   ← コメントが不正確
```

`completedAt` は取得されるが、どのエラーパスにも渡されていない。"used in error path above" というコメントも不正確。`ManagedAgentRunner` は `AgentRunResult` を返すだけであり、タイムスタンプは executor が管理するため `runPollingStyle` 内でのタイムスタンプ取得は不要。pre-existing dead code だが本 change でそのまま残された。

**推奨**: `const completedAt` 行と `void completedAt` 行を削除する。誤解を招くコメントも合わせて除去する。ただしこれは nice-to-have であり、blocking ではない。

---

## 受け入れ基準チェック

| 基準 | 結果 |
|------|------|
| StepRun.startedAt が step 実行開始時に記録される | ✅ コード上正しい。helpers.ts テストでカバー。executor レベルのテスト未整備 |
| StepRun.endedAt が step 完了時に記録される | ✅ 同上 |
| config.steps.implementer.timeoutMs 設定時にタイムアウト | ✅ TC-036/037 が設定値の受け渡しを検証。状態遷移テスト (TC-21/22) は未カバー |
| config に timeoutMs 未設定時は無制限 | ✅ TC-038/040 でカバー |
| bun run typecheck が green | ✅ |
| bun run test が green | ✅ (1857 tests passed) |

---

## 必須修正（merge 前）

1. **TC-05 / TC-06**: `runAgentStep` と `runCliStep` の executor タイムスタンプを検証するユニットテストを追加する（`startedAt` が `endedAt` より前であることを確認）
2. **Finding #3**: `store.ts` の JSDoc を現在の実装に合わせて修正する

## 推奨修正（nice-to-have）

3. **TC-15/TC-16/TC-17**: SSE polling fallback パスのタイムアウトテストを追加する
4. **Finding #4**: `runPollingStyle` の未使用 `completedAt` と誤コメントを削除する
