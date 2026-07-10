# Regression Gate Result — iteration 001

- **verdict**: approved
- **iteration**: 001

## Ledger Verification

### Finding 1 — [LOW] follow-up retry コメントが実装と矛盾

- **File**: `src/adapter/claude-code/agent-runner.ts`, lines 709–710
- **Status**: NOT FIXED (intentional — Fix=no in code-review)

コード確認: ブランチ現在の該当箇所：

```typescript
// Remove MCP server from retry options to avoid re-registering
// (the closure is still active so tool calls will be captured)
await runFollowUpQueryWithRetry(retryPrompt, retryOptions);
```

`main` ブランチのコードと変わらず、`delete retryOptions["mcpServers"]` は存在しない。コメントが実装（mcpServers を残す正しい挙動）と矛盾したままである。

ただし、`review-feedback-001.md` において本 finding は **Fix: no** と記録されており、code-fixer への修正指示はなかった。意図的な未修正であり、レビュー承認済み。

### Finding 2 — [LOW] scenario 3 の canUseTool=not-consulted がハードコード

- **File**: `scripts/probes/write-scope-guard-probe.ts`, line 253
- **Status**: NOT FIXED (intentional — Fix=no in code-review)

コード確認: scenario 3 の出力行：

```typescript
`[PROBE] scenario=report_result canUseTool=not-consulted handler_invoked=${handlerInvoked} verdict=${pass ? "PASS" : "FAIL"}`,
```

`canUseTool=not-consulted` は依然としてハードコードされた文字列。`makeTrackedGuard` は Write/Edit のみ `record.fired` を更新するため、MCP ツール呼び出し時に canUseTool が実際に呼ばれなかったかどうかは計測していない。

ただし、`review-feedback-001.md` において本 finding は **Fix: no** と記録されており、PASS 判定が `handlerInvoked=true` のみに依存することは「証拠として許容範囲内」と評価済み。意図的な未修正であり、レビュー承認済み。

## 総合判断

両 finding はコードレビューで **Fix: no**（修正不要）と明示されており、code-fixer による修正は行われなかった。これは退行（regression）ではなく、承認された既知許容事項である。HIGH/CRITICAL 以上の finding はなく、機能実装（permissionMode "default"・Edit/Write allowedTools 除外・canUseTool workspace guard・MCP tool pre-approve・allowUnsandboxedCommands: false）に関するコアな正確性問題はない。

退行なし。承認継続。
