// Custom Tool Handler — no 'use server' directive.
// Pure lib module called from API Routes (SSE stream route).
// Uses direct DB queries — does NOT call Server Actions (API Route execution context).

import { getDb } from './db';
import { requests } from './db/schema';
import { eq } from 'drizzle-orm';
import { getAnthropicClient } from './anthropic';

// Validation regex for kebab-case slug: lowercase alphanumeric words separated by hyphens.
// Anchors are required for validation (not extraction).
const KEBAB_CASE_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const TOOL_HANDLER_TIMEOUT_MS = 30_000;

export interface CustomToolUseInput {
  /** Unique ID of the agent.custom_tool_use event */
  customToolUseId: string;
  /** Tool name */
  name: string;
  /** Raw input from the agent */
  input: Record<string, unknown>;
}

interface ToolResult {
  content: string;
  isError: boolean;
}

/**
 * Validate and execute the register_branch Custom Tool.
 * Updates requests.branch_name in DB with the agent-reported value.
 *
 * @param input - Tool input from the agent
 * @param sessionRequestId - requestId of the session (for ownership verification)
 */
async function handleRegisterBranch(
  input: Record<string, unknown>,
  sessionRequestId: number
): Promise<ToolResult> {
  const { slug, branch_name, request_id } = input;

  // Validate slug: non-empty string matching kebab-case pattern
  if (typeof slug !== 'string' || slug.trim() === '') {
    return { content: 'Invalid input: slug must be a non-empty string', isError: true };
  }
  if (!KEBAB_CASE_REGEX.test(slug.trim())) {
    return {
      content:
        'Invalid input: slug must be in kebab-case format (lowercase alphanumeric with hyphens, no leading/trailing hyphens)',
      isError: true,
    };
  }

  // Validate branch_name: non-empty string
  if (typeof branch_name !== 'string' || branch_name.trim() === '') {
    return { content: 'Invalid input: branch_name must be a non-empty string', isError: true };
  }

  // Validate request_id: positive integer
  if (typeof request_id !== 'number' || !Number.isInteger(request_id) || request_id <= 0) {
    return { content: 'Invalid input: request_id must be a positive integer', isError: true };
  }

  // Ownership verification: request_id must match the session's requestId
  if (request_id !== sessionRequestId) {
    return {
      content: 'Invalid input: request_id does not match the current session request',
      isError: true,
    };
  }

  const db = getDb();

  // Check request exists
  const existing = await db
    .select({ id: requests.id })
    .from(requests)
    .where(eq(requests.id, request_id));

  if (existing.length === 0) {
    return { content: 'Request not found', isError: true };
  }

  // Update branch_name (last-write-wins semantics — supports agent retries)
  const now = new Date().toISOString();
  await db
    .update(requests)
    .set({ branchName: branch_name.trim(), updatedAt: now })
    .where(eq(requests.id, request_id));

  return {
    content: JSON.stringify({
      success: true,
      branch_name: branch_name.trim(),
      slug: slug.trim(),
      message: 'Branch registered successfully',
    }),
    isError: false,
  };
}

// Dispatcher map: tool name -> handler function
const TOOL_HANDLERS: Record<
  string,
  (input: Record<string, unknown>, sessionRequestId: number) => Promise<ToolResult>
> = {
  register_branch: handleRegisterBranch,
};

/**
 * Dispatch a Custom Tool Use event to the appropriate handler and send the result
 * back to the Anthropic API via user.custom_tool_result.
 *
 * Does NOT throw — all errors are converted to tool result error messages to prevent
 * session hanging in idle state.
 *
 * @param sessionDbId - DB id of the session (for context)
 * @param managedSessionId - Managed session ID (for API calls)
 * @param sessionRequestId - requestId from the session record (for ownership verification)
 * @param toolInput - The Custom Tool Use event data
 */
export async function handleCustomToolUse(
  sessionDbId: number,
  managedSessionId: string,
  sessionRequestId: number,
  toolInput: CustomToolUseInput
): Promise<void> {
  const client = getAnthropicClient();

  let result: ToolResult;

  try {
    const handler = TOOL_HANDLERS[toolInput.name];

    if (!handler) {
      result = {
        content: `Unknown tool: "${toolInput.name}". Registered tools: ${Object.keys(TOOL_HANDLERS).join(', ')}`,
        isError: true,
      };
    } else {
      // Execute handler with timeout
      const handlerPromise = handler(toolInput.input, sessionRequestId);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Tool handler timed out after ${TOOL_HANDLER_TIMEOUT_MS / 1000} seconds`)),
          TOOL_HANDLER_TIMEOUT_MS
        )
      );

      result = await Promise.race([handlerPromise, timeoutPromise]);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during tool execution';
    result = { content: message, isError: true };
  }

  // Send user.custom_tool_result back to Anthropic API
  // This resumes the session from idle/requires_action state
  await client.beta.sessions.events.send(managedSessionId, {
    events: [
      {
        type: 'user.custom_tool_result',
        custom_tool_use_id: toolInput.customToolUseId,
        content: [
          {
            type: 'text',
            text: result.content,
          },
        ],
        is_error: result.isError,
      },
    ],
  });

  // Log for observability (not debugging - intentional production log)
  if (result.isError) {
    console.error(
      `[custom-tool-handler] Tool "${toolInput.name}" returned error for session ${sessionDbId}:`,
      result.content
    );
  }
}
