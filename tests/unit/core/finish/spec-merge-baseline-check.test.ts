/**
 * Tests for baseline header consistency check.
 *
 * TC-SMB-01 through TC-SMB-07 — checkBaselineHeaderConsistency
 * TC-NRM-01 through TC-NRM-05 — normalizeRequirementHeader
 * TC-SMB-04b, TC-SMB-05b, TC-SMB-05c, TC-NRM-04, TC-NRM-06, TC-SMB-08, TC-SMB-09 — extended cases
 */
import { describe, it, expect } from "vitest";
import { checkBaselineHeaderConsistency } from "../../../../src/core/finish/spec-merge.js";
import { normalizeRequirementHeader } from "../../../../src/core/finish/baseline-headers.js";
import type { RequirementBlock, DeltaSpec } from "../../../../src/core/finish/spec-merge.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlock(name: string, body = "body text"): RequirementBlock {
  return { name, content: `### Requirement: ${name}\n\n${body}\n` };
}

function makeDelta(opts: {
  added?: RequirementBlock[];
  modified?: RequirementBlock[];
  removed?: RequirementBlock[];
}): DeltaSpec {
  return {
    added: opts.added ?? [],
    modified: opts.modified ?? [],
    removed: opts.removed ?? [],
  };
}

// ---------------------------------------------------------------------------
// normalizeRequirementHeader unit tests
// ---------------------------------------------------------------------------

describe("TC-NRM-01: normalizeRequirementHeader strips leading/trailing whitespace and bold", () => {
  it('normalizes "  **Foo**  " to "Foo"', () => {
    expect(normalizeRequirementHeader("  **Foo**  ")).toBe("Foo");
  });
});

describe("TC-NRM-02: normalizeRequirementHeader strips inline code backticks", () => {
  it('normalizes "`Bar`" to "Bar"', () => {
    expect(normalizeRequirementHeader("`Bar`")).toBe("Bar");
  });
});

describe("TC-NRM-03: normalizeRequirementHeader passes plain text unchanged", () => {
  it('normalizes "Plain" to "Plain"', () => {
    expect(normalizeRequirementHeader("Plain")).toBe("Plain");
  });
});

describe("TC-NRM-04: normalizeRequirementHeader strips markdown italic", () => {
  it('normalizes "*Italic*" to "Italic"', () => {
    expect(normalizeRequirementHeader("*Italic*")).toBe("Italic");
  });
});

describe("TC-NRM-05: normalizeRequirementHeader is case-preserving", () => {
  it('normalizes "FooBAR" to "FooBAR" (no case folding)', () => {
    expect(normalizeRequirementHeader("FooBAR")).toBe("FooBAR");
  });
});

// ---------------------------------------------------------------------------
// TC-SMB-01: MODIFIED header exists in baseline → pass
// ---------------------------------------------------------------------------

describe("TC-SMB-01: MODIFIED header exists in baseline → pass", () => {
  it("returns empty violations when MODIFIED header is present in baseline", () => {
    const delta = makeDelta({ modified: [makeBlock("Foo")] });
    const baseline = [makeBlock("Foo")];
    const violations = checkBaselineHeaderConsistency(delta, baseline, "cap");
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-SMB-02: MODIFIED header not in baseline → violation
// ---------------------------------------------------------------------------

describe("TC-SMB-02: MODIFIED header not in baseline → violation", () => {
  it("returns 1 violation containing MODIFIED and NonExistent", () => {
    const delta = makeDelta({ modified: [makeBlock("NonExistent")] });
    const baseline = [makeBlock("Foo"), makeBlock("Bar")];
    const violations = checkBaselineHeaderConsistency(delta, baseline, "cap");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("MODIFIED");
    expect(violations[0]).toContain("NonExistent");
  });
});

// ---------------------------------------------------------------------------
// TC-SMB-03: baseline absent + MODIFIED present → violation per header
// ---------------------------------------------------------------------------

describe("TC-SMB-03: baseline absent + MODIFIED present → violation per header", () => {
  it("returns 2 violations each containing 'non-existent baseline'", () => {
    const delta = makeDelta({ modified: [makeBlock("A"), makeBlock("B")] });
    const violations = checkBaselineHeaderConsistency(delta, null, "cap");
    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain("non-existent baseline");
    expect(violations[1]).toContain("non-existent baseline");
  });
});

// ---------------------------------------------------------------------------
// TC-SMB-04: REMOVED header not in baseline → violation
// ---------------------------------------------------------------------------

describe("TC-SMB-04: REMOVED header not in baseline → violation", () => {
  it("returns 1 violation containing REMOVED and Ghost", () => {
    const delta = makeDelta({ removed: [makeBlock("Ghost")] });
    const baseline = [makeBlock("Foo")];
    const violations = checkBaselineHeaderConsistency(delta, baseline, "cap");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("REMOVED");
    expect(violations[0]).toContain("Ghost");
  });
});

// ---------------------------------------------------------------------------
// TC-SMB-04b: baseline absent + REMOVED present → violation
// ---------------------------------------------------------------------------

describe("TC-SMB-04b: baseline absent + REMOVED present → violation", () => {
  it("returns 1 violation containing 'non-existent baseline'", () => {
    const delta = makeDelta({ removed: [makeBlock("X")] });
    const violations = checkBaselineHeaderConsistency(delta, null, "cap");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("non-existent baseline");
  });
});

// ---------------------------------------------------------------------------
// TC-SMB-05: ADDED header already in baseline → violation (duplicate)
// ---------------------------------------------------------------------------

describe("TC-SMB-05: ADDED header already in baseline → violation (duplicate)", () => {
  it("returns 1 violation containing ADDED and duplicate", () => {
    const delta = makeDelta({ added: [makeBlock("Foo")] });
    const baseline = [makeBlock("Foo")];
    const violations = checkBaselineHeaderConsistency(delta, baseline, "cap");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("ADDED");
    expect(violations[0]).toContain("duplicate");
  });
});

// ---------------------------------------------------------------------------
// TC-SMB-05b: ADDED header not in baseline → pass
// ---------------------------------------------------------------------------

describe("TC-SMB-05b: ADDED header not in baseline → pass", () => {
  it("returns empty violations when ADDED header is not in baseline", () => {
    const delta = makeDelta({ added: [makeBlock("New")] });
    const baseline = [makeBlock("Existing")];
    const violations = checkBaselineHeaderConsistency(delta, baseline, "cap");
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-SMB-05c: baseline absent + ADDED only → pass
// ---------------------------------------------------------------------------

describe("TC-SMB-05c: baseline absent + ADDED only → pass", () => {
  it("returns empty violations when baseline is null and only ADDED is present", () => {
    const delta = makeDelta({ added: [makeBlock("New")] });
    const violations = checkBaselineHeaderConsistency(delta, null, "cap");
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-SMB-06: mixed violations across all sections
// ---------------------------------------------------------------------------

describe("TC-SMB-06: mixed violations across sections → each reported individually", () => {
  it("returns 3 violations for ADDED duplicate + MODIFIED not found + REMOVED not found", () => {
    const delta = makeDelta({
      added: [makeBlock("Foo")],
      modified: [makeBlock("Missing")],
      removed: [makeBlock("Also-Missing")],
    });
    const baseline = [makeBlock("Foo")];
    const violations = checkBaselineHeaderConsistency(delta, baseline, "cap");
    expect(violations).toHaveLength(3);
    expect(violations.some((v) => v.includes("ADDED") && v.includes("duplicate"))).toBe(true);
    expect(violations.some((v) => v.includes("MODIFIED") && v.includes("Missing"))).toBe(true);
    expect(violations.some((v) => v.includes("REMOVED") && v.includes("Also-Missing"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-SMB-07: normalization strips markdown bold → pass
// ---------------------------------------------------------------------------

describe("TC-SMB-07: normalization strips markdown bold → pass", () => {
  it("treats **Foo** in delta as matching Foo in baseline", () => {
    const delta = makeDelta({
      modified: [{ name: "**Foo**", content: "### Requirement: **Foo**\n\nbody\n" }],
    });
    const baseline = [makeBlock("Foo")];
    const violations = checkBaselineHeaderConsistency(delta, baseline, "cap");
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-SMB-08: REMOVED header exists in baseline → pass
// ---------------------------------------------------------------------------

describe("TC-SMB-08: REMOVED header exists in baseline → pass", () => {
  it("returns empty violations when REMOVED header is present in baseline", () => {
    const delta = makeDelta({ removed: [makeBlock("Foo")] });
    const baseline = [makeBlock("Foo")];
    const violations = checkBaselineHeaderConsistency(delta, baseline, "cap");
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-SMB-09: multiple MODIFIED headers, one missing → one violation only
// ---------------------------------------------------------------------------

describe("TC-SMB-09: multiple MODIFIED headers, one missing → 1 violation", () => {
  it("returns exactly 1 violation for Missing, not for Exists", () => {
    const delta = makeDelta({ modified: [makeBlock("Exists"), makeBlock("Missing")] });
    const baseline = [makeBlock("Exists")];
    const violations = checkBaselineHeaderConsistency(delta, baseline, "cap");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("Missing");
  });
});

// ---------------------------------------------------------------------------
// TC-NRM-06: normalization applied to both delta and baseline (inline code)
// ---------------------------------------------------------------------------

describe("TC-NRM-06: normalization applied to both delta and baseline", () => {
  it("treats `Baz` in delta as matching Baz in baseline", () => {
    const delta = makeDelta({
      modified: [{ name: "`Baz`", content: "### Requirement: `Baz`\n\nbody\n" }],
    });
    const baseline = [makeBlock("Baz")];
    const violations = checkBaselineHeaderConsistency(delta, baseline, "cap");
    expect(violations).toHaveLength(0);
  });
});
