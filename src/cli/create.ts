/**
 * CLI facade for the `specrunner create` command.
 * Handles repo resolution + bootstrap, then delegates to:
 *   - executeCreate()        when --no-llm is set (scaffold template)
 *   - executeCreateDialog()  otherwise (interactive REPL, default)
 */
import { getOriginInfo } from "../git/remote.js";
import { bootstrap } from "./bootstrap.js";
import { slugify } from "../util/slugify.js";
import { executeCreate } from "../core/command/create.js";
import { SpecRunnerError } from "../errors.js";
import { loadDraft } from "../state/draft-store.js";

export interface CreateOptions {
  type?: string;
  slug?: string;
  noLlm?: boolean;
  run?: boolean;
  cwd?: string;
  resume?: string;
}

/**
 * Run the create command.
 * Loads config, constructs runtime, and delegates to executeCreate().
 * Calls process.exit() if executeCreate returns non-zero.
 */
export async function runCreate(
  description: string | undefined,
  options: CreateOptions = {},
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const noLlm = options.noLlm ?? false;
  const run = options.run ?? false;

  // --resume: load draft and resume the dialog session
  if (options.resume !== undefined) {
    const draft = await loadDraft(cwd, options.resume);
    if (!draft) {
      process.stderr.write(`Error: No draft found for slug '${options.resume}'.\n`);
      process.exit(1);
    }

    const type = options.type ?? draft.state.type;
    const slug = draft.state.slug;

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

    let runtime: Awaited<ReturnType<typeof bootstrap>>["runtime"];
    try {
      ({ runtime } = await bootstrap(cwd, repo));
    } catch (err) {
      if (err instanceof SpecRunnerError) {
        process.stderr.write(`Error: ${err.message}\n`);
        process.stderr.write(`Hint: ${err.hint}\n`);
      } else {
        process.stderr.write(`Error: ${(err as Error).message}\n`);
      }
      process.exit(1);
    }

    const exitCode = await executeCreate({
      description: draft.state.description,
      type,
      slug,
      cwd,
      noLlm,
      run,
      runtime,
      resume: draft,
    });

    if (exitCode !== 0) {
      process.exit(exitCode);
    }
    return;
  }

  // Normal create: description is required
  if (!description) {
    process.stderr.write(
      "Error: specrunner create requires a <description> argument.\n" +
      "Usage: specrunner create \"<description>\" [--type <type>] [--slug <slug>] [--no-llm] [--run]\n",
    );
    process.exit(2);
  }

  const type = options.type ?? "new-feature";
  const slug = options.slug ?? slugify(description);

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

  let runtime: Awaited<ReturnType<typeof bootstrap>>["runtime"];
  try {
    ({ runtime } = await bootstrap(cwd, repo));
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.stderr.write(`Hint: ${err.hint}\n`);
    } else {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
    }
    process.exit(1);
  }

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
