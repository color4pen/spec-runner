/**
 * Tests for spec-merge module.
 *
 * TC-SM-010 to TC-SM-095 — parseDeltaSpec / parseBaselineSpec / validateDeltaSpec /
 * applyMerge / renderBaselineSpec / createNewBaselineSpec / mergeSpecsForChange
 *
 * TC-SM-002, TC-SM-003: paths.ts specsDirRel / baselineSpecPath
 */
import { describe, it, expect, vi } from "vitest";
import {
  parseDeltaSpec,
  parseBaselineSpec,
  validateDeltaSpec,
  applyMerge,
  renderBaselineSpec,
  createNewBaselineSpec,
  mergeSpecsForChange,
} from "../src/core/finish/spec-merge.js";
import { specsDirRel, baselineSpecPath } from "../src/util/paths.js";
import type { SpawnFn } from "../src/util/spawn.js";
import type { FinishFs } from "../src/core/finish/types.js";
import type { RequirementBlock, BaselineSpec } from "../src/core/finish/spec-merge.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpawn(exitCode: number, stdout = "", stderr = ""): SpawnFn {
  return vi.fn().mockResolvedValue({ exitCode, stdout, stderr });
}

function makeFs(overrides: Partial<FinishFs> = {}): FinishFs {
  return {
    exists: vi.fn().mockResolvedValue(false),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(""),
    ...overrides,
  };
}

function makeBlock(name: string, body = "body text"): RequirementBlock {
  return { name, content: `### Requirement: ${name}\n\n${body}\n` };
}

function makeBaselineSpec(reqNames: string[]): BaselineSpec {
  return {
    preamble: "## Purpose\n\nTBD\n\n",
    requirements: reqNames.map((n) => makeBlock(n)),
    postamble: "",
  };
}

// ---------------------------------------------------------------------------
// TC-SM-002: specsDirRel
// ---------------------------------------------------------------------------

describe("TC-SM-002: specsDirRel", () => {
  it("returns 'specrunner/specs' without leading or trailing slash", () => {
    expect(specsDirRel()).toBe("specrunner/specs");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-003: baselineSpecPath
// ---------------------------------------------------------------------------

describe("TC-SM-003: baselineSpecPath", () => {
  it("returns correct path for capability 'cli-commands'", () => {
    expect(baselineSpecPath("cli-commands")).toBe("specrunner/specs/cli-commands/spec.md");
  });

  it("TC-SM-004: handles long capability names", () => {
    expect(baselineSpecPath("some-long-capability-name")).toBe(
      "specrunner/specs/some-long-capability-name/spec.md",
    );
  });
});

// ---------------------------------------------------------------------------
// TC-SM-010: parseDeltaSpec — ADDED only
// ---------------------------------------------------------------------------

describe("TC-SM-010: parseDeltaSpec — ADDED only", () => {
  it("parses ADDED section into added array; modified and removed are empty", () => {
    const content = "## ADDED Requirements\n\n### Requirement: Foo\n\ncontent\n";
    const result = parseDeltaSpec(content);

    expect(result.added).toHaveLength(1);
    expect(result.added[0]!.name).toBe("Foo");
    expect(result.added[0]!.content).toContain("### Requirement: Foo");
    expect(result.modified).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-011: parseDeltaSpec — all 3 sections
// ---------------------------------------------------------------------------

describe("TC-SM-011: parseDeltaSpec — 3 sections", () => {
  it("parses all 3 sections correctly", () => {
    const content = [
      "## ADDED Requirements",
      "",
      "### Requirement: New",
      "",
      "added body",
      "",
      "## MODIFIED Requirements",
      "",
      "### Requirement: Changed",
      "",
      "modified body",
      "",
      "## REMOVED Requirements",
      "",
      "### Requirement: Gone",
      "",
      "removed body",
      "",
    ].join("\n");

    const result = parseDeltaSpec(content);

    expect(result.added).toHaveLength(1);
    expect(result.added[0]!.name).toBe("New");

    expect(result.modified).toHaveLength(1);
    expect(result.modified[0]!.name).toBe("Changed");

    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]!.name).toBe("Gone");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-012: parseDeltaSpec — empty string
// ---------------------------------------------------------------------------

describe("TC-SM-012: parseDeltaSpec — empty string", () => {
  it("returns empty arrays for all sections", () => {
    const result = parseDeltaSpec("");
    expect(result).toEqual({ added: [], modified: [], removed: [] });
  });
});

// ---------------------------------------------------------------------------
// TC-SM-013: parseDeltaSpec — multiple blocks in one section
// ---------------------------------------------------------------------------

describe("TC-SM-013: parseDeltaSpec — multiple blocks in ADDED", () => {
  it("parses 2 blocks in ADDED section", () => {
    const content = [
      "## ADDED Requirements",
      "",
      "### Requirement: A",
      "",
      "body a",
      "",
      "### Requirement: B",
      "",
      "body b",
      "",
    ].join("\n");

    const result = parseDeltaSpec(content);

    expect(result.added).toHaveLength(2);
    expect(result.added[0]!.name).toBe("A");
    expect(result.added[1]!.name).toBe("B");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-014: parseDeltaSpec — case sensitive section names
// ---------------------------------------------------------------------------

describe("TC-SM-014: parseDeltaSpec — case sensitive", () => {
  it("does not match '## added requirements' (lowercase)", () => {
    const content = "## added requirements\n\n### Requirement: Foo\n\nbody\n";
    const result = parseDeltaSpec(content);
    expect(result.added).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-020: parseBaselineSpec — standard baseline
// ---------------------------------------------------------------------------

describe("TC-SM-020: parseBaselineSpec — standard baseline", () => {
  it("parses preamble, 2 requirements, and empty postamble", () => {
    const content =
      "## Purpose\n\nTBD\n\n## Requirements\n\n### Requirement: A\n\ncontent A\n\n### Requirement: B\n\ncontent B\n";

    const result = parseBaselineSpec(content);

    expect(result.preamble).toContain("## Purpose");
    expect(result.preamble).toContain("TBD");
    expect(result.requirements).toHaveLength(2);
    expect(result.requirements[0]!.name).toBe("A");
    expect(result.requirements[1]!.name).toBe("B");
    expect(result.postamble).toBe("");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-021: parseBaselineSpec — no Requirements section
// ---------------------------------------------------------------------------

describe("TC-SM-021: parseBaselineSpec — no Requirements section", () => {
  it("returns requirements=[] and full text in preamble", () => {
    const content = "## Purpose\n\nTBD\n";
    const result = parseBaselineSpec(content);

    expect(result.requirements).toHaveLength(0);
    expect(result.preamble).toContain("## Purpose");
    expect(result.postamble).toBe("");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-022: parseBaselineSpec — postamble present
// ---------------------------------------------------------------------------

describe("TC-SM-022: parseBaselineSpec — postamble present", () => {
  it("correctly splits Requirements from ## See Also", () => {
    const content = [
      "## Purpose",
      "",
      "TBD",
      "",
      "## Requirements",
      "",
      "### Requirement: X",
      "",
      "body",
      "",
      "## See Also",
      "",
      "Some links",
      "",
    ].join("\n");

    const result = parseBaselineSpec(content);

    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0]!.name).toBe("X");
    expect(result.postamble).toContain("## See Also");
    expect(result.postamble).toContain("Some links");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-023: parseBaselineSpec — empty string
// ---------------------------------------------------------------------------

describe("TC-SM-023: parseBaselineSpec — empty string", () => {
  it("returns empty preamble, requirements, and postamble", () => {
    const result = parseBaselineSpec("");
    expect(result).toEqual({ preamble: "", requirements: [], postamble: "" });
  });
});

// ---------------------------------------------------------------------------
// TC-SM-030: validateDeltaSpec — valid delta
// ---------------------------------------------------------------------------

describe("TC-SM-030: validateDeltaSpec — valid delta", () => {
  it("returns empty array for valid delta", () => {
    const delta = {
      added: [makeBlock("New")],
      modified: [makeBlock("Changed")],
      removed: [makeBlock("Gone")],
    };
    expect(validateDeltaSpec(delta)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-031: validateDeltaSpec — duplicate in ADDED
// ---------------------------------------------------------------------------

describe("TC-SM-031: validateDeltaSpec — duplicate in ADDED", () => {
  it("returns error with name 'Foo'", () => {
    const delta = {
      added: [makeBlock("Foo"), makeBlock("Foo")],
      modified: [],
      removed: [],
    };
    const errors = validateDeltaSpec(delta);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.includes("Foo"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-032: validateDeltaSpec — duplicate in MODIFIED
// ---------------------------------------------------------------------------

describe("TC-SM-032: validateDeltaSpec — duplicate in MODIFIED", () => {
  it("returns error with name 'Bar'", () => {
    const delta = {
      added: [],
      modified: [makeBlock("Bar"), makeBlock("Bar")],
      removed: [],
    };
    const errors = validateDeltaSpec(delta);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.includes("Bar"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-033: validateDeltaSpec — ADDED and MODIFIED cross-section conflict
// ---------------------------------------------------------------------------

describe("TC-SM-033: validateDeltaSpec — ADDED and MODIFIED conflict", () => {
  it("returns cross-section conflict error with name 'Foo'", () => {
    const delta = {
      added: [makeBlock("Foo")],
      modified: [makeBlock("Foo")],
      removed: [],
    };
    const errors = validateDeltaSpec(delta);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.includes("Foo"))).toBe(true);
    // Should mention cross-section or conflict
    expect(errors.some((e) => e.toLowerCase().includes("conflict") || e.toLowerCase().includes("cross"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-034: validateDeltaSpec — ADDED and REMOVED cross-section conflict
// ---------------------------------------------------------------------------

describe("TC-SM-034: validateDeltaSpec — ADDED and REMOVED conflict", () => {
  it("returns error with name 'Foo'", () => {
    const delta = {
      added: [makeBlock("Foo")],
      modified: [],
      removed: [makeBlock("Foo")],
    };
    const errors = validateDeltaSpec(delta);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.includes("Foo"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-035: validateDeltaSpec — MODIFIED and REMOVED cross-section conflict
// ---------------------------------------------------------------------------

describe("TC-SM-035: validateDeltaSpec — MODIFIED and REMOVED conflict", () => {
  it("returns error with name 'Foo'", () => {
    const delta = {
      added: [],
      modified: [makeBlock("Foo")],
      removed: [makeBlock("Foo")],
    };
    const errors = validateDeltaSpec(delta);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors.some((e) => e.includes("Foo"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-040: applyMerge — ADDED
// ---------------------------------------------------------------------------

describe("TC-SM-040: applyMerge — ADDED appends new requirement", () => {
  it("adds NewReq to the end of baseline requirements", () => {
    const baseline = makeBaselineSpec(["Existing"]);
    const delta = {
      added: [makeBlock("NewReq")],
      modified: [],
      removed: [],
    };

    const result = applyMerge(baseline, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.merged).toContain("NewReq");
    expect(result.merged).toContain("Existing");
    // NewReq should appear after Existing
    expect(result.merged.indexOf("Existing")).toBeLessThan(result.merged.indexOf("NewReq"));
  });
});

// ---------------------------------------------------------------------------
// TC-SM-041: applyMerge — MODIFIED
// ---------------------------------------------------------------------------

describe("TC-SM-041: applyMerge — MODIFIED replaces requirement", () => {
  it("replaces old body with new body", () => {
    const baseline: BaselineSpec = {
      preamble: "## Purpose\n\nTBD\n\n",
      requirements: [{ name: "Target", content: "### Requirement: Target\n\nold body\n" }],
      postamble: "",
    };
    const delta = {
      added: [],
      modified: [{ name: "Target", content: "### Requirement: Target\n\nnew body\n" }],
      removed: [],
    };

    const result = applyMerge(baseline, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.merged).toContain("new body");
    expect(result.merged).not.toContain("old body");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-042: applyMerge — REMOVED
// ---------------------------------------------------------------------------

describe("TC-SM-042: applyMerge — REMOVED deletes requirement", () => {
  it("removes ToRemove, keeps KeepMe", () => {
    const baseline = makeBaselineSpec(["ToRemove", "KeepMe"]);
    const delta = {
      added: [],
      modified: [],
      removed: [makeBlock("ToRemove")],
    };

    const result = applyMerge(baseline, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.merged).not.toContain("ToRemove");
    expect(result.merged).toContain("KeepMe");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-043: applyMerge — composite ADDED + MODIFIED + REMOVED
// ---------------------------------------------------------------------------

describe("TC-SM-043: applyMerge — composite operations", () => {
  it("applies REMOVED + MODIFIED + ADDED in order", () => {
    const baseline = makeBaselineSpec(["Keep", "Modify", "Delete"]);
    const delta = {
      added: [makeBlock("NewOne")],
      modified: [{ name: "Modify", content: "### Requirement: Modify\n\nupdated\n" }],
      removed: [makeBlock("Delete")],
    };

    const result = applyMerge(baseline, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.merged).toContain("Keep");
    expect(result.merged).not.toContain("Delete");
    expect(result.merged).toContain("updated");
    expect(result.merged).toContain("NewOne");
    // NewOne should appear last (ADDED is appended at end)
    const lastReqIdx = result.merged.lastIndexOf("### Requirement:");
    expect(result.merged.slice(lastReqIdx)).toContain("NewOne");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-044: applyMerge — MODIFIED not found
// ---------------------------------------------------------------------------

describe("TC-SM-044: applyMerge — MODIFIED not found → error", () => {
  it("returns ok: false with error containing 'NonExistent'", () => {
    const baseline = makeBaselineSpec(["Existing"]);
    const delta = {
      added: [],
      modified: [makeBlock("NonExistent")],
      removed: [],
    };

    const result = applyMerge(baseline, delta);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("NonExistent"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-045: applyMerge — REMOVED not found
// ---------------------------------------------------------------------------

describe("TC-SM-045: applyMerge — REMOVED not found → error", () => {
  it("returns ok: false with error containing 'Ghost'", () => {
    const baseline = makeBaselineSpec(["Existing"]);
    const delta = {
      added: [],
      modified: [],
      removed: [makeBlock("Ghost")],
    };

    const result = applyMerge(baseline, delta);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("Ghost"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-046: applyMerge — ADDED already exists
// ---------------------------------------------------------------------------

describe("TC-SM-046: applyMerge — ADDED already exists → error", () => {
  it("returns ok: false with error containing 'AlreadyHere'", () => {
    const baseline = makeBaselineSpec(["AlreadyHere"]);
    const delta = {
      added: [makeBlock("AlreadyHere")],
      modified: [],
      removed: [],
    };

    const result = applyMerge(baseline, delta);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.includes("AlreadyHere"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-047: applyMerge — REMOVED then ADDED same name succeeds
// ---------------------------------------------------------------------------

describe("TC-SM-047: applyMerge — REMOVED then ADDED same name succeeds", () => {
  it("REMOVED + ADDED on same name returns ok:true", () => {
    const baseline = makeBaselineSpec(["Flip"]);
    const delta = {
      added: [{ name: "Flip", content: "### Requirement: Flip\n\nnew version\n" }],
      modified: [],
      removed: [makeBlock("Flip")],
    };

    const result = applyMerge(baseline, delta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.merged).toContain("new version");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-050: renderBaselineSpec — basic reconstruction
// ---------------------------------------------------------------------------

describe("TC-SM-050: renderBaselineSpec — basic reconstruction", () => {
  it("renders preamble + Requirements header + blocks", () => {
    const spec: BaselineSpec = {
      preamble: "## Purpose\n\nTBD\n\n",
      requirements: [{ name: "A", content: "### Requirement: A\n\nbody\n" }],
      postamble: "",
    };

    const result = renderBaselineSpec(spec);

    expect(result).toContain("## Purpose");
    expect(result).toContain("## Requirements");
    expect(result).toContain("### Requirement: A");
    expect(result).toContain("body");
    // Trailing newline
    expect(result.endsWith("\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-051: renderBaselineSpec — trailing newline guaranteed
// ---------------------------------------------------------------------------

describe("TC-SM-051: renderBaselineSpec — trailing newline guaranteed", () => {
  it("returns string ending with \\n even for empty requirements", () => {
    const spec: BaselineSpec = {
      preamble: "",
      requirements: [],
      postamble: "",
    };

    const result = renderBaselineSpec(spec);
    expect(result.endsWith("\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-060: createNewBaselineSpec — single ADDED block
// ---------------------------------------------------------------------------

describe("TC-SM-060: createNewBaselineSpec — single ADDED block", () => {
  it("creates baseline with ## Purpose TBD and the ADDED block", () => {
    const added = [{ name: "NewReq", content: "### Requirement: NewReq\n\nbody\n" }];
    const result = createNewBaselineSpec(added);

    expect(result).toContain("## Purpose");
    expect(result).toContain("TBD");
    expect(result).toContain("## Requirements");
    expect(result).toContain("### Requirement: NewReq");
    expect(result).toContain("body");
    expect(result.endsWith("\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-061: createNewBaselineSpec — multiple ADDED blocks
// ---------------------------------------------------------------------------

describe("TC-SM-061: createNewBaselineSpec — multiple ADDED blocks", () => {
  it("includes both blocks in order", () => {
    const added = [
      { name: "First", content: "### Requirement: First\n\nbody1\n" },
      { name: "Second", content: "### Requirement: Second\n\nbody2\n" },
    ];
    const result = createNewBaselineSpec(added);

    expect(result).toContain("First");
    expect(result).toContain("Second");
    // First should come before Second
    expect(result.indexOf("First")).toBeLessThan(result.indexOf("Second"));
  });
});

// ---------------------------------------------------------------------------
// TC-SM-070: mergeSpecsForChange — skip when specs/ doesn't exist
// ---------------------------------------------------------------------------

describe("TC-SM-070: mergeSpecsForChange — skip when specs/ not found", () => {
  it("returns ok:true skipped:true without calling readFile or spawn", async () => {
    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockResolvedValue(false),
    });

    const result = await mergeSpecsForChange({ slug: "my-slug", cwd: "/repo", spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(true);
    expect((fs.readFile as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-071: mergeSpecsForChange — ADDED success
// ---------------------------------------------------------------------------

describe("TC-SM-071: mergeSpecsForChange — ADDED success", () => {
  it("writes merged baseline and calls git add", async () => {
    const deltaContent = "## ADDED Requirements\n\n### Requirement: NewFeature\n\nnew content\n";
    const baselineContent =
      "## Purpose\n\nTBD\n\n## Requirements\n\n### Requirement: Existing\n\nexisting body\n";

    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockImplementation((p: string) => {
        if (p.endsWith("specs")) return Promise.resolve(true);
        // baseline exists
        if (p.includes("specrunner/specs/my-cap")) return Promise.resolve(true);
        return Promise.resolve(false);
      }),
      readdir: vi.fn().mockResolvedValue(["my-cap"]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      readFile: vi.fn().mockImplementation((p: string) => {
        if (p.includes("changes")) return Promise.resolve(deltaContent);
        return Promise.resolve(baselineContent);
      }),
    });

    const result = await mergeSpecsForChange({ slug: "my-slug", cwd: "/repo", spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(false);

    // writeFile called with baseline path
    const writeCalls = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls;
    expect(writeCalls).toHaveLength(1);
    expect(writeCalls[0]![0]).toContain("specrunner/specs/my-cap/spec.md");
    // Content should include both existing and new requirement
    expect(writeCalls[0]![1]).toContain("Existing");
    expect(writeCalls[0]![1]).toContain("NewFeature");

    // git add with specrunner/specs/
    const spawnCalls = (spawn as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = spawnCalls[spawnCalls.length - 1]!;
    expect(lastCall[0]).toBe("git");
    expect(lastCall[1]).toContain("add");
    expect(lastCall[1]).toContain("specrunner/specs/");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-072: mergeSpecsForChange — MODIFIED success
// ---------------------------------------------------------------------------

describe("TC-SM-072: mergeSpecsForChange — MODIFIED success", () => {
  it("replaces Target requirement in baseline", async () => {
    const deltaContent =
      "## MODIFIED Requirements\n\n### Requirement: Target\n\nupdated content\n";
    const baselineContent =
      "## Purpose\n\nTBD\n\n## Requirements\n\n### Requirement: Target\n\noriginal content\n";

    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockImplementation((p: string) => {
        if (p.endsWith("specs")) return Promise.resolve(true);
        if (p.includes("specrunner/specs")) return Promise.resolve(true);
        return Promise.resolve(false);
      }),
      readdir: vi.fn().mockResolvedValue(["cap"]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      readFile: vi.fn().mockImplementation((p: string) => {
        if (p.includes("changes")) return Promise.resolve(deltaContent);
        return Promise.resolve(baselineContent);
      }),
    });

    const result = await mergeSpecsForChange({ slug: "my-slug", cwd: "/repo", spawn, fs });

    expect(result.ok).toBe(true);
    const writeCalls = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls;
    expect(writeCalls[0]![1]).toContain("updated content");
    expect(writeCalls[0]![1]).not.toContain("original content");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-073: mergeSpecsForChange — REMOVED success
// ---------------------------------------------------------------------------

describe("TC-SM-073: mergeSpecsForChange — REMOVED success", () => {
  it("removes Gone requirement from baseline", async () => {
    const deltaContent = "## REMOVED Requirements\n\n### Requirement: Gone\n\nbody\n";
    const baselineContent =
      "## Purpose\n\nTBD\n\n## Requirements\n\n### Requirement: Gone\n\nbody\n\n### Requirement: Keep\n\nbody2\n";

    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockImplementation((p: string) => {
        if (p.endsWith("specs")) return Promise.resolve(true);
        if (p.includes("specrunner/specs")) return Promise.resolve(true);
        return Promise.resolve(false);
      }),
      readdir: vi.fn().mockResolvedValue(["cap"]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      readFile: vi.fn().mockImplementation((p: string) => {
        if (p.includes("changes")) return Promise.resolve(deltaContent);
        return Promise.resolve(baselineContent);
      }),
    });

    const result = await mergeSpecsForChange({ slug: "my-slug", cwd: "/repo", spawn, fs });

    expect(result.ok).toBe(true);
    const writeCalls = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls;
    expect(writeCalls[0]![1]).not.toContain("Gone");
    expect(writeCalls[0]![1]).toContain("Keep");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-074: mergeSpecsForChange — composite success
// ---------------------------------------------------------------------------

describe("TC-SM-074: mergeSpecsForChange — ADDED + MODIFIED + REMOVED composite", () => {
  it("applies all 3 operations and writes once", async () => {
    const deltaContent = [
      "## ADDED Requirements",
      "",
      "### Requirement: New",
      "",
      "new body",
      "",
      "## MODIFIED Requirements",
      "",
      "### Requirement: Modify",
      "",
      "updated body",
      "",
      "## REMOVED Requirements",
      "",
      "### Requirement: Delete",
      "",
      "old",
      "",
    ].join("\n");

    const baselineContent = [
      "## Purpose",
      "",
      "TBD",
      "",
      "## Requirements",
      "",
      "### Requirement: Keep",
      "",
      "body",
      "",
      "### Requirement: Modify",
      "",
      "original",
      "",
      "### Requirement: Delete",
      "",
      "body",
      "",
    ].join("\n");

    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockImplementation((p: string) => {
        if (p.endsWith("specs")) return Promise.resolve(true);
        if (p.includes("specrunner/specs")) return Promise.resolve(true);
        return Promise.resolve(false);
      }),
      readdir: vi.fn().mockResolvedValue(["cap"]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      readFile: vi.fn().mockImplementation((p: string) => {
        if (p.includes("changes")) return Promise.resolve(deltaContent);
        return Promise.resolve(baselineContent);
      }),
    });

    const result = await mergeSpecsForChange({ slug: "my-slug", cwd: "/repo", spawn, fs });

    expect(result.ok).toBe(true);
    const writeCalls = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls;
    expect(writeCalls).toHaveLength(1);
    const written = writeCalls[0]![1] as string;
    expect(written).toContain("Keep");
    expect(written).not.toContain("Delete");
    expect(written).toContain("updated body");
    expect(written).toContain("New");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-075: mergeSpecsForChange — new capability ADDED only
// ---------------------------------------------------------------------------

describe("TC-SM-075: mergeSpecsForChange — new capability ADDED only", () => {
  it("creates directory and writes new baseline", async () => {
    const deltaContent =
      "## ADDED Requirements\n\n### Requirement: Init\n\nfirst requirement\n";

    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockImplementation((p: string) => {
        if (p.endsWith("specs")) return Promise.resolve(true);
        // baseline does NOT exist
        return Promise.resolve(false);
      }),
      readdir: vi.fn().mockResolvedValue(["new-cap"]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      readFile: vi.fn().mockResolvedValue(deltaContent),
    });

    const result = await mergeSpecsForChange({ slug: "my-slug", cwd: "/repo", spawn, fs });

    expect(result.ok).toBe(true);

    // mkdir called for capability directory
    const mkdirCalls = (fs.mkdir as ReturnType<typeof vi.fn>).mock.calls;
    expect(mkdirCalls.some((c: unknown[]) => String(c[0]).includes("new-cap"))).toBe(true);

    // writeFile called for spec.md
    const writeCalls = (fs.writeFile as ReturnType<typeof vi.fn>).mock.calls;
    expect(writeCalls.some((c: unknown[]) => String(c[0]).includes("new-cap/spec.md"))).toBe(true);
    expect(writeCalls[0]![1]).toContain("## Purpose");
    expect(writeCalls[0]![1]).toContain("TBD");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-076: mergeSpecsForChange — new capability with MODIFIED → escalation
// ---------------------------------------------------------------------------

describe("TC-SM-076: mergeSpecsForChange — new capability MODIFIED → escalation", () => {
  it("returns ok:false without writing", async () => {
    const deltaContent =
      "## MODIFIED Requirements\n\n### Requirement: NotThere\n\nbody\n";

    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockImplementation((p: string) => {
        if (p.endsWith("specs")) return Promise.resolve(true);
        return Promise.resolve(false); // baseline does not exist
      }),
      readdir: vi.fn().mockResolvedValue(["cap"]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      readFile: vi.fn().mockResolvedValue(deltaContent),
    });

    const result = await mergeSpecsForChange({ slug: "my-slug", cwd: "/repo", spawn, fs });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.escalation).toContain("MODIFIED");
    expect((fs.writeFile as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-077: mergeSpecsForChange — new capability with REMOVED → escalation
// ---------------------------------------------------------------------------

describe("TC-SM-077: mergeSpecsForChange — new capability REMOVED → escalation", () => {
  it("returns ok:false without writing", async () => {
    const deltaContent = "## REMOVED Requirements\n\n### Requirement: Gone\n\nbody\n";

    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockImplementation((p: string) => {
        if (p.endsWith("specs")) return Promise.resolve(true);
        return Promise.resolve(false); // baseline does not exist
      }),
      readdir: vi.fn().mockResolvedValue(["cap"]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      readFile: vi.fn().mockResolvedValue(deltaContent),
    });

    const result = await mergeSpecsForChange({ slug: "my-slug", cwd: "/repo", spawn, fs });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.escalation).toContain("REMOVED");
    expect((fs.writeFile as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-078: mergeSpecsForChange — validation error → escalation, no writes
// ---------------------------------------------------------------------------

describe("TC-SM-078: mergeSpecsForChange — validation error → no writes", () => {
  it("returns ok:false and does not call writeFile or spawn", async () => {
    const deltaContent =
      "## ADDED Requirements\n\n### Requirement: Dup\n\nbody\n\n### Requirement: Dup\n\nbody2\n";

    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockImplementation((p: string) => {
        if (p.endsWith("specs")) return Promise.resolve(true);
        if (p.includes("specrunner/specs")) return Promise.resolve(true);
        return Promise.resolve(false);
      }),
      readdir: vi.fn().mockResolvedValue(["cap"]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      readFile: vi.fn().mockImplementation((p: string) => {
        if (p.includes("changes")) return Promise.resolve(deltaContent);
        return Promise.resolve(
          "## Purpose\n\nTBD\n\n## Requirements\n\n### Requirement: Existing\n\nbody\n",
        );
      }),
    });

    const result = await mergeSpecsForChange({ slug: "my-slug", cwd: "/repo", spawn, fs });

    expect(result.ok).toBe(false);
    expect((fs.writeFile as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-079: mergeSpecsForChange — git add failure → escalation
// ---------------------------------------------------------------------------

describe("TC-SM-079: mergeSpecsForChange — git add failure → escalation", () => {
  it("returns ok:false when spawn exits non-zero", async () => {
    const deltaContent =
      "## ADDED Requirements\n\n### Requirement: New\n\nbody\n";
    const baselineContent =
      "## Purpose\n\nTBD\n\n## Requirements\n\n### Requirement: Existing\n\nbody\n";

    const spawn = makeSpawn(1, "", "git add failed");
    const fs = makeFs({
      exists: vi.fn().mockImplementation((p: string) => {
        if (p.endsWith("specs")) return Promise.resolve(true);
        if (p.includes("specrunner/specs")) return Promise.resolve(true);
        return Promise.resolve(false);
      }),
      readdir: vi.fn().mockResolvedValue(["cap"]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      readFile: vi.fn().mockImplementation((p: string) => {
        if (p.includes("changes")) return Promise.resolve(deltaContent);
        return Promise.resolve(baselineContent);
      }),
    });

    const result = await mergeSpecsForChange({ slug: "my-slug", cwd: "/repo", spawn, fs });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.escalation.toLowerCase()).toMatch(/git add|spec-merge/);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-080: mergeSpecsForChange — 2-pass: 1 of 2 capabilities invalid → zero writes
// ---------------------------------------------------------------------------

describe("TC-SM-080: mergeSpecsForChange — 2-pass: partial error means zero writes", () => {
  it("does not write cap-a when cap-b fails", async () => {
    const validDelta =
      "## ADDED Requirements\n\n### Requirement: X\n\nbody\n";
    const invalidDelta =
      "## MODIFIED Requirements\n\n### Requirement: MissingInBaseline\n\nbody\n";
    const baselineContent =
      "## Purpose\n\nTBD\n\n## Requirements\n\n### Requirement: Existing\n\nbody\n";

    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockImplementation((p: string) => {
        if (p.endsWith("specs")) return Promise.resolve(true);
        if (p.includes("specrunner/specs")) return Promise.resolve(true);
        return Promise.resolve(false);
      }),
      readdir: vi.fn().mockResolvedValue(["cap-a", "cap-b"]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      readFile: vi.fn().mockImplementation((p: string) => {
        if (p.includes("cap-a") && p.includes("changes")) return Promise.resolve(validDelta);
        if (p.includes("cap-b") && p.includes("changes")) return Promise.resolve(invalidDelta);
        // baseline for both caps
        return Promise.resolve(baselineContent);
      }),
    });

    const result = await mergeSpecsForChange({ slug: "my-slug", cwd: "/repo", spawn, fs });

    expect(result.ok).toBe(false);
    expect((fs.writeFile as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-081: mergeSpecsForChange — 2 valid capabilities → 2 writes, 1 git add
// ---------------------------------------------------------------------------

describe("TC-SM-081: mergeSpecsForChange — 2 valid capabilities → 2 writes, 1 git add", () => {
  it("calls writeFile twice and spawn once", async () => {
    const deltaA = "## ADDED Requirements\n\n### Requirement: A\n\nbody\n";
    const deltaB = "## ADDED Requirements\n\n### Requirement: B\n\nbody\n";
    const baseline =
      "## Purpose\n\nTBD\n\n## Requirements\n\n### Requirement: Existing\n\nbody\n";

    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockImplementation((p: string) => {
        if (p.endsWith("specs")) return Promise.resolve(true);
        if (p.includes("specrunner/specs")) return Promise.resolve(true);
        return Promise.resolve(false);
      }),
      readdir: vi.fn().mockResolvedValue(["cap-a", "cap-b"]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      readFile: vi.fn().mockImplementation((p: string) => {
        if (p.includes("cap-a") && p.includes("changes")) return Promise.resolve(deltaA);
        if (p.includes("cap-b") && p.includes("changes")) return Promise.resolve(deltaB);
        return Promise.resolve(baseline);
      }),
    });

    const result = await mergeSpecsForChange({ slug: "my-slug", cwd: "/repo", spawn, fs });

    expect(result.ok).toBe(true);
    expect((fs.writeFile as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
    const spawnCall = (spawn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(spawnCall[0]).toBe("git");
    expect(spawnCall[1]).toContain("add");
    expect(spawnCall[1]).toContain("specrunner/specs/");
  });
});

// ---------------------------------------------------------------------------
// TC-SM-082: escalation format check
// ---------------------------------------------------------------------------

describe("TC-SM-082: escalation format follows formatEscalation", () => {
  it("escalation contains required fields", async () => {
    const deltaContent =
      "## ADDED Requirements\n\n### Requirement: Dup\n\nbody\n\n### Requirement: Dup\n\nbody2\n";

    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockImplementation((p: string) => {
        if (p.endsWith("specs")) return Promise.resolve(true);
        if (p.includes("specrunner/specs")) return Promise.resolve(true);
        return Promise.resolve(false);
      }),
      readdir: vi.fn().mockResolvedValue(["cap"]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      readFile: vi.fn().mockImplementation((p: string) => {
        if (p.includes("changes")) return Promise.resolve(deltaContent);
        return Promise.resolve("## Purpose\n\nTBD\n\n## Requirements\n\n");
      }),
    });

    const result = await mergeSpecsForChange({ slug: "my-slug", cwd: "/repo", spawn, fs });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(1);
    // formatEscalation includes these required fields
    expect(result.escalation).toContain("Failed Step:");
    expect(result.escalation).toContain("Detected State:");
    expect(result.escalation).toContain("Resume Command:");
  });
});
