/**
 * executeCreateDialog: interactive REPL for the `specrunner create` command.
 *
 * 4-phase structure (CommandRunner is NOT used — dialog is non-deterministic):
 *   1. initSession   — DynamicContext + patterns + system prompt + queryInteractive()
 *   2. dialogLoop    — for await SDK messages; stream text_deltas; detect FINAL_DRAFT
 *   3. detectCompletion — pure function: find <!-- FINAL_DRAFT --> marker in buffer
 *   4. finalize      — write request.md + validate + output path + delete draft
 *
 * Design D7: queryInteractive() is LocalRuntime-specific.
 * Uses hasQueryInteractive() type guard; exits with code 1 for ManagedRuntime.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { createInterface } from "readline/promises";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { checkSlugCollision } from "../../util/slugify.js";
import { collectDynamicContext } from "../../git/dynamic-context.js";
import { collectRequestPatterns } from "../../context/request-patterns.js";
import { buildDialogSystemPrompt, buildDialogInitialMessage } from "../../prompts/create-dialog.js";
import { parseRequestMdContent } from "../../parser/request-md.js";
import { isStreamEvent, isTextDelta, isToolUseSummary } from "../../adapter/claude-code/message-types.js";
import { saveDraft, deleteDraft } from "../../state/draft-store.js";
import type { DraftState } from "../../state/draft-store.js";
import type { RuntimeStrategy, QueryOptions } from "../runtime/strategy.js";
import { SpecRunnerError } from "../../errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DialogParams {
  description: string;
  type: string;
  slug: string;
  cwd: string;
  runtime: RuntimeStrategy;
}

/** Minimal interface for the readline-like object used in createPromptGenerator. */
export interface ReadlineInterface {
  question(prompt: string): Promise<string>;
  close(): void;
}

/** Minimal interface for a runtime that supports interactive queries. */
interface RuntimeWithQueryInteractive extends RuntimeStrategy {
  queryInteractive(
    prompt: AsyncIterable<SDKUserMessage>,
    opts?: QueryOptions,
  ): AsyncIterable<unknown>;
}

// ---------------------------------------------------------------------------
// D7: hasQueryInteractive type guard
// ---------------------------------------------------------------------------

/**
 * Check whether the given runtime supports interactive (streaming generator) queries.
 * LocalRuntime implements queryInteractive(); ManagedRuntime does not.
 */
export function hasQueryInteractive(
  runtime: RuntimeStrategy,
): runtime is RuntimeWithQueryInteractive {
  return (
    typeof (runtime as RuntimeWithQueryInteractive).queryInteractive === "function"
  );
}

// ---------------------------------------------------------------------------
// Phase 3: detectCompletion (pure function)
// ---------------------------------------------------------------------------

const FINAL_DRAFT_MARKER = "<!-- FINAL_DRAFT -->";

/**
 * Scan a text buffer for the <!-- FINAL_DRAFT --> marker.
 * Returns { detected: true, content: <text after marker> } when found.
 * Returns { detected: false, content: "" } otherwise.
 */
export function detectCompletion(text: string): { detected: boolean; content: string } {
  const idx = text.indexOf(FINAL_DRAFT_MARKER);
  if (idx === -1) return { detected: false, content: "" };
  return { detected: true, content: text.slice(idx + FINAL_DRAFT_MARKER.length).trim() };
}

// ---------------------------------------------------------------------------
// Phase 1 helper: createPromptGenerator (D2)
// ---------------------------------------------------------------------------

/**
 * Async generator that feeds user messages to the SDK.
 *
 * - Yields the initial message immediately.
 * - Then loops: shows "> " prompt, reads user input, yields as SDKUserMessage.
 * - On "exit" / "quit": saves the latest draft (if any) and returns.
 *
 * @param initialMessage     - First user message (description + context).
 * @param rl                 - readline interface for user input.
 * @param getLatestDraft     - Returns current draft content; may be null before first FINAL_DRAFT.
 * @param onExit             - Called with draft content when user exits; used for persistence.
 */
export async function* createPromptGenerator(params: {
  initialMessage: SDKUserMessage;
  rl: ReadlineInterface;
  getLatestDraft: () => string | null;
  onExit: (content: string | null) => Promise<void>;
}): AsyncGenerator<SDKUserMessage> {
  const { initialMessage, rl, getLatestDraft, onExit } = params;

  // Phase 1: yield the initial context message
  yield initialMessage;

  // Phase 2: user input loop
  while (true) {
    const input = await rl.question("> ");

    if (input.trim() === "exit" || input.trim() === "quit") {
      // Save latest draft before exiting
      await onExit(getLatestDraft());
      return;
    }

    yield {
      type: "user",
      message: { role: "user", content: input },
      parent_tool_use_id: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Phase 4: finalize
// ---------------------------------------------------------------------------

/**
 * Write the final request.md to active/, validate it, delete the draft, and output the path.
 * Returns 0 on success, 1 on validation failure.
 */
export async function finalize(
  content: string,
  params: DialogParams,
): Promise<number> {
  const { type, slug, cwd } = params;

  // Validate with parseRequestMdContent
  let parsed: ReturnType<typeof parseRequestMdContent>;
  try {
    parsed = parseRequestMdContent(content, "<dialog-draft>");
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: Generated request.md is invalid: ${err.message}\n`);
      process.stderr.write(`Hint: ${err.hint}\n`);
    } else {
      process.stderr.write(
        `Error: Generated request.md is invalid: ${(err as Error).message}\n`,
      );
    }
    return 1;
  }

  // Check type/slug match
  if (parsed.type !== type) {
    process.stderr.write(
      `Error: request.md has type '${parsed.type}' but expected '${type}'.\n`,
    );
    return 1;
  }
  if (parsed.slug !== slug) {
    process.stderr.write(
      `Error: request.md has slug '${parsed.slug}' but expected '${slug}'.\n`,
    );
    return 1;
  }

  // Write to active/
  const requestDir = path.join(cwd, "specrunner", "requests", "active", slug);
  const requestMdPath = path.join(requestDir, "request.md");
  try {
    await fs.mkdir(requestDir, { recursive: true });
    await fs.writeFile(requestMdPath, content, "utf-8");
  } catch (err) {
    process.stderr.write(
      `Error: Failed to write request.md: ${(err as Error).message}\n`,
    );
    return 1;
  }

  // Delete draft (best-effort)
  await deleteDraft(cwd, slug);

  // Output path
  process.stdout.write(`${requestMdPath}\n`);

  return 0;
}

// ---------------------------------------------------------------------------
// Phase 1: initSession + Phase 2: dialogLoop + entrypoint
// ---------------------------------------------------------------------------

/**
 * Execute the interactive create dialog.
 * Returns 0 on success (finalized or exited), 1 on error.
 */
export async function executeCreateDialog(params: DialogParams): Promise<number> {
  const { description, type, slug, cwd, runtime } = params;

  // D7: Check for LocalRuntime capability
  if (!hasQueryInteractive(runtime)) {
    process.stderr.write("Error: Interactive mode requires local runtime.\n");
    process.stderr.write(
      "Hint: Run with a local runtime configuration or use --no-llm for scaffold mode.\n",
    );
    return 1;
  }

  // Check for slug collision
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

  // Collect DynamicContext + request patterns
  const [dynamicContext, patterns] = await Promise.all([
    collectDynamicContext(cwd, "main"),
    collectRequestPatterns(cwd, type),
  ]);

  // Build prompts
  const systemPrompt = buildDialogSystemPrompt();
  const initialUserText = buildDialogInitialMessage({
    description,
    type,
    slug,
    dynamicContext,
    patterns,
  });

  const initialSDKMessage: SDKUserMessage = {
    type: "user",
    message: { role: "user", content: initialUserText },
    parent_tool_use_id: null,
  };

  // Session metadata for draft persistence
  const sessionId = randomUUID();
  const createdAt = new Date().toISOString();

  // Shared state: latest FINAL_DRAFT content
  const dialogState = { latestDraftContent: null as string | null };

  // Readline interface
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // onExit callback: save draft when user types exit/quit
  const onExit = async (content: string | null): Promise<void> => {
    if (content !== null) {
      const draftState: DraftState = {
        sessionId,
        slug,
        type,
        description,
        createdAt,
        updatedAt: new Date().toISOString(),
      };
      await saveDraft(cwd, slug, content, draftState);
      process.stderr.write(`Draft saved to specrunner/requests/draft/${slug}/\n`);
    }
  };

  // Create the prompt generator
  const generator = createPromptGenerator({
    initialMessage: initialSDKMessage,
    rl,
    getLatestDraft: () => dialogState.latestDraftContent,
    onExit,
  });

  // Start interactive session via queryInteractive()
  const query = runtime.queryInteractive(generator, {
    systemPrompt,
    cwd,
    allowedTools: ["Read", "Grep", "Glob"],
    includePartialMessages: true,
  });

  // Dialog loop: process SDK messages
  let textBuffer = "";
  let finalizeContent: string | null = null;

  try {
    for await (const msg of query) {
      if (isStreamEvent(msg) && isTextDelta(msg)) {
        // Real-time streaming of text deltas
        const text = msg.event.delta.text;
        process.stdout.write(text);
        textBuffer += text;
      } else if (isToolUseSummary(msg)) {
        // Tool execution status
        process.stderr.write(`\n[tool] ${msg.summary}\n`);
      } else if (
        typeof msg === "object" &&
        msg !== null &&
        (msg as Record<string, unknown>)["type"] === "assistant"
      ) {
        // LLM response complete for this turn
        process.stdout.write("\n");

        const { detected, content } = detectCompletion(textBuffer);

        if (detected) {
          // Update shared draft state
          dialogState.latestDraftContent = content;

          // Persist draft on each FINAL_DRAFT detection (task 4.3)
          const draftState: DraftState = {
            sessionId,
            slug,
            type,
            description,
            createdAt,
            updatedAt: new Date().toISOString(),
          };
          await saveDraft(cwd, slug, content, draftState);

          // Ask user for confirmation (task 3.6)
          // This rl.question call happens BEFORE the generator's next rl.question("> ")
          // because we're still synchronously processing the "assistant" message.
          const answer = await rl.question(
            "\nこの内容で request.md を書き出しますか？ [y/N] ",
          );

          if (answer.trim().toLowerCase() === "y") {
            finalizeContent = content;
            break; // Exit the for-await loop; SDK session ends via generator termination
          }

          // Continue: reset buffer; generator will ask for next user input
          textBuffer = "";
        } else {
          // Normal response (no FINAL_DRAFT) — just reset buffer
          textBuffer = "";
        }
      } else if (
        typeof msg === "object" &&
        msg !== null &&
        (msg as Record<string, unknown>)["type"] === "result"
      ) {
        // Session ended (generator returned)
        break;
      }
    }
  } finally {
    rl.close();
  }

  // Phase 4: finalize if user confirmed
  if (finalizeContent !== null) {
    return await finalize(finalizeContent, params);
  }

  // Exited via exit/quit (draft already saved by generator's onExit) or session ended
  return 0;
}
