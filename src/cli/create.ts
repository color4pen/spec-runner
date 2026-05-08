/**
 * CLI facade for the `specrunner create` command.
 * Handles config loading, runtime construction, and delegates to executeCreate().
 */
import { loadConfig } from "../config/store.js";
import { getOriginInfo } from "../git/remote.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { createRuntime } from "../core/runtime/index.js";
import { slugify } from "../util/slugify.js";
import { executeCreate } from "../core/command/create.js";
import { SpecRunnerError } from "../errors.js";

export interface CreateOptions {
  type?: string;
  slug?: string;
  noLlm?: boolean;
  run?: boolean;
  cwd?: string;
}

/**
 * Run the create command.
 * Loads config, constructs runtime, and delegates to executeCreate().
 * Calls process.exit() if executeCreate returns non-zero.
 */
export async function runCreate(
  description: string,
  options: CreateOptions = {},
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const type = options.type ?? "new-feature";
  const slug = options.slug ?? slugify(description);
  const noLlm = options.noLlm ?? false;
  const run = options.run ?? false;

  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = await loadConfig();
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.stderr.write(`Hint: ${err.hint}\n`);
    } else {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
    }
    process.exit(1);
  }

  let repo: Awaited<ReturnType<typeof getOriginInfo>>;
  try {
    repo = await getOriginInfo(cwd);
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.stderr.write(`Hint: ${err.hint}\n`);
    } else {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
    }
    process.exit(1);
  }

  const githubClient = createGitHubClient(fetch, config.github?.accessToken ?? "");
  const runtime = createRuntime(config, cwd, githubClient, repo);

  const exitCode = await executeCreate({
    description,
    type,
    slug,
    cwd,
    noLlm,
    run,
    runtime,
  });

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
