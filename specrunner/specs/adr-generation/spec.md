## Purpose

TBD
## Requirements

### Requirement: adr-gen step skips when adr is false
- **Priority**: MUST
- **Description**: When `request.adr === false`, the adr-gen pipeline step MUST complete as a no-op without creating an ADR file or invoking a judge evaluation.
- **Rationale**: Avoids LLM cost for requests that don't warrant architectural documentation.

### Requirement: adr-gen step invokes judge when adr is true
- **Priority**: MUST
- **Description**: When `request.adr === true`, the adr-gen step MUST invoke a judge agent that evaluates whether the change is ADR-worthy based on the change folder artifacts (design.md, delta specs, review-feedback, git diff).
- **Rationale**: Two-stage filter — human declares intent, agent evaluates actuality.

### Requirement: judge=yes produces an ADR file
- **Priority**: MUST
- **Description**: When the judge determines the change is ADR-worthy, the agent MUST generate an ADR file at `specrunner/adr/{YYYY-MM-DD}-{slug}.md` in Michael Nygard format.
- **Format**: `# {Title}\n**Date**: YYYY-MM-DD\n**Status**: accepted\n## Context\n## Decision\n## Alternatives Considered\n## Consequences`

### Requirement: judge=no logs reason and skips
- **Priority**: MUST
- **Description**: When the judge determines the change is NOT ADR-worthy, the agent MUST log the reason and complete without generating any ADR file.
- **Rationale**: Prevents ADR overproduction for routine changes.

### Requirement: ADR step position in pipeline
- **Priority**: MUST
- **Description**: The adr-gen step MUST execute after code-review approves and before pr-create. Transition: `code-review --approved→ adr-gen --success→ pr-create`. Errors from adr-gen escalate.

### Requirement: adr-gen is an agent step
- **Priority**: MUST
- **Description**: adr-gen is defined as `kind: "agent"` with `completionVerdict: "success"`. No result file is parsed — completion is detected via session idle (end_turn).
