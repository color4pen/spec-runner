/**
 * IssueFidelityComparator adapter for the Claude Code (local) runtime.
 *
 * Uses queryOneShot to run a one-shot LLM comparison between an issue body
 * and a request.md file, then parses the structured JSON output to extract
 * the list of undeclared drops.
 *
 * Fail-closed: parse failure, missing `undeclaredDrops` key, or LLM error
 * all throw — the gate treats any throw as a halt signal.
 *
 * Non-propagation: the issue body is only used as a local variable inside
 * compare() and passed to queryOneShot. It is never written to disk.
 */
import type { IssueFidelityComparator, IssueFidelityComparison } from "../../core/port/issue-fidelity-comparator.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { QueryOneShotOptions, QueryOneShotResult } from "./query-one-shot.js";
import { ISSUE_FIDELITY_SYSTEM_PROMPT, buildIssueFidelityUserMessage } from "../../prompts/issue-fidelity-system.js";

// ---------------------------------------------------------------------------
// Injectable query function type (for testability)
// ---------------------------------------------------------------------------

/**
 * Function signature matching queryOneShot's external contract.
 * Accepts opts + config and returns QueryOneShotResult.
 * Tests inject a fake here to avoid real SDK/network calls.
 */
type IssueFidelityQueryFn = (
  opts: QueryOneShotOptions,
  config: SpecRunnerConfig,
) => Promise<QueryOneShotResult>;

// ---------------------------------------------------------------------------
// JSON extraction helper
// ---------------------------------------------------------------------------

/**
 * Extract undeclaredDrops from a raw LLM text output.
 * Handles both bare JSON and JSON wrapped in a markdown code block.
 * Throws if the output cannot be parsed or lacks the required key.
 */
function parseUndeclaredDrops(text: string): string[] {
  // Try to extract JSON from a markdown code block first, then try bare JSON.
  const codeBlockMatch = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/.exec(text);
  const jsonText = codeBlockMatch ? (codeBlockMatch[1] ?? text) : text.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // Try to find a bare JSON object in the text
    const bareMatch = /(\{[\s\S]*\})/.exec(text);
    if (!bareMatch) {
      throw new Error(`IssueFidelityComparator: failed to parse LLM output as JSON. Raw output: ${text.slice(0, 200)}`);
    }
    try {
      parsed = JSON.parse(bareMatch[1] ?? "{}");
    } catch {
      throw new Error(`IssueFidelityComparator: failed to parse LLM output as JSON. Raw output: ${text.slice(0, 200)}`);
    }
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("undeclaredDrops" in parsed)
  ) {
    throw new Error(
      `IssueFidelityComparator: LLM output missing 'undeclaredDrops' key. Parsed: ${JSON.stringify(parsed).slice(0, 200)}`,
    );
  }

  const drops = (parsed as Record<string, unknown>)["undeclaredDrops"];
  if (!Array.isArray(drops)) {
    throw new Error(
      `IssueFidelityComparator: 'undeclaredDrops' is not an array. Got: ${JSON.stringify(drops)}`,
    );
  }

  // Coerce all elements to strings (fail-closed: non-strings become their JSON representation)
  return drops.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an IssueFidelityComparator that uses the Claude Code local runtime
 * (queryOneShot) to compare an issue with a request.md.
 *
 * @param config  SpecRunnerConfig for step-config resolution (model / timeout / maxTurns).
 * @param queryFn Optional injectable query function (for testing). When absent, uses queryOneShot.
 */
export function createIssueFidelityComparator(
  config: SpecRunnerConfig,
  queryFn?: IssueFidelityQueryFn,
): IssueFidelityComparator {
  return {
    async compare(input: { issueTitle: string; issueBody: string; requestMd: string }): Promise<IssueFidelityComparison> {
      // Resolve query function: injected fake (tests) or real queryOneShot (production).
      // Lazy import of queryOneShot: SDK is not loaded unless compare() is actually called.
      const callQuery: IssueFidelityQueryFn = queryFn ?? (async (opts, cfg) => {
        const { queryOneShot } = await import("./query-one-shot.js");
        return queryOneShot(opts, cfg);
      });

      const systemPrompt = ISSUE_FIDELITY_SYSTEM_PROMPT;
      const prompt = buildIssueFidelityUserMessage(input);

      const result = await callQuery(
        {
          systemPrompt,
          prompt,
          stepName: "issue-fidelity-gate",
          allowedTools: [],
        },
        config,
      );

      const undeclaredDrops = parseUndeclaredDrops(result.text);
      return { undeclaredDrops };
    },
  };
}
