/**
 * Completion directive for the Claude Code local runtime.
 *
 * Builds a provider-specific instruction that tells the agent to call the
 * report_result MCP tool before ending its turn. This is injected into the
 * first-turn prompt by ClaudeCodeRunner and must NOT appear in core prompt
 * builders (buildAdditionalInstructions, prompt-builder.ts) to prevent
 * leaking MCP-specific tool names into managed/codex adapter paths.
 *
 * Provider neutrality contract:
 * - Core prompts use the generic COMPLETION_DIRECTIVE (report-tool.ts).
 * - This module is adapter-local: only ClaudeCodeRunner imports it.
 */

/**
 * Build a first-turn completion directive that instructs the agent to call
 * the given MCP report_result tool before ending its turn.
 *
 * @param mcpToolName - Full MCP tool name, e.g. "mcp__specrunner_report__report_result".
 *   Must be the same name used in allowedTools (adapter-runner.ts :428).
 * @returns A directive string to append to the first-turn fullPrompt.
 */
export function buildReportToolCompletionDirective(mcpToolName: string): string {
  return `\nIMPORTANT: You MUST call the \`${mcpToolName}\` tool before ending your turn to report your result. Do not end your turn without calling this tool first.`;
}
