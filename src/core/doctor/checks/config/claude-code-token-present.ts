/**
 * Check that a Claude Code OAuth token is available for headless local runs.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";

export const claudeCodeTokenPresentCheck: DoctorCheck = {
  name: "claude-code/oauth-token-present",
  category: "config",
  required: false,

  async check(ctx: DoctorContext) {
    if (ctx.resolvedClaudeCodeOAuthToken !== null) {
      const source = ctx.claudeCodeOAuthTokenSource === "credentials" ? "credentials.json" : "env";
      const details =
        ctx.claudeCodeOAuthTokenSource === "env"
          ? ["Resolved via $CLAUDE_CODE_OAUTH_TOKEN"]
          : ["Resolved via anthropic.claudeCodeOAuthToken"];
      return {
        status: "pass",
        message: `Claude Code OAuth token is available (source: ${source})`,
        details,
      };
    }

    return {
      status: "warn",
      message: "Claude Code OAuth token is unset",
      hint: "For headless cron, run 'claude setup-token', then 'specrunner login --provider claude'.",
    };
  },
};
