import * as path from "node:path";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { createAnthropicClient } from "../adapter/managed-agent/client.js";
import { createAnthropicSessionClient } from "../adapter/managed-agent/session-client.js";
import { runPreflight } from "../core/preflight.js";
import { setVerbose } from "../logger/stdout.js";
import { SpecRunnerError } from "../errors.js";
import { createRuntime } from "../core/runtime/index.js";
import { PipelineRunCommand } from "../core/command/pipeline-run.js";

export async function runRunCore(
  requestMdPath: string,
  options: { cwd?: string; verbose?: boolean },
): Promise<number> {
  setVerbose(options.verbose ?? false);
  const cwd = options.cwd ?? process.cwd();
  const absolutePath = path.resolve(cwd, requestMdPath);

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

  const { config, repo } = preflightResult;
  const githubClient = createGitHubClient(fetch, config.github?.accessToken ?? "");
  const sessionClient =
    config.runtime !== "local" && config.anthropic?.apiKey
      ? createAnthropicSessionClient(createAnthropicClient(config.anthropic.apiKey))
      : undefined;
  const runtime = createRuntime(config, cwd, githubClient, repo, sessionClient);
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
