import * as path from "node:path";
import { createAnthropicClient } from "../sdk/client.js";
import { runPreflight } from "../core/preflight.js";
import { createJobState } from "../state/store.js";
import { runProposePipeline } from "../core/pipeline.js";
import { bootstrapTools } from "../core/tools/index.js";
import { logInfo, logError } from "../logger/stdout.js";
import { SpecRunnerError } from "../errors.js";

/**
 * Parse timeout flag value like "30m" or "300s" into milliseconds.
 */
export function parseTimeout(value: string): number {
  const mMatch = /^(\d+)m$/.exec(value);
  if (mMatch?.[1]) {
    return parseInt(mMatch[1], 10) * 60 * 1000;
  }
  const sMatch = /^(\d+)s$/.exec(value);
  if (sMatch?.[1]) {
    return parseInt(sMatch[1], 10) * 1000;
  }
  throw new Error(`Invalid timeout format: ${value}. Use Nm or Ns (e.g., 30m, 300s)`);
}

/**
 * Run the specrunner run command.
 */
export async function runRun(
  requestMdPath: string,
  options: {
    timeout?: string;
    cwd?: string;
  },
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const absolutePath = path.resolve(cwd, requestMdPath);

  // Parse timeout if provided
  let timeoutMs: number | undefined;
  if (options.timeout) {
    try {
      timeoutMs = parseTimeout(options.timeout);
    } catch (err) {
      logError((err as Error).message);
      process.exit(1);
    }
  }

  // Bootstrap tools
  bootstrapTools();

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
    process.exit(1);
  }

  const { config, repo, request } = preflightResult;
  const client = createAnthropicClient(config.anthropic.apiKey);

  // Derive slug from request path (filename without extension)
  const slug = path.basename(absolutePath, ".md");

  logInfo(`Starting propose pipeline for: ${request.title}`);

  // Create job state
  const jobState = await createJobState({
    request: {
      path: absolutePath,
      title: request.title,
      type: request.type,
    },
    repository: { owner: repo.owner, name: repo.name },
  });

  logInfo(`Job ID: ${jobState.jobId}`);

  // Run pipeline
  try {
    const finalState = await runProposePipeline(jobState, {
      client,
      config,
      repo,
      request,
      slug,
      timeoutMs,
    });

    if (finalState.status === "success") {
      logInfo(`Pipeline completed successfully. Branch: ${finalState.branch}`);
      process.exit(0);
    } else {
      logError(`Pipeline failed: ${finalState.error?.message ?? "unknown error"}`);
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${err.message}\n`);
      if (err.hint) process.stderr.write(`Hint: ${err.hint}\n`);
    } else {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
    }
    process.exit(1);
  }
}
