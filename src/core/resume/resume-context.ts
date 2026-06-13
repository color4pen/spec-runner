import type { JobState, ResumePoint, StepRun } from "../../state/schema.js";

export interface ResumeContextSnapshot {
  resumePoint: ResumePoint;
}

export interface BuildResumePromptInput {
  state: JobState;
  stepName: string;
  resumeContext?: ResumeContextSnapshot;
  humanResumePrompt?: string;
}

type ResumeContextSectionBuilder = (input: {
  state: JobState;
  stepName: string;
  resumeContext: ResumeContextSnapshot;
  previousRun: StepRun | undefined;
}) => string | undefined;

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "unknown";
  }
  return String(value);
}

const automaticResumeSectionBuilders: ResumeContextSectionBuilder[] = [
  ({ stepName, resumeContext, previousRun, state }) => {
    const priorRuns = state.steps?.[stepName] ?? [];
    const previousAttempt = previousRun?.attempt ?? priorRuns.length;
    const currentAttempt = previousAttempt + 1;
    const resumePoint = resumeContext.resumePoint;
    const lines = [
      "## Automatic resume context",
      "",
      "- resumedStep: " + stepName,
      "- previousAttempt: " + renderValue(previousAttempt),
      "- currentAttempt: " + renderValue(currentAttempt),
      "- previousVerdict: " + renderValue(previousRun?.outcome?.verdict),
      "- previousFindingsPath: " + renderValue(previousRun?.outcome?.findingsPath),
      "- stopReason: " + renderValue(resumePoint.reason),
      "- iterationsExhausted: " + renderValue(resumePoint.iterationsExhausted),
    ];

    if (resumePoint.exhaustionPhase) {
      lines.push("- exhaustionPhase: " + resumePoint.exhaustionPhase);
    }

    lines.push(
      "",
      "Resume semantics: existing worktree artifacts may be from a previous attempt and do not mean the current attempt is complete. Work or judge again for this attempt.",
    );

    return lines.join("\n");
  },
];

function buildAutomaticResumeContext(
  state: JobState,
  stepName: string,
  resumeContext: ResumeContextSnapshot | undefined,
): string | undefined {
  if (!resumeContext || resumeContext.resumePoint.step !== stepName) {
    return undefined;
  }

  const priorRuns = state.steps?.[stepName] ?? [];
  const previousRun = priorRuns[priorRuns.length - 1];
  const sections = automaticResumeSectionBuilders
    .map((builder) => builder({ state, stepName, resumeContext, previousRun }))
    .filter((section): section is string => Boolean(section));

  return sections.length > 0 ? sections.join("\n\n") : undefined;
}

export function buildResumePrompt(input: BuildResumePromptInput): string | undefined {
  const automaticContext = buildAutomaticResumeContext(
    input.state,
    input.stepName,
    input.resumeContext,
  );
  const hasHumanPrompt = input.humanResumePrompt !== undefined && input.humanResumePrompt !== "";

  if (!automaticContext) {
    return hasHumanPrompt ? input.humanResumePrompt : undefined;
  }

  if (!hasHumanPrompt) {
    return automaticContext;
  }

  return [
    automaticContext,
    "## Human supplied resume note",
    "",
    input.humanResumePrompt,
  ].join("\n\n");
}
