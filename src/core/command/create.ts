/**
 * executeCreate: core logic for the `specrunner create` command.
 *
 * Flow:
 *   --no-llm: slug → collision check → scaffold template → write → validate → output path
 *   default:  delegate to executeCreateDialog() (interactive REPL)
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { checkSlugCollision } from "../../util/slugify.js";
import { parseRequestMdContent } from "../../parser/request-md.js";
import { runRunCore } from "../../cli/run.js";
import { executeCreateDialog } from "./create-dialog.js";
import type { RuntimeStrategy } from "../runtime/strategy.js";
import type { DraftState } from "../../state/draft-store.js";
import { SpecRunnerError } from "../../errors.js";

export interface CreateParams {
  description: string;
  type: string;
  slug?: string;
  cwd: string;
  noLlm: boolean;
  run: boolean;
  runtime: RuntimeStrategy;
  resume?: { content: string; state: DraftState };
}

/**
 * Build a scaffold template for --no-llm mode.
 */
export function buildScaffoldTemplate(params: {
  title: string;
  type: string;
  slug: string;
}): string {
  const { title, type, slug } = params;
  return `# ${title}

## Meta

- **type**: ${type}
- **slug**: ${slug}

## 背景

<変更の背景・動機を説明してください>

## 要件

1. <要件 1>

## スコープ外

- <スコープ外の項目>

## 受け入れ基準

- [ ] <基準 1>
- [ ] \`bun run typecheck && bun run test\` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
`;
}

/**
 * Execute the create command.
 * Returns 0 on success, 1 on error.
 *
 * --no-llm: scaffold template mode (non-interactive)
 * default:  delegates to executeCreateDialog() (interactive REPL)
 */
export async function executeCreate(params: CreateParams): Promise<number> {
  const { description, type, cwd, noLlm, run, runtime, resume } = params;

  if (noLlm) {
    // --no-llm mode: use scaffold template directly
    // slug is required for --no-llm mode; fall back to resume slug if available
    const slug = params.slug ?? resume?.state.slug;
    if (!slug) {
      process.stderr.write("Error: --no-llm mode requires a --slug argument.\n");
      return 1;
    }

    // Step a: Check for slug collision
    try {
      await checkSlugCollision(cwd, slug);
    } catch (err) {
      if (err instanceof SpecRunnerError) {
        process.stderr.write(`Error: ${err.message}\n`);
        process.stderr.write(`Hint: ${err.hint}\n`);
      } else {
        process.stderr.write(`Error: ${(err as Error).message}\n`);
      }
      return 1;
    }

    const requestDir = path.join(cwd, "specrunner", "requests", "active", slug);
    const requestMdPath = path.join(requestDir, "request.md");

    // Step b: --no-llm mode — use scaffold template
    const content = buildScaffoldTemplate({ title: description, type, slug });

    // Step c: Write request.md
    try {
      await fs.mkdir(requestDir, { recursive: true });
      await fs.writeFile(requestMdPath, content, "utf-8");
    } catch (err) {
      process.stderr.write(`Error: Failed to write request.md: ${(err as Error).message}\n`);
      return 1;
    }

    // Step d: Validate with parseRequestMdContent
    try {
      const parsed = parseRequestMdContent(content, requestMdPath);
      if (parsed.type !== type) {
        process.stderr.write(
          `Error: Generated request.md has type '${parsed.type}' but expected '${type}'.\n`,
        );
        return 1;
      }
      if (parsed.slug !== slug) {
        process.stderr.write(
          `Error: Generated request.md has slug '${parsed.slug}' but expected '${slug}'.\n`,
        );
        return 1;
      }
    } catch (err) {
      if (err instanceof SpecRunnerError) {
        process.stderr.write(`Error: Generated request.md is invalid: ${err.message}\n`);
        process.stderr.write(`Hint: ${err.hint}\n`);
      } else {
        process.stderr.write(`Error: Generated request.md is invalid: ${(err as Error).message}\n`);
      }
      return 1;
    }

    // Step e: Output path
    process.stdout.write(`${requestMdPath}\n`);

    // Step f: Run pipeline if --run
    if (run) {
      return await runRunCore(requestMdPath, { cwd });
    }

    return 0;
  }

  // Default: delegate to interactive dialog
  return executeCreateDialog({
    description,
    type,
    slug: params.slug,
    cwd,
    runtime,
    run,
    resume,
  });
}
