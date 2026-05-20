import * as path from "node:path";
import * as fs from "node:fs";
import { resolve as storeResolve } from "../core/request/store.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { createAnthropicClient } from "../adapter/managed-agent/client.js";
import { createAnthropicSessionClient } from "../adapter/managed-agent/session-client.js";
import { resolveSpecRunnerApiKey } from "../core/credentials/anthropic.js";
import { runPreflight } from "../core/preflight.js";
import { setVerbose, resolveVerboseFlag } from "../logger/stdout.js";
import { SpecRunnerError } from "../errors.js";
import { createRuntime } from "../core/runtime/index.js";
import { PipelineRunCommand } from "../core/command/pipeline-run.js";

export async function runRunCore(
  requestMdPath: string,
  options: { cwd?: string; verbose?: boolean },
): Promise<number> {
  setVerbose(resolveVerboseFlag(options.verbose ?? false));
  const cwd = options.cwd ?? process.cwd();
  let absolutePath = path.resolve(cwd, requestMdPath);

  if (!fs.existsSync(absolutePath)) {
    const slugResolved = storeResolve(cwd, requestMdPath);
    if (!fs.existsSync(slugResolved)) {
      process.stderr.write(`Error: '${requestMdPath}' is neither a file path nor an active request slug.\n`);
      process.stderr.write("Hint: Use 'specrunner request ls' to see available slugs.\n");
      return 1;
    }
    absolutePath = slugResolved;
  }

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

  const { config, repo, githubToken } = preflightResult;
  const githubClient = createGitHubClient(fetch, githubToken);
  const anthropicResult = config.runtime === "managed"
    ? await resolveSpecRunnerApiKey(process.env as Record<string, string | undefined>)
    : await resolveSpecRunnerApiKey(process.env as Record<string, string | undefined>, { optional: true });
  const sessionClient = anthropicResult
    ? createAnthropicSessionClient(createAnthropicClient(anthropicResult.apiKey))
    : undefined;
  const runtime = createRuntime(config, cwd, githubClient, repo, sessionClient, githubToken);
  try {
    return await new PipelineRunCommand(runtime, absolutePath, preflightResult, options).execute();
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }
}

export async function runRun(
  requestMdPath: string,
  options: { cwd?: string; verbose?: boolean },
): Promise<void> {
  process.exit(await runRunCore(requestMdPath, options));
}
