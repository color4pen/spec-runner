# Design: codex-completion-report-fallback

## Context

`CodexAgentRunner` captures completion reports by injecting `outputSchema` into `thread.runStreamed()` and calling `JSON.parse(finalResponse)` on the result. Two failure modes were confirmed in production with `gpt-5.5` + ChatGPT account auth:

1. **`outputSchema` hang**: passing `outputSchema` to `gpt-5.5` causes `runStreamed` to block indefinitely (~10+ min). The follow-up retry loop reuses the same schema, reproducing the hang on every attempt.
2. **Near-miss parse failure**: even when the turn completes, `gpt-5.5` may return the JSON wrapped in a code fence (` ```json\n...\n``` `) or preceded by explanatory text. `JSON.parse` fails on these; the completion report is lost despite the turn succeeding.

Additionally, parse failures are silent—no reason or finalResponse fragment is recorded anywhere, making root-cause analysis impossible post-mortem.

## Goals / Non-Goals

**Goals**:
- Recover completion reports from code-fenced and text-prefixed JSON in `finalResponse`
- Eliminate `outputSchema` in follow-up retry turns to avoid the hang failure mode
- Emit diagnostic information (failure reason + truncated `finalResponse` fragment) on each parse failure
- Preserve fail-closed behavior (all turns fail → `toolResult: null` → escalation)

**Non-Goals**:
- claude-code adapter completion report path (MCP tool method, independent)
- ChatGPT account model restrictions (registry/pricing concern)
- Shared prompt surface changes (provider-neutral contract already in place)

## Decisions

### D1: Three-strategy JSON extraction pipeline

Replace `tryParseToolResult` with `tryExtractToolResult`, which returns an enriched result type:

```
{ toolResult: BaseReportResult | null; failureReason: string | null; rawFragment: string | null }
```

Extraction proceeds through strategies in order; the first to return a valid `parseInput` result wins:

1. **Raw parse** — `JSON.parse(finalResponse.trim())` (existing happy path, zero overhead)
2. **Code-fence extraction** — regex: ` ```(?:json)?\s*\n([\s\S]*?)\n``` ` extracts the fence body; falls back to ` ```(?:json)?\s*([\s\S]*?)``` ` for inline fences
3. **Bracket extraction** — substring from first `{` to last `}`, inclusive

Each strategy applies `stripNullDeep` and `reportTool.parseInput()` unchanged. The validation contract is not relaxed.

`failureReason` encodes the per-strategy outcome when all fail: `"json-parse-error"`, `"validation-failed"`, or `"no-json-found"`. `rawFragment` is the first 200 characters of `finalResponse` (truncated with `…` if longer).

**Rationale**: Code-fence and text-prefix are the two dominant near-miss patterns for instruction-following LLMs. Bracket extraction covers remaining prose-wrapped JSON. No new runtime dependency is needed (minimal-deps North Star).

**Alternatives considered**: JSON-extraction libraries (e.g., `json-repair`). Rejected — adds a dependency and changes the validation contract (they auto-repair malformed JSON, which could silently accept incorrect output).

### D2: Schema-free follow-up retry turns

The `toolReportRetry` loop (follow-up turns for completion report re-capture) passes `outputSchema: undefined` instead of the schema object. The retry prompt is updated to instruct plain-JSON output without referencing schema structure:

> 前の応答から JSON を取得できませんでした。コードフェンスや説明文を付けず、スキーマに一致する JSON オブジェクトのみを返してください。 (attempt N/M)

The **main work turn** retains `outputSchema`. It succeeds on models that support structured output and is recovered by D1 on models that return code-fenced JSON.

**Rationale**: The production evidence shows `outputSchema` on `gpt-5.5` causes an indefinite hang. Removing it from retry turns breaks the re-hang cycle. D1's extraction covers the resulting unstructured output. Fail-closed is preserved if extraction still fails.

**Alternatives considered**: Keep `outputSchema` in retry turns with a shorter timeout. Rejected — the hang precedes any timeout signal reaching the model; aborting a stalled `gpt-5.5` turn is unreliable.

### D3: Parse failure observability

At each call site where `tryExtractToolResult` returns `toolResult: null`, a diagnostic line is written via `stderrWrite`:

```
[codex] completion report parse failed (attempt N/M): <failureReason>; fragment: "<rawFragment>"
```

`rawFragment` is capped at 200 characters. No additional masking is applied — completion report fragments contain step verdicts, not credentials.

**Rationale**: Post-mortem on job c812a533 was blocked because `finalResponse` content was never recorded. A single stderr line per attempt is low-overhead and sufficient for diagnosis.

## Risks / Trade-offs

**[Risk] Bracket extraction false positives**: if `finalResponse` contains multiple JSON objects (e.g., tool call traces interspersed in output), `first-{` / `last-}` may span multiple objects and produce syntactically invalid JSON. Mitigation: `JSON.parse` still validates; invalid extractions are discarded and the next strategy is tried.

**[Risk] Schema-free retry turns produce structurally incorrect JSON**: without the schema constraint, the model may omit required fields. Mitigation: `reportTool.parseInput()` validates the schema; invalid output is discarded and fail-closed behavior is preserved.

## Open Questions

None.
