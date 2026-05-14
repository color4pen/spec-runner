/**
 * Check that the `codex` CLI binary is available when any pipeline step uses an OpenAI model.
 * D7 (design.md): skipped (status: pass) when no OpenAI model steps are configured.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";
import { BUILTIN_MODEL_REGISTRY } from "../../../../config/model-registry.js";

function hasOpenAiSteps(ctx: DoctorContext): boolean {
  const steps = ctx.config.get("steps");
  if (!steps || typeof steps !== "object") return false;

  const userModels = ctx.config.get("models");
  const merged = {
    ...BUILTIN_MODEL_REGISTRY,
    ...(typeof userModels === "object" && userModels !== null
      ? (userModels as Record<string, { provider?: string }>)
      : {}),
  };

  const stepsObj = steps as Record<string, unknown>;
  for (const [, stepVal] of Object.entries(stepsObj)) {
    if (typeof stepVal !== "object" || stepVal === null) continue;
    const model = (stepVal as Record<string, unknown>)["model"];
    if (typeof model !== "string") continue;
    const entry = merged[model];
    if (entry && (entry as { provider?: string }).provider === "openai") return true;
  }
  return false;
}

export const codexCliCheck: DoctorCheck = {
  name: "codex-cli",
  category: "runtime",
  required: true,

  async check(ctx: DoctorContext) {
    if (!hasOpenAiSteps(ctx)) {
      return {
        status: "pass",
        message: "codex CLI not required (no OpenAI model steps configured)",
      };
    }

    let version: string;
    try {
      const result = await ctx.execFile("codex", ["--version"], {
        signal: AbortSignal.timeout(5000),
      });
      version = result.stdout.trim();
    } catch {
      return {
        status: "fail",
        message: "codex CLI is not installed or not in PATH",
        hint: "Install @openai/codex: npm install -g @openai/codex",
      };
    }

    try {
      await ctx.execFile("codex", ["auth", "whoami"], {
        signal: AbortSignal.timeout(5000),
      });
      return {
        status: "pass",
        message: `codex ${version} (authenticated)`,
      };
    } catch {
      return {
        status: "warn",
        message: `codex ${version} (not authenticated)`,
        hint: "Run `codex login` to authenticate, or set the CODEX_API_KEY environment variable",
      };
    }
  },
};
