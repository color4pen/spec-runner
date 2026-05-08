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
import { executeCreateDialog } from "../core/command/create-dialog.js";
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

  let exitCode: number;

  if (noLlm) {
    // --no-llm: use scaffold template (non-interactive, existing path)
    exitCode = await executeCreate({
      description,
      type,
      slug,
      cwd,
      noLlm: true,
      run,
      runtime,
    });
  } else {
    // Default: interactive REPL
    // TODO: --run flag is ignored in interactive mode; add post-dialog run support in a future change
    exitCode = await executeCreateDialog({
      description,
      type,
      slug,
      cwd,
      runtime,
    });
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}
