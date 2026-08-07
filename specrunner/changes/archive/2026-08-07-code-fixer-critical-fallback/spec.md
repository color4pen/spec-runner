# Spec: code-fixer CRITICAL fallback fix

## Requirements

### Requirement: All code-fixer prompt branches MUST include CRITICAL in mandatory severity

The code-fixer agent SHALL be instructed to fix all HIGH **and CRITICAL** severity findings as mandatory across every prompt branch (conformance, coordinator-loop findings-embedded, coordinator-loop fallback, standard-path findings-embedded, standard-path fallback).

No branch SHALL instruct the agent to fix only HIGH severity findings without also naming CRITICAL as mandatory.

#### Scenario: coordinator-loop fallback prompt includes CRITICAL

**Given** the job is in the coordinator-loop path (custom reviewers ran, coordinator verdict is needs-fix) and no structured findings are available in the reviewer outcome
**When** `CodeFixerStep.buildMessage` is called
**Then** the returned message contains `Fix all HIGH and CRITICAL severity findings (mandatory)`

#### Scenario: standard-path fallback prompt includes CRITICAL

**Given** the job is in the standard code-review path and the latest code-review outcome has a findingsPath but no inline findings array
**When** `CodeFixerStep.buildMessage` is called
**Then** the returned message contains `Fix all HIGH and CRITICAL severity findings (mandatory)`
