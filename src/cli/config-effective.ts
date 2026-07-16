import { loadConfigWithSourceMetadata } from "../config/store.js";
import { traceStepExecutionConfigFromLoadResult } from "../config/step-config.js";
import type { TracedStepExecutionConfig, TracedStepConfigSource } from "../config/step-config.js";
import { TYPE_CONFIG } from "../config/type-config.js";
import { AGENT_STEP_NAMES, STEP_NAMES } from "../core/step/step-names.js";
import type { AgentStep } from "../core/step/types.js";
import { RequestReviewStep } from "../core/step/request-review.js";
import { DesignStep } from "../core/step/design.js";
import { SpecReviewStep } from "../core/step/spec-review.js";
import { SpecFixerStep } from "../core/step/spec-fixer.js";
import { TestCaseGenStep } from "../core/step/test-case-gen.js";
import { TestMaterializeStep } from "../core/step/test-materialize.js";
import { ImplementerStep } from "../core/step/implementer.js";
import { BuildFixerStep } from "../core/step/build-fixer.js";
import { CodeReviewStep } from "../core/step/code-review.js";
import { CodeFixerStep } from "../core/step/code-fixer.js";
import { ConformanceStep } from "../core/step/conformance.js";
import { AdrGenStep } from "../core/step/adr-gen.js";
import { EXIT_CODE, SpecRunnerError } from "../errors.js";
import { stdoutWrite, stderrWrite } from "../logger/stdout.js";
import { resolveRepoRoot } from "../util/repo-root.js";

export interface RunConfigEffectiveOptions {
  requestType?: string;
  json?: boolean;
  cwd?: string;
}

export interface ConfigEffectiveOutput {
  requestType: string | null;
  configPaths: {
    userGlobal: { path: string; exists: boolean };
    projectLocal: { path: string; exists: boolean };
  };
  steps: TracedStepExecutionConfig[];
  note: string;
}

const MANAGED_MODEL_NOTE = "Managed runtime ignores configured model for execution; this command still shows the configured effective value.";

const STANDARD_AGENT_STEPS: Record<string, AgentStep> = {
  [STEP_NAMES.REQUEST_REVIEW]: RequestReviewStep,
  [STEP_NAMES.DESIGN]: DesignStep,
  [STEP_NAMES.SPEC_REVIEW]: SpecReviewStep,
  [STEP_NAMES.SPEC_FIXER]: SpecFixerStep,
  [STEP_NAMES.TEST_CASE_GEN]: TestCaseGenStep,
  [STEP_NAMES.TEST_MATERIALIZE]: TestMaterializeStep,
  [STEP_NAMES.IMPLEMENTER]: ImplementerStep,
  [STEP_NAMES.BUILD_FIXER]: BuildFixerStep,
  [STEP_NAMES.CODE_REVIEW]: CodeReviewStep,
  [STEP_NAMES.CODE_FIXER]: CodeFixerStep,
  [STEP_NAMES.CONFORMANCE]: ConformanceStep,
  [STEP_NAMES.ADR_GEN]: AdrGenStep,
};

export async function runConfigEffective(options: RunConfigEffectiveOptions): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const requestType = options.requestType;
  if (requestType !== undefined && TYPE_CONFIG[requestType] === undefined) {
    stderrWrite(`Error: invalid --type value "${requestType}". Valid values: ${Object.keys(TYPE_CONFIG).join(", ")}`);
    return EXIT_CODE.ARG_ERROR;
  }

  try {
    const repoRoot = await resolveRepoRoot(cwd);
    const loaded = await loadConfigWithSourceMetadata(repoRoot ?? undefined);
    const output: ConfigEffectiveOutput = {
      requestType: requestType ?? null,
      configPaths: {
        userGlobal: {
          path: loaded.userGlobal.path,
          exists: loaded.userGlobal.exists,
        },
        projectLocal: {
          path: loaded.projectLocal.path,
          exists: loaded.projectLocal.exists,
        },
      },
      steps: AGENT_STEP_NAMES.map((stepName) => {
        const step = STANDARD_AGENT_STEPS[stepName]!;
        return traceStepExecutionConfigFromLoadResult(loaded, stepName, {
          model: step.agent.model,
          maxTurns: step.maxTurns,
        }, requestType);
      }),
      note: MANAGED_MODEL_NOTE,
    };

    stdoutWrite(options.json ? formatConfigEffectiveJson(output) : formatConfigEffectiveHuman(output));
    return EXIT_CODE.SUCCESS;
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError) {
      stderrWrite(`Error: ${err.message}`);
      stderrWrite(`Hint: ${err.hint}`);
      return err.exitCode;
    }
    stderrWrite(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    return EXIT_CODE.GENERAL_ERROR;
  }
}

export function formatConfigEffectiveJson(output: ConfigEffectiveOutput): string {
  return `${JSON.stringify(output, null, 2)}\n`;
}

export function formatConfigEffectiveHuman(output: ConfigEffectiveOutput): string {
  const lines: string[] = [];
  lines.push(`requestType: ${output.requestType ?? "none"}`);
  lines.push(`userGlobal: ${formatExistsPath(output.configPaths.userGlobal)}`);
  lines.push(`projectLocal: ${formatExistsPath(output.configPaths.projectLocal)}`);
  lines.push(output.note);
  lines.push("");

  for (const step of output.steps) {
    lines.push(step.step);
    lines.push(`  model: ${step.fields.model.value} (${formatSource(step.fields.model.source)})`);
    lines.push(`  maxTurns: ${formatValue(step.fields.maxTurns.value)} (${formatSource(step.fields.maxTurns.source)})`);
    lines.push(`  timeoutMs: ${formatValue(step.fields.timeoutMs.value)} (${formatSource(step.fields.timeoutMs.source)})`);
  }

  return `${lines.join("\n")}\n`;
}

function formatExistsPath(input: { path: string; exists: boolean }): string {
  return `${input.exists ? "present" : "missing"} ${input.path}`;
}

function formatValue(value: number | string | null): string {
  return value === null ? "null" : String(value);
}

function formatSource(source: TracedStepConfigSource): string {
  if (source.layer === "stepdef") return "stepdef";
  if (source.layer === "sdk") return "sdk";
  return `${source.layer} ${source.level} ${source.path}`;
}
