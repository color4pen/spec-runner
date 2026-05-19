## MODIFIED Requirements

### Requirement: judge=yes produces an ADR file
- **Priority**: MUST
- **Description**: When the judge determines the change is ADR-worthy, the agent MUST generate an ADR file at `specrunner/adr/{YYYY-MM-DD}-{slug}.md` in Michael Nygard format.
- **Format**: `# {Title}\n**Date**: YYYY-MM-DD\n**Status**: accepted\n## Context\n## Decision\n## Alternatives Considered\n## Consequences`
