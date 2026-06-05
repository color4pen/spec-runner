/**
 * Core review logic for request.md — extracted from src/core/command/request-review.ts.
 * Provides runReview() with injectable OneShotQueryClient for testability.
 */
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { OneShotQueryClient } from "../port/one-shot-query-client.js";
import type { ModelUsage } from "../port/model-usage.js";
import { projectMdPath } from "../../util/paths.js";
import { REQUEST_REVIEW_SYSTEM_PROMPT } from "../../prompts/request-review-system.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RequestReviewVerdict = "approve" | "needs-discussion" | "reject";

export interface RequestReviewFinding {
  number: number;           // 1-indexed stable finding number
  severity: "HIGH" | "MEDIUM" | "LOW";
  category: string;
  description: string;
  location?: string;        // file path or section reference
  recommendation?: string;  // 推奨アクション
}

export interface RequestReviewResult {
  verdict: RequestReviewVerdict;
  findings: RequestReviewFinding[];
  summary: string;
  /** Per-model token usage from the review agent run. undefined if not available. */
  modelUsage?: Record<string, ModelUsage>;
}

// ---------------------------------------------------------------------------
// parseReviewOutput
// ---------------------------------------------------------------------------

const VALID_VERDICTS: readonly RequestReviewVerdict[] = ["approve", "needs-discussion", "reject"];

/**
 * Fixed diagnostic message used when structured JSON output cannot be parsed.
 * Must not contain any input-derived text so it is clearly distinguishable from
 * a real review result.
 */
export const PARSE_FAILURE_SUMMARY =
  "Structured reviewer output could not be parsed as JSON. This is not a confirmed verdict — please re-run the review.";

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
        const parsedObj = parsed as Record<string, unknown>;
        const rawFindings = Array.isArray(parsedObj["findings"])
          ? (parsedObj["findings"] as RequestReviewFinding[])
          : [];
        const findings = rawFindings.map((f, i) => ({
          ...f,
          number: f.number ?? i + 1,
        }));
        return { ...(parsed as RequestReviewResult), findings };
      }
    } catch {
      // Fall through to fallback
    }
  }

  return {
    verdict: "needs-discussion",
    findings: [
      {
        number: 1,
        severity: "HIGH",
        category: "parse-error",
        description: "Could not parse structured output from reviewer",
      },
    ],
    summary: PARSE_FAILURE_SUMMARY,
  };
}

// ---------------------------------------------------------------------------
// formatHumanReadable
// ---------------------------------------------------------------------------

/**
 * Format a RequestReviewResult as human-readable text.
 * Includes verdict, summary, and all findings.
 * If findings is empty, prints "No findings." instead.
 */
export function formatHumanReadable(result: RequestReviewResult): string {
  const parts: string[] = [];

  parts.push(`## Verdict: ${result.verdict}`);
  parts.push("");
  parts.push(result.summary);
  parts.push("");

  if (result.findings.length === 0) {
    parts.push("No findings.");
  } else {
    parts.push("## Findings");
    parts.push("");

    const findingBlocks: string[] = [];
    for (const finding of result.findings) {
      const lines: string[] = [];
      lines.push(`#${finding.number} [${finding.severity}] ${finding.category} — ${finding.description}`);
      if (finding.location) {
        lines.push(`   Location: ${finding.location}`);
      }
      if (finding.recommendation) {
        lines.push(`   → ${finding.recommendation}`);
      }
      findingBlocks.push(lines.join("\n"));
    }

    parts.push(findingBlocks.join("\n\n"));
  }

  return parts.join("\n");
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
レビュープロセス（コードベース文脈把握 → 要件検証 → 外部依存チェック → Scope 妥当性検証）を順に実行し、
最後に必ず \`\`\`json フェンスで構造化 JSON を出力してください。`;
}

// ---------------------------------------------------------------------------
// runReview
// ---------------------------------------------------------------------------

/**
 * Run the review session.
 * client: OneShotQueryClient is injected by the caller (composition point).
 */
export async function runReview(
  content: string,
  cwd: string,
  client: OneShotQueryClient,
): Promise<RequestReviewResult> {
  // Read project context
  let projectContext = "";
  try {
    const absProjectMdPath = path.join(cwd, projectMdPath());
    projectContext = await fs.readFile(absProjectMdPath, "utf-8");
  } catch {
    // Continue without project context
  }

  const result = await client.run({
    systemPrompt: REQUEST_REVIEW_SYSTEM_PROMPT,
    prompt: buildInitialMessage(content, projectContext),
    allowedTools: ["Read", "Bash", "Grep", "Glob"],
    maxTurns: 30,
    timeoutMs: 300_000,
    cwd,
    stepName: "request-review",
    model: "claude-opus-4-5",
  });
  const parsed = parseReviewOutput(result.text);
  return { ...parsed, modelUsage: result.modelUsage };
}
