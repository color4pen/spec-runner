import type { AgentRunContext } from "../../core/port/agent-runner.js";

export function buildResumeSection(ctx: AgentRunContext): string {
  if (!ctx.session.resumePrompt) return "";
  return `\n\n<resume-context>\n${ctx.session.resumePrompt}\n</resume-context>`;
}

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

  if (ctx.input.projectContext) {
    lines.push("");
    lines.push("<project-context>");
    lines.push(ctx.input.projectContext);
    lines.push("</project-context>");
  }

  // Always add Agent/Task tool prohibition.
  if (lines.length > 0) lines.push("");
  lines.push(
    "IMPORTANT: Do not use the Agent or Task tool. These tools are not available in this environment.",
    "Complete all tasks yourself using the available tools (Read, Grep, Edit, Bash, Write, Glob) directly.",
  );

  return lines.join("\n");
}
