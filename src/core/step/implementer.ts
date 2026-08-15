import type { AgentStep, IoRef } from "./types.js";
import { NULL_PARSE_RESULT } from "./types.js";
import type { OutputContract } from "../port/output-contract.js";
import type { AgentDefinition } from "../agent/definition.js";
import { AGENT_TOOLSET_TYPE } from "../agent/definition.js";
import type { JobState } from "../../state/schema.js";
import type { StepDeps } from "./types.js";
import type { DynamicContext } from "../../git/dynamic-context.js";
import type { TestPlacement } from "../../config/schema.js";
import { IMPLEMENTER_SYSTEM_PROMPT } from "../../prompts/implementer-system.js";
import { renderTestPlacementInstruction } from "../../prompts/test-placement.js";
import { branchNotSetError } from "../../errors.js";
import { changeFolderPath, conformanceResultPath, verificationResultPath } from "../../util/paths.js";
import { STEP_NAMES } from "./step-names.js";
import { PRODUCER_REPORT_TOOL, toCustomToolSpec } from "./report-tool.js";
import { getConformanceFixContext, buildFindingsBlock, getPreviousSessionId } from "./fixer-helpers.js";
import { latestIteration } from "./io-iteration.js";
import { verificationFailedLast } from "../pipeline/reverification.js";
import { extractVerificationFailures } from "../verification/parse-result.js";

const IMPLEMENTER_AGENT_MODEL = "claude-sonnet-5";

/**
 * Full AgentDefinition owned by ImplementerStep.
 * tools = [agent_toolset_20260401] — implementer reads files and writes code.
 * capabilities.gitWrite = true — implementer commits and pushes.
 */
const implementerAgentDefinition: AgentDefinition = {
  name: "specrunner-implementer",
  role: STEP_NAMES.IMPLEMENTER,
  model: IMPLEMENTER_AGENT_MODEL,
  system: IMPLEMENTER_SYSTEM_PROMPT,
  tools: [
    { type: AGENT_TOOLSET_TYPE },
    toCustomToolSpec(PRODUCER_REPORT_TOOL),
  ],
  capabilities: {
    gitWrite: true,
  },
};

/**
 * Build the initial user message for the implementer session.
 *
 * When dynamicContext is provided and has gitLog or diffStat, a branch context
 * section is prepended so the agent understands what has already been done on
 * the branch without having to run git commands itself.
 *
 * When placement is provided, a deterministic test file placement directive is
 * appended, overriding the default "follow existing placement pattern" guidance.
 * When placement is absent, the message is identical to the pre-change behavior.
 *
 * Single mode (absorb-test-materialize): the implementer always materializes test-cases.md
 * must TCs into test code and aligns both tests and implementation with canon.
 */
export function buildImplementerInitialMessage(opts: {
  slug: string;
  branch: string;
  requestContent: string;
  dynamicContext?: DynamicContext;
  placement?: TestPlacement;
}): string {
  const { slug, branch, requestContent, dynamicContext, placement } = opts;

  const contextLines: string[] = [];
  if (dynamicContext?.gitLog) {
    contextLines.push(`## Branch Context\n\n### Recent commits (main..HEAD)\n\n\`\`\`\n${dynamicContext.gitLog}\n\`\`\``);
  }
  if (dynamicContext?.diffStat) {
    contextLines.push(`### Diff stat (main..HEAD)\n\n\`\`\`\n${dynamicContext.diffStat}\n\`\`\``);
  }
  const contextSection = contextLines.length > 0
    ? `\n\n${contextLines.join("\n\n")}`
    : "";

  const placementSection = placement
    ? `\n\n${renderTestPlacementInstruction(placement)}`
    : "";

  return `<user-request>
You are the implementer for the following change:

Change folder: ${changeFolderPath(slug)}
Branch: ${branch}

test-cases.md と spec を canon(正)として、テストと実装の両方を整合させてください。
テストを変更した場合は、変更したテストとその理由を完了報告に明示してください。

Please:
1. Read ${changeFolderPath(slug)}/tasks.md to understand what needs to be implemented
2. Read ${changeFolderPath(slug)}/test-cases.md and the existing test files to understand the expected behavior
3. Implement all tasks in tasks.md — align both tests and implementation with canon (test-cases.md / spec). If you modify any test files, report the changed tests and the reason in your completion report.
4. Update tasks.md: mark completed tasks with [x]
5. 依存を追加・変更した場合は lockfile（\`bun.lock\` / \`package-lock.json\` 等）を同期してから完了する
6. ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。

Original request:
${requestContent}
</user-request>${contextSection}${placementSection}`;
}

/**
 * Build the recovery user message for implementer re-entry after verification failure.
 *
 * Instructs the implementer to fix the verification failure with its normal authority.
 * No mechanical-fix-only / no-design-decision constraints are imposed — the implementer
 * acts with its full responsibility (canon alignment, implementation + test fixes).
 *
 * When verificationContent is available (pre-read by enrichContext), the failure details
 * are inlined so the agent can start fixing immediately without an extra file read turn.
 * When it is absent (file not found, best-effort fallback), the message asks the agent
 * to read the verification result file directly.
 *
 * Design D3 (absorb-build-fixer): 制約撤去 — re-entry message は失敗解消の指示のみ。
 */
function buildImplementerRecoveryMessage(opts: {
  slug: string;
  branch: string;
  verificationContent: string | null | undefined;
  requestContent: string;
  dynamicContext?: DynamicContext;
}): string {
  const { slug, branch, verificationContent, requestContent, dynamicContext } = opts;
  const findingsPath = verificationResultPath(slug);

  const contextLines: string[] = [];
  if (dynamicContext?.gitLog) {
    contextLines.push(`## Branch Context\n\n### Recent commits (main..HEAD)\n\n\`\`\`\n${dynamicContext.gitLog}\n\`\`\``);
  }
  if (dynamicContext?.diffStat) {
    contextLines.push(`### Diff stat (main..HEAD)\n\n\`\`\`\n${dynamicContext.diffStat}\n\`\`\``);
  }
  const contextSection = contextLines.length > 0
    ? `\n\n${contextLines.join("\n\n")}`
    : "";

  const failureSection = buildFailureSection(verificationContent);

  return `<user-request>
verification(build / typecheck / lint / test)が失敗しました。canon(test-cases.md / spec)と整合するよう実装・テストを直して失敗を解消してください。

Change folder: ${changeFolderPath(slug)}
Branch: ${branch}
Verification result: ${findingsPath}
${failureSection}
Please:
1. 失敗した verification の出力を確認して原因を特定する（${findingsPath} を参照）
2. canon(test-cases.md / spec.md)と整合するよう実装・テストを修正して失敗を解消する
3. tasks.md のチェックボックスを更新する
4. ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。

Original request:
${requestContent}
</user-request>${contextSection}`;
}

/**
 * Build the "## Verification Failures" section for the recovery message.
 *
 * Ported from build-fixer.ts buildFailureSection — same logic, same best-effort semantics.
 * Returns empty string when fileContent is null/undefined or contains no failures.
 */
function buildFailureSection(fileContent: string | null | undefined): string {
  if (!fileContent) return "";
  const failures = extractVerificationFailures(fileContent);
  if (failures.length === 0) return "";

  const lines: string[] = ["", "## Verification Failures", ""];
  for (const failure of failures) {
    lines.push(`- **Failed phase**: ${failure.phase}`);
    lines.push(`- **Exit code**: ${failure.exitCode}`);
    lines.push("");
    lines.push("### Error output");
    lines.push("```");
    lines.push(failure.output);
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * ImplementerStep: implements the implementer pipeline step.
 *
 * Has its own dedicated AgentDefinition (role: "implementer").
 * No custom tool handlers — implementer uses the standard agent toolset.
 * No result file — completion detected via polling (session idle).
 * completionVerdict: "success" — session completion maps to "success" for transitions.
 */
export const ImplementerStep: AgentStep = {
  kind: "agent",
  name: STEP_NAMES.IMPLEMENTER,

  agent: implementerAgentDefinition,

  toolHandlers: undefined,

  completionVerdict: "success",
  needsProjectContext: true,
  reportTool: PRODUCER_REPORT_TOOL,

  // maxTurns: implementer handles complex multi-file tasks; 60 is the upper bound.
  // Design D3 (propose-openspec-cli-and-step-model-config).
  maxTurns: 60,

  /**
   * enrichContext: pre-read verification-result.md (best-effort) for recovery re-entry.
   *
   * When verification failed (verificationFailedLast=true), the implementer re-enters
   * as the paired fixer. This hook pre-reads the result file so buildMessage can inline
   * the failure content without an extra agent read turn.
   *
   * Ported from build-fixer.enrichContext — same best-effort pattern (try/catch, never throws).
   * On file-not-found (initial run, conformance re-entry), returns dynamicContext unchanged.
   */
  async enrichContext(dynamicContext: DynamicContext, cwd: string, slug: string): Promise<DynamicContext> {
    const findingsPath = verificationResultPath(slug);
    try {
      const { readFile } = await import("node:fs/promises");
      const { resolve } = await import("node:path");
      const content = await readFile(resolve(cwd, findingsPath), "utf-8");
      return { ...dynamicContext, verificationContent: content };
    } catch {
      return dynamicContext;
    }
  },

  reads(state: JobState, deps: StepDeps): IoRef[] {
    const folder = changeFolderPath(deps.slug);
    const baseReads: IoRef[] = [
      { path: `${folder}/tasks.md` },
      { path: `${folder}/spec.md` },
      // test-cases.md is optional (soft): present in standard pipeline after test-case-gen,
      // absent in fast pipeline. required:false preserves fast input-completeness.
      { path: `${folder}/test-cases.md`, required: false },
    ];
    // Conformance-triggered entry: also read conformance result file
    const conformanceFindings = getConformanceFixContext(state, STEP_NAMES.IMPLEMENTER);
    if (conformanceFindings !== null) {
      return [
        ...baseReads,
        { path: conformanceResultPath(deps.slug, latestIteration(state, STEP_NAMES.CONFORMANCE)) },
      ];
    }
    return baseReads;
  },

  writes(_state: JobState, deps: StepDeps): IoRef[] {
    return [
      { path: changeFolderPath(deps.slug), artifact: "gitState" },
      // tasks.md is validated via outputContracts (tasks-complete) rather than produced.
      // It already exists as a scaffold from the design step — overwrite alone is not sufficient;
      // we need to verify that all checkboxes are marked [x].
      { path: `${changeFolderPath(deps.slug)}/tasks.md`, verify: false },
    ];
  },

  outputContracts(_state: JobState, deps: StepDeps): OutputContract[] {
    return [
      {
        kind: "tasks-complete",
        path: `${changeFolderPath(deps.slug)}/tasks.md`,
        policy: "follow-up",
      },
    ];
  },

  buildMessage(state: JobState, deps: StepDeps): string {
    if (!state.branch) throw branchNotSetError(STEP_NAMES.IMPLEMENTER);

    // Recovery re-entry: verification failed → implementer fixes (no mechanical-fix constraint).
    // build-fixer 廃止後、verification 失敗は implementer 自身が paired fixer として直す。
    if (verificationFailedLast(state)) {
      // Continuation (previous session resumable): short recovery message — the prior
      // implementation context lives in the resumed session.
      if (getPreviousSessionId(state, STEP_NAMES.IMPLEMENTER) !== null) {
        return buildImplementerRecoveryMessage({
          slug: deps.slug,
          branch: state.branch,
          verificationContent: deps.dynamicContext?.verificationContent,
          requestContent: deps.request.content,
          dynamicContext: deps.dynamicContext,
        });
      }
      // Fresh fallback (no previous session): full initial message (branch context +
      // tasks/spec guidance) with the verification-failure section appended (D3).
      const baseMessage = buildImplementerInitialMessage({
        slug: deps.slug,
        branch: state.branch,
        requestContent: deps.request.content,
        dynamicContext: deps.dynamicContext,
      });
      const failureSection = buildFailureSection(deps.dynamicContext?.verificationContent);
      if (failureSection === "") return baseMessage;
      const insertBefore = "</user-request>";
      const idx = baseMessage.lastIndexOf(insertBefore);
      if (idx !== -1) {
        return `${baseMessage.slice(0, idx)}${failureSection}\n${baseMessage.slice(idx)}`;
      }
      return `${baseMessage}\n${failureSection}`;
    }

    // Conformance-triggered entry: append conformance non-conformities section
    const conformanceFindings = getConformanceFixContext(state, STEP_NAMES.IMPLEMENTER);
    if (conformanceFindings !== null && conformanceFindings.length > 0) {
      const baseMessage = buildImplementerInitialMessage({
        slug: deps.slug,
        branch: state.branch,
        requestContent: deps.request.content,
        dynamicContext: deps.dynamicContext,
      });
      const findingsBlock = buildFindingsBlock(conformanceFindings, "conformance");
      // Append the conformance section before the closing tag
      const insertBefore = "</user-request>";
      const idx = baseMessage.lastIndexOf(insertBefore);
      if (idx !== -1) {
        return `${baseMessage.slice(0, idx)}\n## Conformance non-conformities (must resolve)\n\n${findingsBlock}\n${baseMessage.slice(idx)}`;
      }
      // Fallback: just append
      return `${baseMessage}\n\n## Conformance non-conformities (must resolve)\n\n${findingsBlock}`;
    }

    return buildImplementerInitialMessage({
      slug: deps.slug,
      branch: state.branch,
      requestContent: deps.request.content,
      dynamicContext: deps.dynamicContext,
      placement: deps.config.tests?.placement,
    });
  },

  resultFilePath(_state: JobState, _deps: StepDeps): string | null {
    // implementer does not produce a verdict file — completion detected via polling
    return null;
  },

  parseResult(_content: string, _deps: StepDeps) {
    return NULL_PARSE_RESULT;
  },
};
