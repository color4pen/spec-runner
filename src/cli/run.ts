import * as path from "node:path";
import { createAnthropicClient } from "../sdk/client.js";
import { createAnthropicSessionClient } from "../adapter/managed-agent/session-client.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { runPreflight } from "../core/preflight.js";
import { createJobState } from "../state/store.js";
import { runPipeline } from "../core/pipeline/index.js";
import { logInfo, logError } from "../logger/stdout.js";
import { SpecRunnerError } from "../errors.js";
import type { JobState } from "../state/schema.js";
import { getLatestStepResult } from "../state/helpers.js";

/**
 * Parse spec-review findings summary from spec-review-result.md content.
 * Returns findings summary or null if not available. Best-effort — never throws.
 */
function parseSpecReviewFindingsSummary(
  content: string | undefined,
): { count: number; topFindings: string[] } | null {
  if (!content) return null;
  try {
    // Find the Findings table
    const tableMatch = /\| #.*\n\|[-| ]+\n((?:\|.*\n?)*)/m.exec(content);
    if (!tableMatch || !tableMatch[1]) return null;

    const rows = tableMatch[1]
      .split("\n")
      .filter((line) => line.trim().startsWith("|") && line.trim() !== "|");

    const findings = rows
      .map((row) => {
        const cells = row.split("|").filter(Boolean).map((c) => c.trim());
        // cells: [#, Severity, Category, File, Description, How to Fix]
        return cells[4] ?? ""; // Description column
      })
      .filter(Boolean);

    return {
      count: findings.length,
      topFindings: findings.slice(0, 3),
    };
  } catch {
    return null;
  }
}

/**
 * Output spec-review verdict information to stdout.
 */
function outputSpecReviewVerdict(finalState: JobState, slug: string): void {
  const specReviewResult = getLatestStepResult(finalState, "spec-review");
  if (!specReviewResult?.verdict) return;

  const verdict = specReviewResult.verdict;
  process.stdout.write(`Spec review verdict: ${verdict}\n`);

  if (verdict === "needs-fix") {
    // Best-effort findings summary — use fileContent stored in step result
    const findingsSummary = parseSpecReviewFindingsSummary(specReviewResult.fileContent ?? undefined);
    if (findingsSummary && findingsSummary.count > 0) {
      process.stdout.write(`Findings: ${findingsSummary.count} issue(s) found.\n`);
      for (const finding of findingsSummary.topFindings) {
        process.stdout.write(`  - ${finding}\n`);
      }
    }
    process.stdout.write(
      `Review findings at: ${specReviewResult.findingsPath ?? "openspec/changes/" + slug + "/spec-review-result.md"}\n`,
    );
  } else if (verdict === "escalation") {
    process.stdout.write(
      "Spec review requires human judgment. Check the findings file for details.\n",
    );
    if (specReviewResult.findingsPath) {
      process.stdout.write(`Findings at: ${specReviewResult.findingsPath}\n`);
    }
  }
}

/**
 * Run the specrunner run command.
 * Returns the determined exit code (0 = success, 1 = failure).
 * Separated from process.exit to make it testable.
 */
export async function runRunCore(
  requestMdPath: string,
  options: {
    cwd?: string;
  },
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const absolutePath = path.resolve(cwd, requestMdPath);

  // Run fail-fast preflight checks
  let preflightResult: Awaited<ReturnType<typeof runPreflight>>;
  try {
    preflightResult = await runPreflight(absolutePath, cwd);
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${err.message}\n`);
      if (err.hint) process.stderr.write(`Hint: ${err.hint}\n`);
    } else {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
    }
    return 1;
  }

  const { config, repo, request } = preflightResult;
  const githubClient = createGitHubClient(fetch, config.github?.accessToken ?? "");

  // TC-036/TC-009/TC-035: composition root branches on config.runtime (Design D8).
  // managed runtime: create SessionClient + ManagedAgentRunner
  // local runtime:   create ClaudeCodeRunner, no SessionClient (TC-036: no API key needed)
  let client: ReturnType<typeof createAnthropicSessionClient> | undefined;
  if (config.runtime !== "local") {
    const anthropicClient = createAnthropicClient(config.anthropic.apiKey);
    client = createAnthropicSessionClient(anthropicClient);
  }

  // Slug is the canonical change identifier. It is the single source of truth
  // (request.md `slug:` Meta field, validated by the parser). The agent receives
  // it via the propose user message and must NOT generate its own.
  const slug = request.slug;

  logInfo(`Starting propose pipeline for: ${request.title}`);

  // Derive slug for state: use canonical path detection.
  // Canonical pattern: specrunner/requests/active/<slug>/request.md
  // Non-canonical (e.g. /tmp/...) → null
  const CANONICAL_PATTERN = /^.*\/specrunner\/requests\/active\/([^/]+)\/[^/]+\.md$/;
  const canonicalMatch = CANONICAL_PATTERN.exec(absolutePath);
  const requestSlug: string | null = canonicalMatch ? (canonicalMatch[1] ?? null) : null;

  // Create job state
  const jobState = await createJobState({
    request: {
      path: absolutePath,
      title: request.title,
      type: request.type,
      slug: requestSlug,
    },
    repository: { owner: repo.owner, name: repo.name },
  });

  logInfo(`Job ID: ${jobState.jobId}`);

  // Run pipeline
  let finalState: JobState;
  try {
    finalState = await runPipeline(jobState, {
      client,
      config,
      repo,
      request,
      slug,
      githubClient,
      cwd,
    });
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      if (err.code === "SPEC_REVIEW_RESULT_NOT_FOUND") {
        const branch = jobState.branch ?? "unknown";
        process.stderr.write(
          `Error: Spec-review result file not found on branch '${branch}'.\n`,
        );
        if (err.hint) process.stderr.write(`Hint: ${err.hint}\n`);
        return 1;
      }
      process.stderr.write(`Error: ${err.message}\n`);
      if (err.hint) process.stderr.write(`Hint: ${err.hint}\n`);
    } else {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
    }
    return 1;
  }

  // Check for SPEC_REVIEW_RESULT_NOT_FOUND in returned state
  if (finalState.error?.code === "SPEC_REVIEW_RESULT_NOT_FOUND") {
    const branch = finalState.branch ?? "unknown";
    process.stderr.write(
      `Error: Spec-review result file not found on branch '${branch}'.\n`,
    );
    if (finalState.error.hint) {
      process.stderr.write(`Hint: ${finalState.error.hint}\n`);
    }
    return 1;
  }

  // Output spec-review verdict
  outputSpecReviewVerdict(finalState, slug);

  if (finalState.status === "awaiting-merge") {
    logInfo(`Pipeline completed; awaiting merge. Branch: ${finalState.branch}`);
    return 0;
  } else {
    logError(`Pipeline failed: ${finalState.error?.message ?? "unknown error"}`);
    return 1;
  }
}

/**
 * Run the specrunner run command (entry point — calls process.exit).
 */
export async function runRun(
  requestMdPath: string,
  options: {
    cwd?: string;
  },
): Promise<void> {
  const exitCode = await runRunCore(requestMdPath, options);
  process.exit(exitCode);
}
