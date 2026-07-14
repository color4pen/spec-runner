import type { AgentStep, StepDeps, IoRef } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import type { DynamicContext } from "../../git/dynamic-context.js";
import { buildInitialMessage, DESIGN_SYSTEM_PROMPT } from "../../prompts/design-system.js";
import { getBranchPrefix, isSpecRequired } from "../../config/type-config.js";
import { requestMdPath, changeFolderPath, factCheckAttestationPath } from "../../util/paths.js";
import { evaluateFactCheckAttestation, buildFactCheckDirective } from "../factcheck-attestation.js";
import { STEP_NAMES } from "./step-names.js";
import { PRODUCER_REPORT_TOOL, toCustomToolSpec } from "./report-tool.js";

const DESIGN_AGENT_MODEL = "claude-opus-4-6[1m]";

/**
 * Full AgentDefinition owned by DesignStep.
 * Self-contained: name, role, model, system, and tools are all declared here.
 * Design D1: Step is the single source of truth for its agent definition.
 *
 * Note: register_branch tool has been removed (design D4).
 * Branch is created by CLI setupWorkspace() before the agent runs.
 */
const designAgentDefinition: AgentDefinition = {
  name: "specrunner-design",
  role: STEP_NAMES.DESIGN,
  model: DESIGN_AGENT_MODEL,
  system: DESIGN_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
    toCustomToolSpec(PRODUCER_REPORT_TOOL),
  ],
};

/**
 * DesignStep: implements the design pipeline step as a plain Step object.
 *
 * Branch is created by CLI setupWorkspace() before the agent runs (design D4).
 * DesignStep is runtime-neutral and does not import any adapter code.
 *
 * No execution lifecycle here — StepExecutor owns that.
 */
export const DesignStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.DESIGN,

  agent: designAgentDefinition,

  // toolHandlers intentionally omitted: injection is the adapter's responsibility (design D3).
  toolHandlers: undefined,

  // completionVerdict: design has no result file, so completion = unconditional success.
  // Used by executor local runtime path when resultContent is null.
  completionVerdict: "success",

  // maxTurns: design uses template-driven design (no openspec CLI tool calls); 15 is sufficient.
  // Design D3 (propose-openspec-cli-and-step-model-config).
  maxTurns: 15,

  // setsBranch: design creates the feature branch; executor sets state.branch after completion.
  // Design D2: declarative flag replaces step-name-based branch detection (TC-003 / TC-006).
  setsBranch: true,

  needsProjectContext: true,
  reportTool: PRODUCER_REPORT_TOOL,

  followUpPrompt: [
    "作業完了後の self-fix pass です。",
    "",
    "1. spec.md を作成した場合は Read tool で読んでください",
    "2. 「spec 記法」の以下の指針を確認してください:",
    "   - 各 Requirement は ### Requirement: で始まる header を持つ",
    "   - 各 Requirement は少なくとも 1 つの #### Scenario: を含む",
    "   - Requirement 本文に英語の SHALL または MUST が含まれる",
    "3. 違反があれば修正してください",
    "4. 違反がなければ変更せず end_turn してください",
  ].join("\n"),

  reads(_state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: requestMdPath(deps.slug) },
    ];
  },

  async enrichContext(dynamicContext: DynamicContext, cwd: string, slug: string): Promise<DynamicContext> {
    try {
      const { readFile } = await import("node:fs/promises");
      const { resolve } = await import("node:path");

      // Read request.md — required to compute the hash for attestation evaluation.
      // On any read failure, return dynamicContext unchanged (design will verify all).
      const requestContent = await readFile(resolve(cwd, requestMdPath(slug)), "utf-8");

      // Read attestation file — missing file is normal (absent → verify all).
      let attestationRaw: string | null = null;
      try {
        attestationRaw = await readFile(resolve(cwd, factCheckAttestationPath(slug)), "utf-8");
      } catch {
        // absent is expected when request-review has not written one yet
        attestationRaw = null;
      }

      const evaluation = evaluateFactCheckAttestation(attestationRaw, requestContent);
      return { ...dynamicContext, factCheckAttestation: evaluation };
    } catch {
      // On any read failure of request.md, return unchanged (degradation: design verifies all).
      return dynamicContext;
    }
  },

  writes(_state: JobState, deps: StepDeps): IoRef[] {
    const folder = changeFolderPath(deps.slug);
    return [
      { path: `${folder}/design.md` },
      { path: `${folder}/tasks.md` },
      // verify: false for spec-exempt types — the contract gate must not halt
      // because the agent legitimately leaves spec.md as the exemption note.
      { path: `${folder}/spec.md`, verify: isSpecRequired(deps.request.type) },
    ];
  },

  buildMessage(state: JobState, deps: StepDeps): string {
    // Use state.branch if already set by CLI (setupWorkspace early recording, D3).
    // Fall back to computing from type/slug/jobId for backward compatibility.
    const branch = state.branch
      ? state.branch
      : `${getBranchPrefix(deps.request.type)}${deps.slug}-${state.jobId.slice(0, 8)}`;

    // Pre-compute the fact-check directive so design-system.ts (shared-kernel)
    // does not need to import buildFactCheckDirective from domain (core/).
    const factCheckDirective = deps.dynamicContext?.factCheckAttestation
      ? buildFactCheckDirective(deps.dynamicContext.factCheckAttestation)
      : undefined;

    return buildInitialMessage(deps.request.content, deps.slug, branch, deps.dynamicContext, deps.request.type, factCheckDirective);
  },

  resultFilePath(_state: JobState, _deps: StepDeps): string | null {
    // Design step does not produce a result file for verdict parsing
    // (branch is registered via SSE tool call, not a file)
    return null;
  },

  parseResult(_content: string, _deps: StepDeps) {
    // Design has no file-based verdict — always returns null
    return NULL_PARSE_RESULT;
  },
};
