## Requirements

### Requirement: StepExecutor Manages Lifecycle and Emits Events

Step 8 の verdict 確定ロジックを以下のように変更する:

`finalizeStep` は verdict を確定する際に MUST 以下の優先順位で評価しなければならない:

1. **toolResult が存在**: `agentResult.toolResult` の typed field から step-class に基づいて verdict を導出する。prose parse（`step.parseResult`）は verdict 確定に使用しない。
2. **toolResult が null かつ reportTool あり**: step-class に基づいて fallback verdict を確定する（judge → `"needs-fix"`, producer → `completionVerdict`）。`stepHaltedNoToolCallError` は throw しない（proceed する）。
3. **toolResult が null かつ reportTool なし**（grounded / CLI step）: 従来通り `step.parseResult(resultContent)` で verdict を parse する。`completionVerdict` fallback も維持。

step-class の判別は `step.reportTool` の identity で行う（`JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` → judge、それ以外 → producer）。

`verdict:parsed` イベントは従来通り emit される。toolResult 由来の verdict も同じイベントで通知する。

#### Scenario: toolResult 存在時に prose parse をスキップ

**Given** agent step が `toolResult: { ok: true, approved: true }` で完了する
**When** `finalizeStep` が verdict を確定する
**Then** `step.parseResult` は verdict 確定のために呼ばれず、toolResult の `approved` field から `"approved"` が導出される

#### Scenario: toolResult null + reportTool あり（judge）で proceed

**Given** spec-review step（reportTool = JUDGE_REPORT_TOOL）が `toolResult: null` で完了する
**When** `finalizeStep` が verdict を確定する
**Then** halt せず verdict `"needs-fix"` で proceed し、step result が正常に記録される

#### Scenario: toolResult null + reportTool あり（producer）で proceed

**Given** implementer step（reportTool = PRODUCER_REPORT_TOOL, completionVerdict = "success"）が `toolResult: null` で完了する
**When** `finalizeStep` が verdict を確定する
**Then** halt せず verdict `"success"` で proceed する

#### Scenario: grounded step は従来の prose parse path

**Given** verification step（kind: "cli", reportTool なし）が result file を生成する
**When** `finalizeStep` が verdict を確定する
**Then** `step.parseResult(resultContent)` で verdict が parse される（toolResult path は通らない）
