# Code Review Feedback: verbose-execution-log — iter 1

- **verdict**: needs-fix
- **reviewer**: code-reviewer
- **date**: 2026-05-19

---

## Summary

実装品質は高い。core logger の設計（`fd` の先取り取得、全 exit path での `closeVerboseLog()`、`maskSensitive` 適用）は仕様通りで、想定外の改善（logFd null 化を closeSync 前に行う競合対策）も含む。build / typecheck / 既存 2236 tests もすべて green。

**差し戻し理由**: 受け入れ基準に明示された unit test が複数欠落している。

---

## Findings

### [medium] F-01: エラーハンドリング unit test 未実装 (TC-05-01, TC-05-02 — Priority: must)

`request.md` 受け入れ基準に「unit test」と明記され、`test-cases.md` で Priority: must のエラーハンドリングテストが未実装。

**TC-05-01** — `initVerboseLog` でディレクトリ作成失敗時:
- stderr に警告が出力される
- `logFd` が null のまま
- 例外が伝播しない

**TC-05-02** — `logVerbose` で書き込み失敗時:
- 例外が発生しない
- `logFd` が null になる
- 以降の `logVerbose` が no-op になる

これらは `setVerbose(true)` + 書き込み不可な fd を手動で作って `logVerbose` を呼ぶだけで書ける純粋な unit test。

---

### [medium] F-02: 計装ポイントの unit test 未実装 (TC-09-02, TC-10-01 〜 TC-10-03 — Priority: must)

`request.md` 受け入れ基準:
> "log ファイルに event type 文字列が含まれる (= unit test)"
> "ポーリング回数 / 間隔 / セッション status がログに記録される (= unit test)"

`test-cases.md` で Priority: must の以下テストが存在しない:

| TC | 対象 | 期待内容 |
|----|------|---------|
| TC-10-01 | `StepExecutor.execute()` | ログに `"step started"` + `step` フィールド |
| TC-10-02 | `StepExecutor.execute()` 正常終了 | ログに `"step completed"` |
| TC-10-03 | `StepExecutor.execute()` エラー | ログに `"step error"` + `error` フィールド |
| TC-09-02 | `ClaudeCodeRunner.run()` | ログに `"query started"` + `runtime: "local"` |

実装の `logVerbose` 呼び出し自体は正しく存在しているが、「ログファイルに書き出されている」を検証するテストがない。モック runner を使った shallow な `StepExecutor` テスト、または `ClaudeCodeRunner` に mock `queryFn` を渡すことで単体で書ける。

実装注記 (`implementation-notes.md`) に「T-09-e は out of scope」と記載されているが、TC-05-01/05-02 および TC-10-01〜10-03 はより基本的な unit test であり同じ理由では免除できない。

---

### [low] F-03: SSE/poll/managed session 計装テスト未実装 (TC-07-01, TC-07-02, TC-08-01, TC-09-01 — Priority: must)

| TC | 対象 | 期待内容 |
|----|------|---------|
| TC-07-01 | SSE `status_idle` イベント | ログに `"status_idle"` エントリ |
| TC-07-02 | SSE `session_error` イベント | `errorType` フィールド付きエントリ |
| TC-08-01 | `pollUntilComplete` ポーリング | `"poll attempt"` + `intervalMs` / `sessionStatus` |
| TC-09-01 | managed session 作成 | `"session created"` + `runtime: "managed"` |

これらは managed adapter を直接テストするか、`runSseStream` / `pollUntilComplete` に mock client を渡して `logVerbose` の出力をファイルで検証する形で書ける。

---

### [low] F-04: 初回 SSE 接続失敗時のログ未記録

**ファイル**: `src/adapter/managed-agent/sse-stream.ts` 72-79 行目

`streamEvents()` が初回接続で throw した場合、`logVerbose` が呼ばれずに return する。接続成功時は `"SSE stream connected"` が記録されるが、接続失敗時は無音。デバッグ上の一貫性を欠く。

```typescript
// 現状 (line 74-79)
} catch (err) {
  sseDisconnected = true;
  stderrWrite("SSE disconnected; falling back to polling.");
  // ← logVerbose が抜けている
  deps.onSseDisconnected?.();
  return { ... };
}
```

fix:
```typescript
} catch (err) {
  sseDisconnected = true;
  logVerbose("sse", "SSE stream connect failed", { sessionId, error: (err as Error).message });
  stderrWrite("SSE disconnected; falling back to polling.");
  deps.onSseDisconnected?.();
  return { ... };
}
```

---

### [low] F-05: managed agent resume fallback の session 作成がログ未記録

**ファイル**: `src/adapter/managed-agent/agent-runner.ts` 383-399 行目

resume 失敗時のフォールバックで新規 session を作成するパスに `logVerbose("session", "session created", ...)` が抜けている。normal パス (line 423) と runDesignStyle (line 148) は記録されているが、resume fallback は無音。

---

## 実装の良い点（参考）

- `logVerbose` が `fd = logFd` を try ブロック前に取得して競合を回避 → spec より堅牢
- `closeVerboseLog` が `logFd = null` → `closeSync(fd)` の順（double-close 防止）
- CommandRunner の全 4 exit path (setupWorkspace 失敗 / buildDeps 失敗 / pipeline throw / 正常終了) で `closeVerboseLog()` が漏れなく呼ばれている
- ADR が 4 判断を網羅し理由も明快

---

## 修正指示

**必須 (needs-fix の根拠)**:
1. F-01: `tests/unit/logger/verbose-log.test.ts` に TC-05-01, TC-05-02 のテストを追加する
2. F-02: `StepExecutor` と `ClaudeCodeRunner` の計装を検証する unit test を追加する (TC-10-01〜TC-10-03, TC-09-02)

**推奨 (同 iter で対応)**:
3. F-03: SSE / poll / managed session 計装テストを追加する (TC-07-01, TC-07-02, TC-08-01, TC-09-01)
4. F-04: `sse-stream.ts` 初回接続失敗 catch ブロックに `logVerbose` を追加する
5. F-05: managed agent resume fallback session 作成に `logVerbose` を追加する
