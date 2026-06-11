# Spec: inbox-start-recheck

## Requirements

### Requirement: issue linkage SHALL be re-checked immediately before each start is executed

When the inbox orchestrator is about to execute a start action, it SHALL re-query the
current job states and verify the target issue is not already linked to any job.
If the issue is already linked, the start SHALL be skipped (not executed, not counted
as an error) and a warning SHALL be logged.

#### Scenario: issue linked by a concurrent tick before the second start executes

**Given** the inbox plan contains two start actions for issue #615 and #616  
**When** the first start (#616) completes and a concurrent tick has linked issue #615 in the meantime  
**Then** the start for issue #615 is skipped, `summary.started` does not include #615, and a warning is written to stderr

#### Scenario: issue not yet linked when start executes

**Given** the inbox plan contains a start action for issue #100  
**When** no other job has linked issue #100 at the moment of execution  
**Then** the start proceeds normally and #100 is added to `summary.started`
