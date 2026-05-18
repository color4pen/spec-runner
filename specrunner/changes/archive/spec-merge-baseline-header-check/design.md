# Design: spec-merge baseline header consistency check

## Problem

`applyMerge` detects header mismatches during merge application (exact string matching on `RequirementBlock.name`). Two issues:

1. **Late detection**: errors surface inside `applyMerge`, mixed with merge-application errors. No early bail-out.
2. **No normalization**: agent-written delta headers sometimes include markdown decoration (`**Foo**`, `` `Foo` ``) that differs from the baseline's plain text (`Foo`). Exact matching treats these as "not found".

PR #306 / PR #308 both hit this path. This feature adds a machine check before `applyMerge` as the last safety net.

## Solution

### 1. `normalizeRequirementHeader` (new file: `src/core/finish/baseline-headers.ts`)

Pure function that strips markdown decoration from a requirement header name:

```typescript
export function normalizeRequirementHeader(text: string): string {
  let result = text.trim();
  result = result.replace(/\*\*(.*?)\*\*/g, "$1"); // bold
  result = result.replace(/\*(.*?)\*/g, "$1");      // italic
  result = result.replace(/`(.*?)`/g, "$1");         // inline code
  return result.trim();
}
```

Exported separately for unit testing. Mirrors openspec `specs-apply.js` `normalizeRequirementName` semantics: trim + strip decoration, case-preserving.

### 2. `checkBaselineHeaderConsistency` (in `src/core/finish/spec-merge.ts`)

```typescript
export function checkBaselineHeaderConsistency(
  delta: DeltaSpec,
  baselineRequirements: RequirementBlock[] | null,
  capability: string,
): string[]
```

- **Input**: parsed delta, parsed baseline requirements (null = baseline file absent), capability name for error prefix
- **Output**: array of violation strings (empty = pass)

Logic:

| Section | Baseline exists | Condition | Result |
|---------|----------------|-----------|--------|
| MODIFIED | yes | normalized name not in baseline | violation |
| MODIFIED | no (null) | always | violation (cannot modify non-existent baseline) |
| REMOVED | yes | normalized name not in baseline | violation |
| REMOVED | no (null) | always | violation (cannot remove from non-existent baseline) |
| ADDED | yes | normalized name already in baseline | violation (duplicate) |
| ADDED | no (null) | - | pass (new capability, no conflict possible) |

Normalization is applied to both delta and baseline names before comparison.

### 3. Integration into `mergeSpecsForChange`

Insert in the per-capability loop of Pass 1, after `validateDeltaSpec` succeeds and before the existing `applyMerge` path:

```
[existing] read delta spec → parse → empty check → validateDeltaSpec
[NEW]      read baseline (hoist) → checkBaselineHeaderConsistency → violations? → allErrors + continue
[existing] applyMerge (or createNewBaselineSpec for new capability)
```

The baseline read (currently at two points: `fs.exists` at line 484 and `fs.readFile` at line 508) is hoisted to a single read before the check. The existing `!baselineExists` branch (lines 487-504) and `applyMerge` branch (lines 505-524) remain as defense-in-depth.

Structural change to the loop:

```typescript
// After validateDeltaSpec passes...

// Hoist baseline read
const baselinePath = path.join(cwd, baselineSpecPath(capability));
const baselineExists = await fs.exists(baselinePath);
let baselineReqs: RequirementBlock[] | null = null;
let baselineContent: string | null = null;

if (baselineExists) {
  try {
    baselineContent = await fs.readFile(baselinePath);
  } catch {
    allErrors.push(`Failed to read baseline ...`);
    continue;
  }
  baselineReqs = parseBaselineSpec(baselineContent).requirements;
}

// NEW: baseline header consistency check
const violations = checkBaselineHeaderConsistency(delta, baselineReqs, capability);
if (violations.length > 0) {
  allErrors.push(...violations);
  continue;
}

// Existing merge logic (uses already-read baselineContent)
if (!baselineExists) {
  // ADDED-only create (existing check for MODIFIED/REMOVED is redundant
  // but kept as defense-in-depth)
  ...
} else {
  const baseline = parseBaselineSpec(baselineContent!);
  const mergeResult = applyMerge(baseline, delta);
  ...
}
```

### 4. Error message format

Follows existing `allErrors` convention with `[capability]` prefix:

```
[spec-merge] MODIFIED: Requirement "Foo" not found in baseline
[spec-merge] REMOVED: Requirement "Bar" not found in baseline
[spec-merge] ADDED: Requirement "Baz" already exists in baseline (duplicate)
[spec-merge] MODIFIED: Requirement "Qux" cannot apply to non-existent baseline
```

Collected into `allErrors` and reported in the single escalation message (existing pattern).

### 5. Existing behavior preservation

- `applyMerge` still runs its own exact-match checks after the new check passes. The new check catches normalized mismatches earlier; `applyMerge` catches any remaining exact-match issues.
- The `!baselineExists` branch (MODIFIED/REMOVED on new capability) is redundant with the new check but kept for defense-in-depth.
- No change to Pass 2 (write + git add) or the escalation format.

## Files changed

| File | Change |
|------|--------|
| `src/core/finish/baseline-headers.ts` | NEW: `normalizeRequirementHeader` |
| `src/core/finish/spec-merge.ts` | ADD `checkBaselineHeaderConsistency`, refactor `mergeSpecsForChange` loop |
| `tests/unit/core/finish/spec-merge-baseline-check.test.ts` | NEW: TC-SMB-01 through TC-SMB-07 |
| `specrunner/specs/spec-merge/spec.md` | MODIFIED via delta spec (ADDED requirement) |

## ADR

ADR-0004: baseline header consistency check as defense-in-depth layer in spec-merge. Records the decision to add a normalization-aware pre-check before `applyMerge` rather than modifying `applyMerge` itself.
