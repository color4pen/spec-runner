# Cross-Boundary Invariants Review — report-settles-step (Iteration 2)

**Reviewer**: cross-boundary-invariants  
**Purpose**: 変更していないコードの暗黙の前提を新しい挙動が黙って破っていないかを検出する。

---

## Iteration 1 → 2 変更差分

code-fixer が `src/adapter/claude-code/agent-runner.ts` に対し以下を実施した（operator 裁定 F1〜F4 対応）:

- **F1 (HIGH)**: `runMainWorkTurn` の resume-fallback 分岐（line 843–845）に `extractedSessionId = undefined;` を追加。新セッションの init message から early-capture できるよう T-02 guard をリセット。
- **F3 (LOW)**: D5 return object に `touchedFiles: extractTouchedFilesFromMessages(touchedFileMessages, cwd)` を追加（line 1230）。
- **F4 (LOW)**: D5 path で `sessionLogWriter?.writeSummary(...)` を `close()` 前に呼び出し（lines 1218–1219）。

---

## Findings

### Finding 1 — MEDIUM: D5 outer catch が follow-up フェーズ中の abort でも stale な `followUpAttempts: 0` / `addedTurns: ZERO` を返す（iteration 1 F2 未修正）

**ファイル**: `src/adapter/claude-code/agent-runner.ts`  
**行**: 1003–1006（カウンタ宣言）/ 1224, 1226（D5 return 固定値）

**不変条件の定義**:  
`AgentRunResult` の invariant コメント: `"reportRetry + outputRepair === followUpAttempts"`。さらに暗黙の前提として `followUpAttempts` は実際に消費した follow-up ターン数を表す。

**修正指示（operator 裁定 F2）との乖離**:  
> F2 (MEDIUM): followUpAttempts / reportRetry / postWork / outputRepair のカウンタ宣言を outer catch から参照できるスコープ(run() スコープ)へ移し、D5 経路の return で ADDED_TURNS_ZERO / followUpAttempts: 0 の固定値でなく実際のカウンタ値を返す。

コードを確認した結果、`followUpAttempts`（line 1003）・`reportRetry`（1004）・`postWork`（1005）・`outputRepair`（1006）は依然として `try` ブロック内（line 914 以降）で宣言されており、outer `catch`（line 1210）には届かない。D5 path（lines 1224, 1226）は依然として固定値 `followUpAttempts: 0` / `addedTurns: ADDED_TURNS_ZERO` を返す。

**破れ方**:

1. main work turn で report を受領（`capturedToolResult` 非 null）→ grace-exit で happy path に合流
2. follow-up フェーズ（postWork / outputRepair）でいくつかのターンを消費（`postWork++` / `outputRepair++` / `followUpAttempts++` が実行済み）
3. follow-up 中に hard abort（watchdog / step-timeout / SIGTERM）が発火 → `abortController.signal.throwIfAborted()` で throw → outer catch へ伝播
4. D5 branch（`capturedToolResult !== null`）が成立 → `followUpAttempts: 0`, `addedTurns: ADDED_TURNS_ZERO` を返す
5. 実際に消費したターン数が telemetry / state に記録されない

対照: `transientRetryAttempts` は run() スコープ（line 790）で宣言されており D5 が正しく参照できる。follow-up カウンタ群だけが未移動。

**数値 invariant の扱い**: `reportRetry + outputRepair === followUpAttempts` は D5 path でも成立（0+0=0）するため機械的 invariant は破れないが、意味論的に「実際に消費したターン数を表す」という暗黙の前提は破れる。

**Resolution**: fixable — 4 カウンタを `try` ブロックの前（`transientRetryAttempts` 付近）に移動し、D5 return で実際の値を使う。

---

### Finding 2 — LOW: F1 code 修正に対応するテスト（resume-fallback 後 grace-exit → postWork が第 2 session を resume）が未追加

**ファイル**: `src/adapter/claude-code/__tests__/agent-runner-report-settles.test.ts`  
**行**: ファイル全体（TC-001〜TC-007、resume-fallback テストなし）

**不変条件の定義**:  
postWork prompts が `resume: sessionId` で実行するとき、その `sessionId` は「work が完了したセッション」の id でなければならない。resume-fallback（新セッション）で grace-exit した場合は、第 2 セッションの id を使わなければならない。

**修正指示（operator 裁定 F1）との乖離**:  
> テスト追加: resume-fallback 後に grace-exit した場合、postWork が第 2 session の id で resume されることを固定する。

コードレベルの修正（`extractedSessionId = undefined;` line 845）は実施済み。しかし対応するテストが追加されていない。TC-001〜TC-007 のいずれも `ctx.session.resumeSessionId` を設定しない（resume-fallback シナリオを含まない）。

**影響**:  
code 修正の正しさはレビュー時の静的読み取りで確認できるが、将来の変更で `extractedSessionId` の reset が削除・条件変更されても、テストが存在しないため regression を検出できない。

**Resolution**: fixable — `resumeSessionId` を設定した ctx で第 1 runQuery が throw → fallback → 新セッションで init message + report + hang → grace 前進 → postWork の `resume` が第 2 セッション id と一致することを固定するテストを追加する。

---

## 解消確認（iteration 1 → 2）

| Finding | 前周 | 今周 |
|---------|------|------|
| F1 (HIGH) T-02 early-capture が resume-fallback で古い session_id を固定 | 未修正 | **修正済み** — line 845: `extractedSessionId = undefined;` |
| F2 (MEDIUM) D5 outer catch で follow-up カウンタが stale な 0 | 未修正 | **未修正** — 本 finding として継続 |
| F3 (LOW) D5 path が touchedFiles を省略 | 未修正 | **修正済み** — line 1230: `touchedFiles: extractTouchedFilesFromMessages(...)` |
| F4 (LOW) D5 path が writeSummary を省略 | 未修正 | **修正済み** — lines 1218–1219: `writeSummary` 追加 |

---

## Evidence

- `agent-runner.ts` lines 1003–1006 でカウンタ宣言位置を直接確認（`try` ブロック内）
- `agent-runner.ts` lines 1224, 1226 で D5 return の固定値を確認（`followUpAttempts: 0`, `ADDED_TURNS_ZERO`）
- `agent-runner.ts` line 790 で `transientRetryAttempts` が run() スコープに宣言されることを確認（対照）
- `agent-runner.ts` line 845 で F1 code 修正（`extractedSessionId = undefined;`）を確認
- `agent-runner.ts` lines 1218–1219 で F4 修正（`writeSummary` 呼び出し）を確認
- `agent-runner.ts` line 1230 で F3 修正（`touchedFiles` 追加）を確認
- `agent-runner-report-settles.test.ts` 全 describe ブロック（TC-001〜TC-007）を確認 — resume-fallback テストなし
- `runFollowUpQueryWithRetry` line 876 の `abortController.signal.throwIfAborted()` があるため、follow-up 中の hard abort が outer catch に到達するルートが存在することを確認
