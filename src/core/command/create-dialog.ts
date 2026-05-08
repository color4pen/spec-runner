/**
 * executeCreateDialog: interactive REPL for the `specrunner create` command.
 *
 * 4-phase structure (CommandRunner is NOT used — dialog is non-deterministic):
 *   1. initSession   — DynamicContext + patterns + system prompt
 *   2. dialogLoop    — while loop; each turn calls runtime.query(); stream text_deltas; detect FINAL_DRAFT
 *   3. detectCompletion — pure function: find <!-- FINAL_DRAFT --> marker in buffer
 *   4. finalize      — write request.md + validate + output path + delete draft
 *
 * Design D1: while loop with runtime.query() per turn.
 * Design D2: session_id explicitly tracked; 2nd+ turns use resume: sessionId.
 * Design D3: systemPrompt only on first query.
 * Design D5: executeCreateDialog is LocalRuntime-specific.
 * Uses instanceof LocalRuntime guard; exits with code 1 for ManagedRuntime.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { createInterface } from "readline/promises";
import { slugify, checkSlugCollision } from "../../util/slugify.js";
import { collectDynamicContext } from "../../git/dynamic-context.js";
import { collectRequestPatterns } from "../../context/request-patterns.js";
import {
  buildDialogSystemPrompt,
  buildDialogInitialMessage,
  buildResumeInitialMessage,
} from "../../prompts/create-dialog.js";
import { parseRequestMdContent } from "../../parser/request-md.js";
import { isStreamEvent, isTextDelta, isToolUseStart, isResultMessage } from "../../adapter/claude-code/message-types.js";
import { saveDraft, deleteDraft } from "../../state/draft-store.js";
import type { DraftState } from "../../state/draft-store.js";
import type { RuntimeStrategy, QueryOptions } from "../runtime/strategy.js";
import { LocalRuntime } from "../runtime/local.js";
import { SpecRunnerError } from "../../errors.js";
import { runRunCore } from "../../cli/run.js";
import { createSpinner } from "../../cli/spinner.js";

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

// ---------------------------------------------------------------------------
// D5: isLocalRuntime guard
// ---------------------------------------------------------------------------

/**
 * Check whether the given runtime is a LocalRuntime.
 * Interactive REPL requires LocalRuntime; ManagedRuntime's query() is a no-op.
 */
export function isLocalRuntime(runtime: RuntimeStrategy): runtime is LocalRuntime {
  return runtime instanceof LocalRuntime;
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
// consumeStream — streaming I/O for one query() call
// ---------------------------------------------------------------------------

interface StreamConsumerResult {
  textBuffer: string;
  hasAssistantMessage: boolean;
  sessionId: string | undefined;
}

/**
 * Consume all SDK messages from a single query() call, handling I/O side-effects:
 *   - text_delta: stop spinner, write text to stdout, accumulate in textBuffer
 *   - content_block_start (tool_use): stop spinner, write "[tool] name" to stderr
 *   - assistant message: stop spinner, write newline, call onAssistantComplete callback
 *   - result message: capture session_id and break
 *
 * The spinner is NOT restarted after tool_use display (chatter prevention).
 * The try/finally ensures spinner.stop() is called even on exception.
 */
async function consumeStream(
  messages: AsyncGenerator<unknown>,
  spinner: { start(): void; stop(): void },
  onAssistantComplete: (textBuffer: string) => Promise<void>,
): Promise<StreamConsumerResult> {
  let textBuffer = "";
  let hasAssistantMessage = false;
  let sessionId: string | undefined;
  let assistantTurnProcessed = false;

  try {
    for await (const msg of messages) {
      if (isStreamEvent(msg) && isTextDelta(msg)) {
        spinner.stop();
        const text = msg.event.delta.text;
        process.stdout.write(text);
        textBuffer += text;
      } else if (isToolUseStart(msg)) {
        spinner.stop();
        process.stderr.write(`\n[tool] ${msg.event.content_block.name}\n`);
      } else if (
        !assistantTurnProcessed &&
        typeof msg === "object" &&
        msg !== null &&
        (msg as Record<string, unknown>)["type"] === "assistant"
      ) {
        assistantTurnProcessed = true;
        hasAssistantMessage = true;
        spinner.stop();
        process.stdout.write("\n");
        await onAssistantComplete(textBuffer);
      } else if (isResultMessage(msg)) {
        sessionId = (msg as Record<string, unknown>)["session_id"] as string | undefined;
        break;
      }
    }
  } finally {
    spinner.stop();
  }

  return { textBuffer, hasAssistantMessage, sessionId };
}

// ---------------------------------------------------------------------------
// Phase 2: processAssistantTurn — handles a single completed assistant turn
// ---------------------------------------------------------------------------

interface AssistantTurnResult {
  /** The text accumulated during this turn */
  textBuffer: string;
  /** If FINAL_DRAFT was detected, the draft content; otherwise null */
  finalDraftContent: string | null;
  /** If a slug was proposed and validated, the new slug; otherwise unchanged */
  slug: string | undefined;
  /** If a slug collision message should be sent next turn */
  collisionFeedback: string | null;
  /** If user confirmed the draft (answered "y") */
  userConfirmed: boolean;
  /** True if an "assistant" type message was received (i.e., the LLM completed a turn) */
  hasAssistantMessage: boolean;
  /** session_id from result message, if received */
  sessionId: string | undefined;
}

/**
 * Process all SDK messages for one query() call.
 *
 * A single query() call emits:
 *   - stream_event messages (text deltas, tool events) during generation
 *   - One "assistant" message when the LLM turn completes
 *   - One "result" message at the very end (contains session_id)
 *
 * Streaming I/O is delegated to consumeStream(). This function focuses on
 * control flow: slug detection, FINAL_DRAFT detection, and user confirmation.
 */
async function processAssistantTurn(
  messages: AsyncGenerator<unknown>,
  params: {
    currentSlug: string | undefined;
    slugAlreadyKnown: boolean;
    slugProposalTurnCount: number;
    MAX_SLUG_PROPOSAL_TURNS: number;
    description: string;
    cwd: string;
    rl: { question(prompt: string): Promise<string>; close(): void };
    onDraftDetected?: (content: string) => Promise<void>;
  },
): Promise<AssistantTurnResult> {
  let finalDraftContent: string | null = null;
  let slug = params.currentSlug;
  let collisionFeedback: string | null = null;
  let userConfirmed = false;
  let slugProposalTurnCount = params.slugProposalTurnCount;

  // Task 3.1: Create spinner instance
  const spinner = createSpinner();

  // onAssistantComplete: control flow for slug detection / FINAL_DRAFT / user confirmation
  const onAssistantComplete = async (textBuffer: string): Promise<void> => {
    // Slug proposal detection (D2/D3)
    if (slug === undefined) {
      slugProposalTurnCount++;

      const proposed = detectSlugProposal(textBuffer);
      if (proposed !== null) {
        // Validate the proposed slug
        const normalized = slugify(proposed);
        let slugValid = normalized === proposed && proposed.length <= 50;

        if (slugValid) {
          // Collision check
          try {
            await checkSlugCollision(params.cwd, proposed);
          } catch {
            slugValid = false;
            process.stderr.write(`\nslug '${proposed}' はすでに使用されています。\n`);
            collisionFeedback = `slug '${proposed}' はすでに使用されています。別の slug を <!-- SLUG_PROPOSAL: xxx --> 形式で提案してください。`;
            return; // skip FINAL_DRAFT detection
          }
        }

        if (slugValid) {
          const answer = await params.rl.question(
            `\nslug: ${proposed} で良いですか？ [y/N] `,
          );
          if (answer.trim().toLowerCase() === "y") {
            slug = proposed;
            process.stderr.write(`slug を確定しました: ${slug}\n`);
          }
          return; // skip FINAL_DRAFT detection
        } else {
          // Invalid slug format
          process.stderr.write(
            `\n提案された slug '${proposed}' は無効です（kebab-case、50 文字以内）。別の slug を提案してください。\n`,
          );
          return; // skip FINAL_DRAFT detection
        }
      } else if (slugProposalTurnCount >= params.MAX_SLUG_PROPOSAL_TURNS) {
        // Fallback: auto-generate slug from description
        slug = slugify(params.description);
        process.stderr.write(`\nslug を自動生成しました: ${slug}\n`);
        // Fall through to FINAL_DRAFT detection
      }
      // else: no proposal yet, fall through (slug remains undefined)
    }

    const { detected, content } = detectCompletion(textBuffer);

    if (detected) {
      finalDraftContent = content;

      // Persist draft on each FINAL_DRAFT detection
      if (params.onDraftDetected !== undefined) {
        await params.onDraftDetected(content);
      }

      // Task 4.1: Show draft file path when slug is known
      if (slug !== undefined) {
        process.stderr.write(
          `\nrequest.md を作成しました: specrunner/requests/draft/${slug}/request.md\n`,
        );
      }

      // Ask user for confirmation
      const answer = await params.rl.question(
        "\nこの内容で request.md を書き出しますか？ [y/N] ",
      );

      if (answer.trim().toLowerCase() === "y") {
        userConfirmed = true;
      }
    }
  };

  // Task 3.2: Start spinner before consumeStream (query() already called, waiting for first event)
  spinner.start();

  const { textBuffer, hasAssistantMessage, sessionId } = await consumeStream(
    messages,
    spinner,
    onAssistantComplete,
  );

  return {
    textBuffer,
    finalDraftContent,
    slug,
    collisionFeedback,
    userConfirmed,
    hasAssistantMessage,
    sessionId,
  };
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

  // D5: Check for LocalRuntime capability
  if (!isLocalRuntime(runtime)) {
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
  const draftSessionId = randomUUID();
  const createdAt = new Date().toISOString();

  // Shared state: latest FINAL_DRAFT content
  const dialogState = { latestDraftContent: null as string | null };

  // Readline interface
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // SIGINT handler (D5)
  const sigintHandler = () => {
    if (currentSlug !== undefined && dialogState.latestDraftContent !== null) {
      const draftState: DraftState = {
        sessionId: draftSessionId,
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

  // onDraftDetected callback: persist draft when FINAL_DRAFT detected
  const onDraftDetected = async (content: string): Promise<void> => {
    dialogState.latestDraftContent = content;
    if (currentSlug !== undefined) {
      const draftState: DraftState = {
        sessionId: draftSessionId,
        slug: currentSlug,
        type,
        description,
        createdAt,
        updatedAt: new Date().toISOString(),
      };
      await saveDraft(cwd, currentSlug, content, draftState);
    }
  };

  // onExit callback: save draft when user types exit/quit
  const onExit = async (): Promise<void> => {
    const content = dialogState.latestDraftContent;
    if (content !== null && currentSlug !== undefined) {
      const draftState: DraftState = {
        sessionId: draftSessionId,
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
        sessionId: draftSessionId,
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
  // Track the SDK session_id for multi-turn resume
  let sdkSessionId: string | undefined;
  let isFirstTurn = true;

  try {
    // Determine initial prompt text
    let nextPrompt: string;

    if (resume !== undefined) {
      // Resume mode: show previous draft content to user
      process.stderr.write(`\n--- 前回の下書き ---\n${resume.content}\n--- ここまで ---\n\n`);

      if (resume.state.sessionId) {
        // Hot resume: re-enter the existing SDK session with a short prompt
        // D6: use resume: sessionId (not continue: true) for explicit session management
        nextPrompt = "(セッション再開)";
        // Use the stored session ID for hot resume
        sdkSessionId = resume.state.sessionId;
        isFirstTurn = false; // hot resume: not first turn (no systemPrompt)
      } else {
        // Cold start: inject previous draft into initial message
        nextPrompt = buildResumeInitialMessage(resume.content, resume.state);
        isFirstTurn = true; // cold start: first query (systemPrompt included)
      }
    } else {
      // Normal (non-resume) mode
      nextPrompt = buildDialogInitialMessage({
        description,
        type,
        slug: currentSlug,
        dynamicContext,
        patterns,
      });
      isFirstTurn = true;
    }

    // Dialog loop: each iteration is one LLM turn
    while (true) {
      // Build QueryOptions for this turn
      const queryOpts: QueryOptions = {
        cwd,
        allowedTools: ["Read", "Grep", "Glob"],
        includePartialMessages: true,
      };

      if (isFirstTurn) {
        // First turn: include systemPrompt; no resume/continue
        queryOpts.systemPrompt = systemPrompt;
      } else if (sdkSessionId !== undefined) {
        // Subsequent turns: resume with explicit session_id
        // D2: continue and resume are mutually exclusive — use resume only
        queryOpts.resume = sdkSessionId;
      }

      // Execute this turn
      const messages = runtime.query(nextPrompt, queryOpts) as AsyncGenerator<unknown>;

      const turnResult = await processAssistantTurn(messages, {
        currentSlug,
        slugAlreadyKnown,
        slugProposalTurnCount,
        MAX_SLUG_PROPOSAL_TURNS,
        description,
        cwd,
        rl,
        onDraftDetected,
      });

      // Update state from turn result
      currentSlug = turnResult.slug;
      slugProposalTurnCount = slugProposalTurnCount + 1;

      // Capture session_id from result message (first occurrence)
      // In the new architecture, every query() call ends with a result message,
      // so sessionEnded=true is normal. We use sessionId for the next turn's resume.
      if (turnResult.sessionId !== undefined) {
        sdkSessionId = turnResult.sessionId;
      }

      // After first turn, all subsequent turns are not "first"
      isFirstTurn = false;

      // If user confirmed FINAL_DRAFT, finalize and exit
      if (turnResult.userConfirmed && turnResult.finalDraftContent !== null) {
        finalizeContent = turnResult.finalDraftContent;
        break;
      }

      // If collision feedback, send it as the next turn's prompt (no user input needed)
      if (turnResult.collisionFeedback !== null) {
        nextPrompt = turnResult.collisionFeedback;
        continue;
      }

      // If no assistant message was received (e.g., SDK returned immediately with only a result),
      // treat it as an unexpected termination and stop.
      if (!turnResult.hasAssistantMessage) {
        // No LLM content was generated; stop the dialog
        break;
      }

      // Get next user input (after assistant turn)
      const input = await rl.question("> ");
      if (input.trim() === "exit" || input.trim() === "quit") {
        await onExit();
        break;
      }

      nextPrompt = input;
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

  // Exited via exit/quit (draft already saved by onExit) or session ended
  return 0;
}
