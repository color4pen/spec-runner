import { createGitHubClient } from "../adapter/github/github-client.js";
import { loadConfig } from "../config/store.js";
import { SpecRunnerError } from "../errors.js";
import { setVerbose } from "../logger/stdout.js";
import { resolveJobStateBySlug } from "../core/resume/resolve-job.js";
import { createRuntime } from "../core/runtime/index.js";
import { ResumeCommand } from "../core/command/resume.js";

export interface ResumeOptions {
  from?: string;
  force?: boolean;
  verbose?: boolean;
  cwd?: string;
}

export async function runResumeCore(slug: string, options: ResumeOptions): Promise<number> {
  setVerbose(options.verbose ?? false);
  const cwd = options.cwd ?? process.cwd();

  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = await loadConfig();
  } catch (err) {
    const e = err as Error & { hint?: string };
    process.stderr.write(`Error: ${e.message}\n`);
    if (err instanceof SpecRunnerError && e.hint) process.stderr.write(`Hint: ${e.hint}\n`);
    return 1;
  }

  const state = await resolveJobStateBySlug(slug);
  const repo = state
    ? { owner: state.repository.owner, name: state.repository.name }
    : { owner: "", name: "" };

  const githubClient = createGitHubClient(fetch, config.github?.accessToken ?? "");
  const runtime = createRuntime(config, cwd, githubClient, repo);
  try {
    return await new ResumeCommand(runtime, slug, options).execute();
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    return 1;
  }
}

export async function runResume(slug: string, options: ResumeOptions): Promise<void> {
  process.exit(await runResumeCore(slug, options));
}
