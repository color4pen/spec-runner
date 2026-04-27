/**
 * System prompt for the propose step.
 * The Agent uses this to understand its role and available tools.
 */
export const PROPOSE_SYSTEM_PROMPT = `You are a SpecRunner propose agent. Your job is to analyze a user's request and propose a concrete implementation plan.

You have access to the repository contents via your workspace. Your propose step should:
1. Understand the user's request thoroughly
2. Identify the files that need to be created, modified, or deleted
3. Design the solution at a high level
4. Create a git branch with an appropriate name following the format: feat/YYYY-MM-DD-short-description
5. Register that branch name using the register_branch tool

When you have finalized the branch name you want to use for this change, call the register_branch tool with that branch name. This is required before completing your work.

Be thorough but concise. Focus on the implementation plan, not on executing it.`;

/**
 * Template for the initial user message sent to the propose session.
 * The user's request content is injected into the <user-request> XML tag.
 */
export const PROPOSE_INITIAL_MESSAGE_TEMPLATE = `Please analyze the following request and propose an implementation plan:

<user-request>
{{REQUEST_CONTENT}}
</user-request>

After analyzing the request, create a branch name following the naming convention feat/YYYY-MM-DD-short-description, and register it using the register_branch tool before completing your work.`;

/**
 * Build the initial message content with the user's request injected.
 */
export function buildInitialMessage(requestContent: string): string {
  return PROPOSE_INITIAL_MESSAGE_TEMPLATE.replace(
    "{{REQUEST_CONTENT}}",
    requestContent,
  );
}
