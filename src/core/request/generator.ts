import {
  query,
  type SDKMessage,
  type SDKResultMessage,
  type SDKResultSuccess,
} from "@anthropic-ai/claude-agent-sdk";
import { SpecRunnerError } from "../../errors.js";
import { slugify } from "../../util/slugify.js";
import { getStepExecutionConfig } from "../../config/step-config.js";
import { parseRequestMdContent } from "../../parser/request-md.js";
import { REQUEST_GENERATE_SYSTEM_PROMPT } from "../../prompts/request-generate-system.js";
import * as store from "./store.js";
import type { SpecRunnerConfig } from "../../config/schema.js";

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
  config: SpecRunnerConfig,
  queryFn: typeof query = query,
): Promise<GeneratedRequest> {
  // (a) Generate slug from input text
  const slug = slugify(text);

  // (b) Check slug collision
  await store.checkSlugCollision(cwd, slug);

  // (c) Resolve execution config
  const resolvedConfig = getStepExecutionConfig(config, "request-generate", {
    model: "claude-opus-4-5",
    maxTurns: 1,
    timeoutMs: 120_000,
  });

  // (d) Call queryFn
  const maxTurnsOption: Record<string, unknown> =
    resolvedConfig.maxTurns !== null ? { maxTurns: resolvedConfig.maxTurns } : {};

  // Timeout via AbortController
  const abortController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0) {
    timeoutId = setTimeout(() => abortController.abort(), resolvedConfig.timeoutMs);
  }

  let lastResult: SDKResultMessage | null = null;
  try {
    const messages = queryFn({
      prompt: buildGeneratePrompt(text),
      options: {
        cwd,
        allowedTools: [],
        permissionMode: "bypassPermissions",
        ...maxTurnsOption,
        model: resolvedConfig.model,
        systemPrompt: REQUEST_GENERATE_SYSTEM_PROMPT,
        abortController,
      },
    });

    // (e) Consume stream
    for await (const message of messages as AsyncGenerator<SDKMessage, void>) {
      if (message.type === "result") {
        lastResult = message as SDKResultMessage;
      }
    }
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }

  if (!lastResult || lastResult.subtype !== "success") {
    const subtype = lastResult?.subtype ?? "no-result";
    throw new SpecRunnerError(
      "GENERATE_SESSION_FAILED",
      "Check the session logs for more information.",
      `Generate session failed (${subtype})`,
    );
  }

  // (f) Get result text and replace placeholder slug
  let result = (lastResult as SDKResultSuccess).result;
  result = result.replace(/<generated-slug>/g, slug);

  // (g) Validate with parseRequestMdContent
  try {
    parseRequestMdContent(result, "<generated>");
  } catch (err) {
    throw new SpecRunnerError(
      "REQUEST_MD_INVALID",
      "The LLM-generated request.md failed validation. Try again with a more descriptive input.",
      err instanceof Error ? err.message : String(err),
    );
  }

  // (h) Save to store
  await store.write(cwd, slug, result);

  // (i) Return
  return { slug, content: result };
}
