# Implementation Notes: step-name-compile-guard

## T-05: Manual negative confirmation

Both drift directions were verified to produce typecheck failures.

### Direction 1: array → union (extra value in AGENT_STEP_NAMES)

Temporarily added `"__drift__"` to `AGENT_STEP_NAMES` in `kernel/step-names.ts`.

`bun run typecheck` failed with:

```
src/state/schema.ts(39,44): error TS2344: Type '"__drift__"' does not satisfy the constraint 'never'.
```

(Guard: `type _AgentStepExtraInArray = _AssertNever<Exclude<typeof AGENT_STEP_NAMES[number], AgentStepNameUnion>>`)

### Direction 2: union → array (extra value in AgentStepName)

Temporarily added `| "__drift__"` to the `AgentStepName` union in `kernel/agent-definition.ts`.

`bun run typecheck` failed with:

```
src/state/schema.ts(41,44): error TS2344: Type '"__drift__"' does not satisfy the constraint 'never'.
```

(Guard: `type _AgentStepExtraInUnion = _AssertNever<Exclude<AgentStepNameUnion, typeof AGENT_STEP_NAMES[number]>>`)

### Revert confirmed

Both bogus values were removed. `bun run typecheck && bun run test && bun run lint` all pass with the production definitions in sync.
