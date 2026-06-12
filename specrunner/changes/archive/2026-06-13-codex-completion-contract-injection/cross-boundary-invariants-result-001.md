# cross-boundary-invariants Review — codex-completion-contract-injection — iter 1

## Verdict

- **verdict**: approved

## New paths enumerated

### Path A: `fullPrompt` injection when `reportTool` is set

`fullPrompt` は `reportTool` が truthy のときのみ `buildMainTurnCompletionInstruction()` を末尾に追加する。`reportTool` が falsy の場合は `baseFullPrompt` がそのまま使われる（完全に同一経路）。

- `executeTurn` は `thread.runStreamed(prompt, opts)` を呼ぶだけであり、`prompt` の内容に対して何ら前提を置いていない。
- `postWorkPrompts` 各ターン、output-verification ターン、retry ターンはいずれも `fullPrompt` を参照しない（それぞれ独立したプロンプト文字列を受け取る）。追加された completion instruction がこれらのターンに混入する経路は存在しない。

### Path B: retry prompt の single-source 化

旧インライン文字列リテラル:
```
`前の応答から JSON を取得できませんでした。コードフェンスや説明文を付けず、スキーマに一致する JSON オブジェクトのみを返してください。` + ` (attempt N/M)`
```

新 `buildCompletionRetryPrompt(attempt, maxAttempts)`:
```
`前の応答から JSON を取得できませんでした。${COMPLETION_REPORT_MEANS} (attempt N/M)`
```

`COMPLETION_REPORT_MEANS` の末尾は `。` であり、テンプレートリテラル内の結合位置は ` (attempt` の直前。両者が生成する文字列は byte-for-byte 同一。retry 挙動に変化なし。

### Path C: `completionReportDiagnostics` チェーン（agent-runner → executor → state → journal）

`transientRetryAttempts` が辿った経路と完全に同型の optional-spread 伝播:

| ホップ | 実装 |
|--------|------|
| `AgentRunResult` | `completionReportDiagnostics?: CompletionReportDiagnostic[]` — optional |
| `finalizeStep agentResult param` | optional フィールド、`runResult.completionReportDiagnostics` をそのまま渡す |
| `pushStepResult partial` | `completionReportDiagnostics !== undefined ? { completionReportDiagnostics } : {}` |
| `StepOutcome` | optional フィールド |
| `stepRunToRecord` / `fold()` | 同一 optional-spread パターン |

ManagedAgentRunner / ClaudeCodeRunner は `completionReportDiagnostics` をセットしない。`runResult.completionReportDiagnostics` は `undefined` となり、`pushStepResult` の conditional spread でキーが omit される。既存レコードとの backward-compat は保たれる。

### Path D: `completionReportDiagnostics` の変数スコープと transient retry の関係

変数宣言は transient-retry ループ（`retryWithBackoff`）**完了後** の位置にある。transient retry はトランスポート層のエラー（API エラー）を対象とし、JSON 抽出失敗とは独立している。最終ターンの `finalResponse` に対して extraction を 1 回行い、その結果のみを `completionReportDiagnostics` に記録する設計は正しい。

### Path E: `postWorkPrompts` + `reportTool` 同時設定時の相互作用

`capturedToolResult`（`finalResponse` からの JSON 抽出結果）と `resultContent`（result ファイル読み取り結果）は独立した変数。`postWorkPrompts` ループは `turn` を上書きするが、`capturedToolResult` および `completionReportDiagnostics` は `postWorkPrompts` ループの**前に**確定しており、ループ内で変更されない。`mergeFollowUpResult` は `resultContent` のみを上書きし、`toolResult` / `completionReportDiagnostics` には触れない。不変条件を破る実行列は構成できない。

## 観察事項（non-blocking）

**RESULT_FILE_NOT_FOUND 早期 return での diagnostics 欠落**: `capturedToolResult` 回収失敗後にさらに result ファイルが存在しない場合、`completionReason: "error"` の早期 return には `completionReportDiagnostics` が含まれない。executor.ts の error ハンドリング（lines 373-389）は `finalizeStep` を通らないため、その場合でも journal には記録されない。

これはこの変更が導入した問題ではなく、設計が明示的にターゲットとするのは fail-closed 成功パス（`capturedToolResult` null → `completionReason "success"` → pipeline escalation）であり、硬エラー経路は対象外。needs-fix とする根拠にはならない。
