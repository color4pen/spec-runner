# Code Review Feedback — cli-output-channel-unification — iteration 1

## Summary

実装の大部分は正確で設計に忠実。ただし `src/cli/managed.ts` に直接 `process.stdout.write` 呼び出しが 1 箇所残存しており、受け入れ基準を直接違反している。

---

## Findings

### F1: `src/cli/managed.ts:210` — direct `process.stdout.write` が残存 (TC-27 違反)

- **severity**: must-fix
- **file**: `src/cli/managed.ts`
- **line**: 210

```typescript
process.stdout.write("No stale managed config. Nothing to reset.\n");
```

受け入れ基準「`src/` 配下のプロダクションコードに `process.stdout.write` の直接呼び出しが存在しない（`src/logger/stdout.ts` 内の最終出力点と `src/cli/progress.ts` 内の ProgressDisplay を除く）」を直接違反。

このメッセージは結果データではなく診断メッセージ（「何もする必要がない」という状態通知）なので `logInfo(...)` または `stderrWrite(...)` に変更すること。tasks.md Task 5 の `src/cli/managed.ts` 行の方針（「結果データ → `logResult`。stderr → `logError` / `stderrWrite`」）にも合致している。

**Fix**: `process.stdout.write("No stale managed config. Nothing to reset.\n")` → `stderrWrite("No stale managed config. Nothing to reset.")`

---

### F2: logInfo / logStep / logSuccess / logResult / stdoutWrite の単体テストが欠如 (TC-49 gap)

- **severity**: minor
- **file**: `tests/unit/logger/stdout-verbose.test.ts`（ないし新規テストファイル）

TC-49（priority: must）は「`logInfo` / `logStep` / `logSuccess` が `process.stderr.write` に出力されることをテストが検証している」ことを要求するが、`tests/unit/logger/` には `logWarn` のテストのみ存在し、以下のテストが存在しない:

- `logInfo` → stderr（TC-01）
- `logStep` → stderr（TC-02）
- `logSuccess` → stderr（TC-03）
- `stdoutWrite` が `maskSensitive` を適用する（TC-04 / TC-40）
- `logResult` → stdout + `\n` + `maskSensitive`（TC-05 / TC-06）

実装は正しい（コード検査で確認済み）が、リグレッション防止のためのテストが不在。

**Fix**: `tests/unit/logger/stdout.test.ts`（または既存ファイルへの追記）で上記 TC を網羅するテストを追加すること。

---

## Acceptance Criteria チェック

| 基準 | 状態 |
|------|------|
| `src/` に `process.stdout.write` の直接呼び出しなし（許可された例外を除く） | ❌ `managed.ts:210` が残存 |
| `stdoutWrite` が `maskSensitive` を適用している | ✅ |
| stdout に出力されるのはプログラムの結果のみ | ❌ `managed.ts:210` が diagnostic を stdout に書く |
| 進捗表示・warning・error は stderr に出力される | ✅ |
| `pipeline.ts` の直接 stdoutWrite が廃止され、EventBus 経由になっている | ✅ |
| 新 DomainEvent が `src/core/event/types.ts` に定義されている | ✅ |
| `progress.ts` の TTY 検出が `process.stderr.isTTY` を参照している | ✅ |
| 既存マスクパターンが全出力パスに適用されている | ✅ |
| `bun run typecheck && bun run test` が green | ✅（verification-result.md 確認済み） |

---

## 確認済み正常実装

- `logInfo` / `logStep` / `logSuccess` → `process.stderr.write` + `maskSensitive` ✅
- `stdoutWrite` → `process.stdout.write(maskSensitive(message))` ✅
- `logResult` → `process.stdout.write(maskSensitive(message) + "\n")` ✅
- `pipeline.ts` — `stdoutWrite` 呼び出しゼロ、全 5 種の新 DomainEvent を正しく emit ✅
- `progress.ts` — `process.stdout.write` ゼロ、`process.stderr.isTTY` / `process.stderr.columns` 使用 ✅
- TC-47 (progress.ts tests mock stderr) ✅
- TC-48 (pipeline.ts tests verify EventBus emit) ✅
- `src/` の他ファイルに `process.stdout.write` / `process.stderr.write` の直接呼び出しなし（`managed.ts:210` を除く）✅

---

- **verdict**: needs-fix
