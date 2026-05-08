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
import { slugify, checkSlugCollision } from "../../util/slugify.js";
import { collectDynamicContext } from "../../git/dynamic-context.js";
import { collectRequestPatterns } from "../../context/request-patterns.js";
import {
  buildDialogSystemPrompt,
  buildDialogInitialMessage,
  buildResumeInitialMessage,
} from "../../prompts/create-dialog.js";
import { parseRequestMdContent } from "../../parser/request-md.js";
import { isStreamEvent, isTextDelta, isToolUseSummary } from "../../adapter/claude-code/message-types.js";
import { saveDraft, deleteDraft } from "../../state/draft-store.js";
import type { DraftState } from "../../state/draft-store.js";
import type { RuntimeStrategy, QueryOptions } from "../runtime/strategy.js";
import { SpecRunnerError } from "../../errors.js";
import { runRunCore } from "../../cli/run.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DialogParams {
  description: string;
  type: string;
  slug?: string;
  cwd: string;
  runtime: RuntimeStrategy;
  run?: boolean;
  resume?: { content: string; state: DraftState };
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
// Slug proposal detection (D2)
// ---------------------------------------------------------------------------

const SLUG_PROPOSAL_RE = /<!--\s*SLUG_PROPOSAL:\s*(\S+)\s*-->/g;

/**
 * Detect a slug proposal marker in an assistant response.
 * Returns the last detected slug, or null if none found.
 */
export function detectSlugProposal(text: string): string | null {
  let lastMatch: string | null = null;
  const re = new RegExp(SLUG_PROPOSAL_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    lastMatch = match[1] ?? null;
  }
  return lastMatch;
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
  getPendingMessage: () => string | null;
}): AsyncGenerator<SDKUserMessage> {
  const { initialMessage, rl, getLatestDraft, onExit, getPendingMessage } = params;

  // Phase 1: yield the initial context message
  yield initialMessage;

  // Phase 2: user input loop
  while (true) {
    const pending = getPendingMessage();
    const input = pending ?? await rl.question("> ");

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
 * Returns { exitCode, requestMdPath } on success (exitCode 0), { exitCode: 1 } on validation failure.
 */
export async function finalize(
  content: string,
  params: DialogParams,
): Promise<{ exitCode: number; requestMdPath?: string }> {
  const { type, cwd } = params;
  // slug must be confirmed at this point
  const slug = params.slug!;

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
    return { exitCode: 1 };
  }

  // Check type/slug match
  if (parsed.type !== type) {
    process.stderr.write(
      `Error: request.md has type '${parsed.type}' but expected '${type}'.\n`,
    );
    return { exitCode: 1 };
  }
  if (parsed.slug !== slug) {
    process.stderr.write(
      `Error: request.md has slug '${parsed.slug}' but expected '${slug}'.\n`,
    );
    return { exitCode: 1 };
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
    return { exitCode: 1 };
  }

  // Delete draft (best-effort)
  await deleteDraft(cwd, slug);

  // Output path
  process.stdout.write(`${requestMdPath}\n`);

  return { exitCode: 0, requestMdPath };
}

// ---------------------------------------------------------------------------
// Phase 1: initSession + Phase 2: dialogLoop + entrypoint
// ---------------------------------------------------------------------------

/**
 * Execute the interactive create dialog.
 * Returns 0 on success (finalized or exited), 1 on error.
 */
export async function executeCreateDialog(params: DialogParams): Promise<number> {
  const { description, type, cwd, runtime, resume } = params;

  // D7: Check for LocalRuntime capability
  if (!hasQueryInteractive(runtime)) {
    process.stderr.write("Error: Interactive mode requires local runtime.\n");
    process.stderr.write(
      "Hint: Run with a local runtime configuration or use --no-llm for scaffold mode.\n",
    );
    return 1;
  }

  // Determine if slug is already known
  // slug is known if explicitly provided (params.slug) or coming from a resume draft
  const initialSlug = params.slug ?? resume?.state.slug;

  // Only check collision if slug is already known
  if (initialSlug !== undefined) {
    try {
      await checkSlugCollision(cwd, initialSlug);
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

  // Collect DynamicContext + request patterns
  const [dynamicContext, patterns] = await Promise.all([
    collectDynamicContext(cwd, "main"),
    collectRequestPatterns(cwd, type),
  ]);

  // Slug proposal tracking
  // If slug is already known, skip proposal phase
  const slugAlreadyKnown = initialSlug !== undefined;
  let currentSlug: string | undefined = initialSlug;
  let slugProposalTurnCount = 0;
  const MAX_SLUG_PROPOSAL_TURNS = 3;

  // Build prompts
  const needSlugProposal = !slugAlreadyKnown;
  const systemPrompt = buildDialogSystemPrompt({ needSlugProposal });

  // Session metadata for draft persistence
  const sessionId = randomUUID();
  const createdAt = new Date().toISOString();

  // Shared state: latest FINAL_DRAFT content + pending auto-message for LLM feedback
  const dialogState = { latestDraftContent: null as string | null };
  let pendingAutoMessage: string | null = null;
  const getPendingMessage = (): string | null => {
    const msg = pendingAutoMessage;
    pendingAutoMessage = null;
    return msg;
  };

  // Readline interface
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // SIGINT handler (D5)
  const sigintHandler = () => {
    if (currentSlug !== undefined && dialogState.latestDraftContent !== null) {
      const draftState: DraftState = {
        sessionId,
        slug: currentSlug,
        type,
        description,
        createdAt,
        updatedAt: new Date().toISOString(),
      };
      // Use sync write as best-effort (async completion not guaranteed in signal handler)
      saveDraft(cwd, currentSlug, dialogState.latestDraftContent, draftState).then(() => {
        process.stderr.write(`\nDraft saved to specrunner/requests/draft/${currentSlug}/\n`);
        process.exit(130);
      }).catch(() => {
        process.exit(130);
      });
    } else {
      process.exit(130);
    }
  };
  process.on("SIGINT", sigintHandler);

  // onExit callback: save draft when user types exit/quit
  const onExit = async (content: string | null): Promise<void> => {
    if (content !== null && currentSlug !== undefined) {
      const draftState: DraftState = {
        sessionId,
        slug: currentSlug,
        type,
        description,
        createdAt,
        updatedAt: new Date().toISOString(),
      };
      await saveDraft(cwd, currentSlug, content, draftState);
      process.stderr.write(`Draft saved to specrunner/requests/draft/${currentSlug}/\n`);
    }
  };

  // readline close handler (D5)
  rl.on("close", () => {
    if (currentSlug !== undefined && dialogState.latestDraftContent !== null) {
      // best-effort, fire-and-forget
      const draftState: DraftState = {
        sessionId,
        slug: currentSlug,
        type,
        description,
        createdAt,
        updatedAt: new Date().toISOString(),
      };
      saveDraft(cwd, currentSlug, dialogState.latestDraftContent, draftState).catch(() => {
        // ignore errors in close handler
      });
    }
  });

  let finalizeContent: string | null = null;

  try {
    // Determine initial SDK message and query
    let query: AsyncIterable<unknown>;

    if (resume !== undefined) {
      // Resume mode: show previous draft content to user
      process.stderr.write(`\n--- 前回の下書き ---\n${resume.content}\n--- ここまで ---\n\n`);

      // Hot resume attempt
      let hotResumeQuery: AsyncIterable<unknown> | null = null;
      if (resume.state.sessionId) {
        try {
          // For hot resume, we use a generator that re-enters the existing session
          const hotRl = rl;
          const hotDialogState = dialogState;
          const hotOnExit = onExit;
          async function* hotResumeGenerator(): AsyncGenerator<SDKUserMessage> {
            // Yield a minimal message to re-enter the session
            yield {
              type: "user",
              message: { role: "user", content: "(セッション再開)" },
              parent_tool_use_id: null,
            };
            // Then normal user input loop
            while (true) {
              const input = await hotRl.question("> ");
              if (input.trim() === "exit" || input.trim() === "quit") {
                await hotOnExit(hotDialogState.latestDraftContent);
                return;
              }
              yield {
                type: "user",
                message: { role: "user", content: input },
                parent_tool_use_id: null,
              };
            }
          }

          hotResumeQuery = runtime.queryInteractive(hotResumeGenerator(), {
            resume: resume.state.sessionId,
            systemPrompt,
            cwd,
            allowedTools: ["Read", "Grep", "Glob"],
            includePartialMessages: true,
          });
        } catch {
          process.stderr.write("セッションを復旧できなかったため新規開始します\n");
        }
      }

      if (hotResumeQuery !== null) {
        query = hotResumeQuery;
      } else {
        // Cold start: inject previous draft into initial message
        const coldInitialText = buildResumeInitialMessage(resume.content, resume.state);
        const coldInitialMsg: SDKUserMessage = {
          type: "user",
          message: { role: "user", content: coldInitialText },
          parent_tool_use_id: null,
        };

        const coldGenerator = createPromptGenerator({
          initialMessage: coldInitialMsg,
          rl,
          getLatestDraft: () => dialogState.latestDraftContent,
          onExit,
          getPendingMessage,
        });

        query = runtime.queryInteractive(coldGenerator, {
          systemPrompt,
          cwd,
          allowedTools: ["Read", "Grep", "Glob"],
          includePartialMessages: true,
        });
      }
    } else {
      // Normal (non-resume) mode
      const initialUserText = buildDialogInitialMessage({
        description,
        type,
        slug: currentSlug,
        dynamicContext,
        patterns,
      });

      const initialSDKMessage: SDKUserMessage = {
        type: "user",
        message: { role: "user", content: initialUserText },
        parent_tool_use_id: null,
      };

      const generator = createPromptGenerator({
        initialMessage: initialSDKMessage,
        rl,
        getLatestDraft: () => dialogState.latestDraftContent,
        onExit,
        getPendingMessage,
      });

      query = runtime.queryInteractive(generator, {
        systemPrompt,
        cwd,
        allowedTools: ["Read", "Grep", "Glob"],
        includePartialMessages: true,
      });
    }

    // Dialog loop: process SDK messages
    let textBuffer = "";

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

        // Slug proposal detection (D2/D3)
        if (currentSlug === undefined) {
          slugProposalTurnCount++;

          const proposed = detectSlugProposal(textBuffer);
          if (proposed !== null) {
            // Validate the proposed slug
            const normalized = slugify(proposed);
            let slugValid = normalized === proposed && proposed.length <= 50;

            if (slugValid) {
              // Collision check
              try {
                await checkSlugCollision(cwd, proposed);
              } catch {
                slugValid = false;
                process.stderr.write(`\nslug '${proposed}' はすでに使用されています。\n`);
                pendingAutoMessage = `slug '${proposed}' はすでに使用されています。別の slug を <!-- SLUG_PROPOSAL: xxx --> 形式で提案してください。`;
                textBuffer = "";
                continue;
              }
            }

            if (slugValid) {
              const answer = await rl.question(
                `\nslug: ${proposed} で良いですか？ [y/N] `,
              );
              if (answer.trim().toLowerCase() === "y") {
                currentSlug = proposed;
                process.stderr.write(`slug を確定しました: ${currentSlug}\n`);
                textBuffer = "";
                continue;
              } else {
                // User rejected: continue (LLM will propose another in next turn)
                textBuffer = "";
                continue;
              }
            } else {
              // Invalid slug format
              process.stderr.write(
                `\n提案された slug '${proposed}' は無効です（kebab-case、50 文字以内）。別の slug を提案してください。\n`,
              );
              textBuffer = "";
              continue;
            }
          } else if (slugProposalTurnCount >= MAX_SLUG_PROPOSAL_TURNS) {
            // Fallback: auto-generate slug from description
            currentSlug = slugify(description);
            process.stderr.write(`\nslug を自動生成しました: ${currentSlug}\n`);
          }
        }

        const { detected, content } = detectCompletion(textBuffer);

        if (detected) {
          // Update shared draft state
          dialogState.latestDraftContent = content;

          // Persist draft on each FINAL_DRAFT detection (only if slug is confirmed)
          if (currentSlug !== undefined) {
            const draftState: DraftState = {
              sessionId,
              slug: currentSlug,
              type,
              description,
              createdAt,
              updatedAt: new Date().toISOString(),
            };
            await saveDraft(cwd, currentSlug, content, draftState);
          }

          // Ask user for confirmation
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
    process.removeListener("SIGINT", sigintHandler);
  }

  // Phase 4: finalize if user confirmed
  if (finalizeContent !== null) {
    // Ensure slug is set before finalizing
    if (currentSlug === undefined) {
      currentSlug = slugify(description);
      process.stderr.write(`slug を自動生成しました: ${currentSlug}\n`);
    }

    const paramsWithSlug: DialogParams = { ...params, slug: currentSlug };
    const result = await finalize(finalizeContent, paramsWithSlug);

    if (result.exitCode !== 0) {
      return result.exitCode;
    }

    // --run support (D6)
    if (params.run === true && result.requestMdPath !== undefined) {
      return await runRunCore(result.requestMdPath, { cwd });
    } else if (params.run !== true && result.requestMdPath !== undefined) {
      // Ask user if they want to run the pipeline
      const runRl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const runAnswer = await runRl.question("specrunner run を実行しますか？ [y/N] ");
        if (runAnswer.trim().toLowerCase() === "y") {
          return await runRunCore(result.requestMdPath, { cwd });
        }
      } finally {
        runRl.close();
      }
    }

    return 0;
  }

  // Exited via exit/quit (draft already saved by generator's onExit) or session ended
  return 0;
}
