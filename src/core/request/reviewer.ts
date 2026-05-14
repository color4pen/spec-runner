/**
 * Core review logic for request.md — extracted from src/core/command/request-review.ts.
 * Provides runReview() with injectable queryFn for testability.
 */
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  query,
  type SDKMessage,
  type SDKResultMessage,
  type SDKResultSuccess,
} from "@anthropic-ai/claude-agent-sdk";
import { SpecRunnerError } from "../../errors.js";
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
// runReview
// ---------------------------------------------------------------------------

/**
 * Run the review session. Extracts Steps 3-9 from executeReview().
 * queryFn is injectable for testability.
 */
export async function runReview(
  content: string,
  config: SpecRunnerConfig,
  cwd: string,
  queryFn: typeof query = query,
): Promise<RequestReviewResult> {
  // Read project context
  let projectContext = "";
  try {
    const absProjectMdPath = path.join(cwd, projectMdPath());
    projectContext = await fs.readFile(absProjectMdPath, "utf-8");
  } catch {
    // Continue without project context
  }

  // Resolve step execution config
  const resolvedConfig = getStepExecutionConfig(config, "request-review", {
    model: "claude-opus-4-5",
    maxTurns: 30,
    timeoutMs: 300_000,
  });

  // maxTurns option
  const maxTurnsOption: Record<string, unknown> =
    resolvedConfig.maxTurns !== null ? { maxTurns: resolvedConfig.maxTurns } : {};

  // Timeout via AbortController
  const abortController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0) {
    timeoutId = setTimeout(() => abortController.abort(), resolvedConfig.timeoutMs);
  }

  // Iterate messages, capture last result
  let lastResult: SDKResultMessage | null = null;
  try {
    const messages = queryFn({
      prompt: buildInitialMessage(content, projectContext),
      options: {
        cwd,
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
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }

  // Check for success
  if (!lastResult || lastResult.subtype !== "success") {
    const subtype = lastResult?.subtype ?? "no-result";
    throw new SpecRunnerError(
      "REVIEW_SESSION_FAILED",
      "Check the session logs for more information.",
      `Review session failed (${subtype})`,
    );
  }

  // Parse structured output
  const rawOutput = (lastResult as SDKResultSuccess).result;
  return parseReviewOutput(rawOutput);
}
