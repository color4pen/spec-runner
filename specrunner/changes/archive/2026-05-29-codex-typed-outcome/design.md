# Design: codex-typed-outcome

## Context

contract（R2 型 / R3 cutover）が main 済み。claude-code adapter は `report_result` MCP tool 経由で typed outcome を `toolResult` に載せている。codex adapter は frozen で `ctx.policy.reportTool` を無視し、`toolResult` を常に `null` で返す（`agent-runner.ts:11,180,275`）。

本 design は codex adapter を contract 準拠にするため、SDK の custom tool / structured output 機構を調査し、実装方針を決定する。

### SDK 調査結果（@openai/codex-sdk v0.130.0）

| 機構 | 有無 | 詳細 |
|------|------|------|
| In-process MCP tool registration API | **無** | Claude Code SDK の `createSdkMcpServer` に相当する API は存在しない。SDK は `codex exec --experimental-json` を spawn し JSONL で通信するラッパー |
| MCP server support（CLI 側） | **有** | Codex CLI は `codex mcp add` で外部 MCP server を登録でき、agent から tool として呼び出せる。`McpToolCallItem` 型が SDK に export 済み |
| `CodexOptions.config` 経由の MCP server 設定 | **要検証** | SDK の `config` option は `--config key=value` TOML ペアにフラット化される。`mcp_servers.*` キーが `codex exec` で有効かは未検証 |
| `TurnOptions.outputSchema` | **有** | structured JSON output。`thread.run(prompt, { outputSchema })` で JSON schema を渡し、`finalResponse` を JSON で取得可能。SDK README に documented |
| `turn.items` の `McpToolCallItem` | **有** | `{ type: "mcp_tool_call", server, tool, arguments, result?, error?, status }` — tool 名・引数・結果を取得可能 |

**結論**: SDK に in-process custom tool API は無い。2 つの実装経路が存在する:

1. **MCP server 経由（tool-based）**: 外部 MCP server process を spawn し `config.mcp_servers` で注入 → `turn.items` で検出
2. **outputSchema 経由（structured output）**: JSON schema を渡し `finalResponse` を parse

## Goals / Non-Goals

**Goals**:

- codex adapter の frozen behavior を解除し、typed outcome を `toolResult` に載せる
- claude-code / managed と同じ contract に準拠（`toolResult` populated、follow-up retry あり）
- tool-driven-step-completion spec の frozen behavior MUST 要件を delta spec で削除/置換

**Non-Goals**:

- claude-code / managed adapter の変更
- executor / transition / contract 本体の変更
- R4（prose 削除 / arch test）
- `contract/` 配下の編集

## Decisions

### D1: `outputSchema` で typed outcome を取得する（MCP server は使わない）

Codex adapter は `TurnOptions.outputSchema` を用いて structured JSON output を取得し、`finalResponse` を parse して `toolResult` を構築する。

**Rationale**:

- `outputSchema` は SDK の documented API で、追加依存なし
- MCP server 経由は外部 process の spawn/管理が必要。`config.mcp_servers` が `codex exec` で有効かも未検証
- outputSchema は Codex CLI がモデルに JSON 出力を強制するため、`no-tool-call` より確実に structured data が返る
- adapter 内部の実装差異であり、contract レベルでは同じ `toolResult` field に載る

**Alternatives considered**:

- **MCP server 経由**: `McpToolCallItem` 検出 → tool 名義だが、外部 process spawn + config 検証のコスト大。Codex SDK API が evolve すれば将来的に in-process API が追加される可能性もあり、現時点では simpler な outputSchema を選択
- **prompt-only（finalResponse を regex parse）**: structured output guarantee なし。agent の出力形式に依存し fragile

### D2: step-class 別の JSON schema を生成し `outputSchema` に渡す

既存の `ReportToolSpec.zodSchema`（zod/v4-mini）から JSON Schema を生成する helper を作る。`toJSONSchema(object(zodSchema))` は既に `report-tool.ts` で使用されている（`toCustomToolSpec`）。同じ変換を outputSchema 用に再利用する。

- producer step: `{ ok: boolean, reason?: string, status?: "success" | "error" }`
- judge step: `{ ok: boolean, reason?: string, approved?: boolean }`
- code-review step: `{ ok: boolean, reason?: string, approved?: boolean, fixableCount?: number }`

### D3: `finalResponse` を `parseInput` で parse → `toolResult` に載せる

`thread.run()` の戻り値 `turn.finalResponse` を JSON.parse し、`step.reportTool.parseInput()` で validation。

- parse 成功: `toolResult` に populated、`followUpAttempts: 0`
- JSON.parse 失敗 or parseInput 失敗: follow-up retry を実施（D4）

### D4: follow-up retry は outputSchema 付き再ターンで実施

agent が JSON output を返さない（parse 失敗）場合:

1. 同一 thread で `thread.run(retryPrompt, { outputSchema })` を最大 `maxAttempts` 回実行
2. retry prompt は `DEFAULT_TOOL_RETRY.buildPrompt({ reason: "no-tool-call" })` を流用（文面は tool 呼び出し名義だが意味的に同等）
3. 全 retry 枯渇: `toolResult: null`, `followUpAttempts: maxAttempts` で返す（degrade path — contract safe）

**Rationale**: `outputSchema` を付けた retry ターンなら Codex CLI がモデルに JSON を再強制する。retry の semantics は claude-code の tool-retry と等価。

### D5: `outputSchema` は main work ターンのみ、postWorkPrompts ターンには付けない

既存仕様（tool 検出は main work turn only）と整合。postWorkPrompts ターンは通常通り自由形式。

### D6: `CodexInstance` interface の拡張不要

`outputSchema` は `thread.run(input, { outputSchema })` の第 2 引数。現在 `CodexThread.run()` の型定義は `run(prompt: string, opts?: { signal?: AbortSignal })` だが、SDK の `Thread.run()` は `TurnOptions` を受ける。`CodexThread` interface に `outputSchema` option を追加する。

### D7: テストでは mock thread の `finalResponse` を JSON 文字列で返す

既存テストの mock pattern を踏襲。`makeThread({ finalResponse: JSON.stringify({ ok: true, status: "success" }) })` で outputSchema 経路を検証。

## Risks / Trade-offs

- **[Risk] outputSchema 時の agent 挙動変化**: outputSchema を付けると agent の最終応答が JSON のみになる。作業内容の自然言語 summary が finalResponse から消え、`resultContent`（resultFilePath 経由のファイル読み取り）に影響しない。ただし `resultFilePath === null` の step では `resultContent` が finalResponse になるため、JSON 文字列が入る。
  → **Mitigation**: `resultFilePath === null` の step（存在する場合）は resultContent に JSON が入るが、executor は `toolResult` populated 時に prose parse を使わないため verdict に影響なし。resultContent は history 記録用。

- **[Risk] `config.mcp_servers` 経路の未検証**: D1 で outputSchema を選択したため、MCP server 経由の実装は行わない。将来 Codex SDK が in-process tool API を追加した場合はそちらに移行可能。
  → **Mitigation**: outputSchema は documented API。SDK update で breaking change があれば adapter 内部の変更で対応可能。

- **[Risk] follow-up retry の effectiveness**: outputSchema 付きでも agent が conformant JSON を返さない可能性。
  → **Mitigation**: retry は最大 2 回（DEFAULT_TOOL_RETRY.maxAttempts）。3 回失敗しても `toolResult: null` で degrade（judge→needs-fix, producer→completionVerdict）— contract safe。

## Open Questions

なし（SDK 調査で実装方針が確定）。
