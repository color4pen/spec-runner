import type { AgentRunContext } from "../../core/port/agent-runner.js";

export function buildAdditionalInstructions(ctx: AgentRunContext): string {
  const { branch, slug } = ctx;
  const lines: string[] = [];

  if (branch) {
    lines.push(
      `RUNTIME INSTRUCTIONS (local Claude Code mode):`,
      `- You are running locally in the repository worktree at: ${ctx.cwd}`,
      `- Work on branch: ${branch} (already created by the CLI — do not create it again)`,
      `- After completing your task, end your session. The CLI will handle commit and push.`,
      `- Slug for this request: ${slug}`,
    );
  }

  if (ctx.projectContext) {
    lines.push("");
    lines.push("<project-context>");
    lines.push(ctx.projectContext);
    lines.push("</project-context>");
  }

  return lines.join("\n");
}
