import { SpecRunnerError } from "../../errors.js";
import { slugify } from "../../util/slugify.js";
import { parseRequestMdContent } from "../../parser/request-md.js";
import { REQUEST_GENERATE_SYSTEM_PROMPT } from "../../prompts/request-generate-system.js";
import type { OneShotQueryClient } from "../port/one-shot-query-client.js";
import * as store from "./store.js";

export interface GeneratedRequest {
  slug: string;
  content: string;
}

export function buildGeneratePrompt(text: string): string {
  return `以下のテキストから request.md を生成してください:\n\n<input>\n${text}\n</input>`;
}

export async function generate(
  text: string,
  cwd: string,
  client: OneShotQueryClient,
): Promise<GeneratedRequest> {
  // (a) Generate slug from input text
  const slug = slugify(text);

  // (b) Check slug collision
  await store.checkSlugCollision(cwd, slug);

  // (c) Call client.run()
  let result: string;
  try {
    const queryResult = await client.run({
      systemPrompt: REQUEST_GENERATE_SYSTEM_PROMPT,
      prompt: buildGeneratePrompt(text),
      allowedTools: [],
      maxTurns: 1,
      timeoutMs: 120_000,
      cwd,
      stepName: "request-generate",
      model: "claude-opus-4-5",
    });
    result = queryResult.text;
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      throw new SpecRunnerError(
        "GENERATE_SESSION_FAILED",
        "Check the session logs for more information.",
        err.message,
      );
    }
    throw new SpecRunnerError(
      "GENERATE_SESSION_FAILED",
      "Check the session logs for more information.",
      `Generate session failed: ${(err as Error).message}`,
    );
  }

  // (d) Replace placeholder slug
  result = result.replace(/<generated-slug>/g, slug);

  // (e) Validate with parseRequestMdContent
  try {
    parseRequestMdContent(result, "<generated>");
  } catch (err) {
    throw new SpecRunnerError(
      "REQUEST_MD_INVALID",
      "The LLM-generated request.md failed validation. Try again with a more descriptive input.",
      err instanceof Error ? err.message : String(err),
    );
  }

  // (f) Save to store
  await store.write(cwd, slug, result);

  // (g) Return
  return { slug, content: result };
}
