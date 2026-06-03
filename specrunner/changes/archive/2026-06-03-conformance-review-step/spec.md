# Spec: conformance-review-step

## Requirements

### Requirement: Pipeline SHALL execute conformance after code-review approved

The pipeline SHALL execute the conformance step after code-review produces an approved verdict. Both paths that previously led to adr-gen (code-review approved with no fixable findings, and code-fixer approved after observation-fix) MUST route to conformance instead.

#### Scenario: code-review approved with no fixable findings routes to conformance

**Given** the code-review step completes with verdict "approved" and fixableCount = 0
**When** the pipeline resolves the next transition
**Then** the next step is "conformance"

#### Scenario: code-fixer approved after observation-fix routes to conformance

**Given** the code-fixer step completes with verdict "approved" and the last code-review verdict was "approved"
**When** the pipeline resolves the next transition
**Then** the next step is "conformance"

### Requirement: Conformance SHALL judge implementation against 4 upstream artifacts

The conformance step SHALL evaluate the implementation against tasks.md, design.md, spec.md, and request.md. The agent MUST check all 4 items and produce a verdict based on their collective satisfaction.

#### Scenario: all 4 artifacts satisfied produces approved

**Given** the implementation satisfies tasks.md (all tasks complete), design.md (decisions reflected), spec.md (requirements met), and request.md (acceptance criteria achieved)
**When** the conformance agent evaluates the implementation
**Then** the verdict is "approved"

#### Scenario: any artifact not satisfied produces needs-fix

**Given** the implementation fails to satisfy one or more of the 4 upstream artifacts
**When** the conformance agent evaluates the implementation
**Then** the verdict is "needs-fix" with findings describing the specific failures

### Requirement: adr-gen SHALL only be reachable via conformance approved

The transition table MUST NOT contain any edge from code-review or code-fixer directly to adr-gen. The only transition into adr-gen SHALL be `conformance approved → adr-gen`.

#### Scenario: no direct edge from code-review to adr-gen exists

**Given** the STANDARD_TRANSITIONS table
**When** filtering for transitions where step is "code-review" and to is "adr-gen"
**Then** the result set is empty

#### Scenario: no direct edge from code-fixer to adr-gen exists

**Given** the STANDARD_TRANSITIONS table
**When** filtering for transitions where step is "code-fixer" and to is "adr-gen"
**Then** the result set is empty

### Requirement: Conformance needs-fix SHALL return to implementer

When conformance produces a needs-fix verdict, the pipeline SHALL transition to the implementer step (backward jump). The implementation then re-enters the verification → code-review → conformance cycle.

#### Scenario: conformance needs-fix transitions to implementer

**Given** the conformance step completes with verdict "needs-fix"
**When** the pipeline resolves the next transition
**Then** the next step is "implementer"

### Requirement: Conformance SHALL escalate on loop exhaustion

Conformance MUST be registered as a loop step. When the iteration count reaches maxIterations, the pipeline SHALL escalate with error code CONFORMANCE_RETRIES_EXHAUSTED.

#### Scenario: conformance exceeds max iterations

**Given** conformance has been executed maxIterations times without producing "approved"
**When** the pipeline attempts to re-enter conformance
**Then** the pipeline escalates with code "CONFORMANCE_RETRIES_EXHAUSTED"

### Requirement: code-review system prompt SHALL reference spec.md

The code-review system prompt MUST reference `spec.md` (not the stale `specs/` path) when instructing the agent to read the specification.

#### Scenario: code-review prompt contains spec.md reference

**Given** the code-review system prompt is built
**When** inspecting the review process instructions
**Then** the spec reference is `spec.md` and `specs/` does not appear
