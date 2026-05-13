/**
 * Core logic for the `specrunner request review` command.
 *
 * Performs an architect review of a request.md file using the Claude Agent SDK
 * directly (no pipeline machinery). Stateless one-shot command.
 *
 * Exit codes:
 *   0 — approve or needs-discussion (non-error verdicts)
 *   1 — reject or execution error
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  query,
  type SDKMessage,
  type SDKResultMessage,
  type SDKResultSuccess,
} from "@anthropic-ai/claude-agent-sdk";
import { parseRequestMdContent } from "../../parser/request-md.js";
import { SpecRunnerError } from "../../errors.js";
import { loadConfig } from "../../config/store.js";
import { getStepExecutionConfig } from "../../config/step-config.js";
import { projectMdPath } from "../../util/paths.js";
import { REQUEST_REVIEW_SYSTEM_PROMPT } from "../../prompts/request-review-system.js";
import type { SpecRunnerConfig } from "../../config/schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RequestReviewVerdict = "approve" | "needs-discussion" | "reject";

export interface RequestReviewFinding {
  severity: "HIGH" | "MEDIUM" | "LOW";
  category: string;
  description: string;
}

export interface RequestReviewResult {
  verdict: RequestReviewVerdict;
  findings: RequestReviewFinding[];
  summary: string;
}

// ---------------------------------------------------------------------------
// parseReviewOutput
// ---------------------------------------------------------------------------

const VALID_VERDICTS: readonly RequestReviewVerdict[] = ["approve", "needs-discussion", "reject"];

function isValidVerdict(value: unknown): value is RequestReviewVerdict {
  return typeof value === "string" && (VALID_VERDICTS as readonly string[]).includes(value);
}

/**
 * Extract structured JSON from the last ```json ... ``` block in the reviewer's output.
 * Falls back to a needs-discussion result if parsing fails.
 */
export function parseReviewOutput(text: string): RequestReviewResult {
  // Match the last ```json ... ``` block in the text
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = jsonBlockRegex.exec(text)) !== null) {
    lastMatch = match;
  }

  if (lastMatch) {
    try {
      const jsonText = lastMatch[1] ?? "";
      const parsed = JSON.parse(jsonText) as unknown;
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        "verdict" in parsed &&
        isValidVerdict((parsed as Record<string, unknown>)["verdict"])
      ) {
        return parsed as RequestReviewResult;
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: could not parse or invalid verdict
  return {
    verdict: "needs-discussion",
    findings: [
      {
        severity: "HIGH",
        category: "parse-error",
        description: "Could not parse structured output from reviewer",
      },
    ],
    summary: text.slice(0, 500),
  };
}

// ---------------------------------------------------------------------------
// verdictToExitCode
// ---------------------------------------------------------------------------

/**
 * Map verdict to exit code.
 * approve/needs-discussion → 0 (Unix: non-error)
 * reject → 1
 */
export function verdictToExitCode(verdict: RequestReviewVerdict): number {
  if (verdict === "reject") return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// buildInitialMessage
// ---------------------------------------------------------------------------

/**
 * Build the initial message for the architect review session.
 * Wraps projectContext in <project-context> tags and requestContent in <request> tags.
 */
export function buildInitialMessage(requestContent: string, projectContext: string): string {
  return `以下の request.md を architect 観点でレビューしてください。

<project-context>
${projectContext}
</project-context>

<request>
${requestContent}
</request>

上記の request.md を読み、既存のコードベースを探索した上で、architect レビューを実施してください。
レビュープロセス（現状分析 → 要件整理 → 設計評価 → トレードオフ分析 → Domain Synthesis → Devil's Advocate）を順に実行し、
最後に必ず \`\`\`json フェンスで構造化 JSON を出力してください。`;
}

// ---------------------------------------------------------------------------
// executeReview
// ---------------------------------------------------------------------------

/**
 * Execute the `request review` subcommand.
 *
 * @param filePath  Path to the request.md file to review
 * @param opts      Options: json=true outputs structured JSON instead of raw text
 * @returns         Exit code: 0 (approve/needs-discussion), 1 (reject or error)
 */
export async function executeReview(filePath: string, opts: { json: boolean }): Promise<number> {
  // Step 1: Read the request.md file
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  // Step 2: Validate format using parseRequestMdContent
  try {
    parseRequestMdContent(content, filePath);
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.stderr.write(`Hint: ${err.hint}\n`);
    } else {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
    }
    return 1;
  }

  // Step 3: Read project context
  let projectContext = "";
  try {
    const absProjectMdPath = path.join(process.cwd(), projectMdPath());
    projectContext = await fs.readFile(absProjectMdPath, "utf-8");
  } catch {
    process.stderr.write(`Warning: Could not read project context (${projectMdPath()}). Continuing without it.\n`);
  }

  // Step 4: Load config (gracefully degrade if not initialized)
  let config: SpecRunnerConfig;
  try {
    config = await loadConfig();
  } catch {
    config = {} as SpecRunnerConfig;
  }

  // Step 5: Resolve step execution config
  const resolvedConfig = getStepExecutionConfig(config, "request-review", {
    model: "claude-opus-4-5",
    maxTurns: 30,
    timeoutMs: 300_000,
  });

  // Step 6: Call query() directly (no pipeline machinery)
  // maxTurns: null → omit from options (unlimited)
  const maxTurnsOption: Record<string, unknown> =
    resolvedConfig.maxTurns !== null ? { maxTurns: resolvedConfig.maxTurns } : {};

  // Set up wall-clock timeout via AbortController
  const abortController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0) {
    timeoutId = setTimeout(() => abortController.abort(), resolvedConfig.timeoutMs);
  }

  // Step 7: Iterate messages, capture last result
  let lastResult: SDKResultMessage | null = null;
  try {
    const messages = query({
      prompt: buildInitialMessage(content, projectContext),
      options: {
        cwd: process.cwd(),
        allowedTools: ["Read", "Bash", "Grep", "Glob"],
        permissionMode: "bypassPermissions",
        ...maxTurnsOption,
        model: resolvedConfig.model,
        systemPrompt: REQUEST_REVIEW_SYSTEM_PROMPT,
        abortController,
      },
    });

    for await (const message of messages as AsyncGenerator<SDKMessage, void>) {
      if (message.type === "result") {
        lastResult = message as SDKResultMessage;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: Review session failed: ${message}\n`);
    return 1;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }

  // Step 8: Check for success
  if (!lastResult || lastResult.subtype !== "success") {
    const subtype = lastResult?.subtype ?? "no-result";
    process.stderr.write(`Error: Review session failed (${subtype})\n`);
    return 1;
  }

  // Step 9: Parse structured output
  const rawOutput = (lastResult as SDKResultSuccess).result;
  const result = parseReviewOutput(rawOutput);

  // Step 10-11: Output
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(rawOutput + "\n");
  }

  // Step 12: Return exit code based on verdict
  return verdictToExitCode(result.verdict);
}
