/**
 * executeCreate: core logic for the `specrunner create` command.
 *
 * Flow:
 *   slug → collision check → DynamicContext → request patterns → LLM query
 *   → extract content → write request.md → validate → output path → optional run
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { checkSlugCollision } from "../../util/slugify.js";
import { collectDynamicContext } from "../../git/dynamic-context.js";
import { collectRequestPatterns } from "../../context/request-patterns.js";
import { buildCreateSystemPrompt, buildCreateUserMessage } from "../../prompts/create-system.js";
import { parseRequestMdContent } from "../../parser/request-md.js";
import { runRunCore } from "../../cli/run.js";
import type { RuntimeStrategy } from "../runtime/strategy.js";
import { SpecRunnerError } from "../../errors.js";
import { isResultMessage } from "../../adapter/claude-code/message-types.js";

export { isResultMessage };

export interface CreateParams {
  description: string;
  type: string;
  slug: string;
  cwd: string;
  noLlm: boolean;
  run: boolean;
  runtime: RuntimeStrategy;
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
 * Extract valid request.md content from a stream of LLM messages.
 *
 * 3-tier fallback:
 *   1. Parse whole response with parseRequestMdContent → return as-is if valid
 *   2. Extract ```markdown ... ``` or ``` ... ``` block → parse → return block content if valid
 *   3. Throw error
 */
export async function extractRequestContent(
  messages: AsyncGenerator<unknown>,
): Promise<string> {
  let rawResult: string | null = null;

  for await (const msg of messages) {
    if (isResultMessage(msg) && typeof msg.result === "string") {
      rawResult = msg.result;
    }
  }

  if (rawResult === null) {
    throw new SpecRunnerError(
      "CREATE_NO_RESULT",
      "The LLM did not return a result message. Try again or use --no-llm.",
      "LLM query returned no result message.",
    );
  }

  // Tier 1: Try to parse the whole response
  try {
    parseRequestMdContent(rawResult, "<llm-response>");
    return rawResult;
  } catch {
    // Fall through to tier 2
  }

  // Tier 2: Extract ```markdown ... ``` or ``` ... ``` block
  const codeBlockPattern = /```(?:markdown)?\n([\s\S]*?)```/;
  const match = codeBlockPattern.exec(rawResult);
  if (match?.[1]) {
    const extracted = match[1];
    try {
      parseRequestMdContent(extracted, "<extracted-block>");
      return extracted;
    } catch {
      // Fall through to tier 3
    }
  }

  // Tier 3: Error
  throw new SpecRunnerError(
    "CREATE_INVALID_RESPONSE",
    "The LLM response could not be parsed as a valid request.md. Try again or use --no-llm.",
    "Failed to extract valid request.md content from LLM response.",
  );
}

/**
 * Execute the create command.
 * Returns 0 on success, 1 on error.
 */
export async function executeCreate(params: CreateParams): Promise<number> {
  const { description, type, slug, cwd, noLlm, run, runtime } = params;

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

  let content: string;

  if (noLlm) {
    // Step b: --no-llm mode — use scaffold template
    content = buildScaffoldTemplate({ title: description, type, slug });
  } else {
    // Step c: Collect DynamicContext
    const dynamicContext = await collectDynamicContext(cwd, "main");

    // Step d: Collect request patterns
    const patterns = await collectRequestPatterns(cwd, type);

    // Step e: Build prompts
    const systemPrompt = buildCreateSystemPrompt();
    const userMessage = buildCreateUserMessage({
      description,
      type,
      slug,
      dynamicContext,
      patterns,
    });

    // Step f: Query LLM
    let messages: AsyncGenerator<unknown>;
    try {
      messages = runtime.query(userMessage, {
        systemPrompt,
        cwd,
        model: "claude-opus-4-6",
        allowedTools: ["Read", "Grep", "Glob"],
      });
    } catch (err) {
      process.stderr.write(`Error: LLM query failed: ${(err as Error).message}\n`);
      return 1;
    }

    // Step g: Extract content
    try {
      content = await extractRequestContent(messages);
    } catch (err) {
      if (err instanceof SpecRunnerError) {
        process.stderr.write(`Error: ${err.message}\n`);
        process.stderr.write(`Hint: ${err.hint}\n`);
      } else {
        process.stderr.write(`Error: ${(err as Error).message}\n`);
      }
      return 1;
    }
  }

  // Step h: Write request.md
  try {
    await fs.mkdir(requestDir, { recursive: true });
    await fs.writeFile(requestMdPath, content, "utf-8");
  } catch (err) {
    process.stderr.write(`Error: Failed to write request.md: ${(err as Error).message}\n`);
    return 1;
  }

  // Step i: Validate with parseRequestMdContent
  // Also check that type/slug match the input params (spec-review finding #2)
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

  // Step j: Output path
  process.stdout.write(`${requestMdPath}\n`);

  // Step k: Run pipeline if --run
  if (run) {
    return await runRunCore(requestMdPath, { cwd });
  }

  return 0;
}
