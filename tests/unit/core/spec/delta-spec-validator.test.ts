/**
 * Unit tests for validateDeltaSpecPaths
 *
 * TC-V-01: canonical path + valid content → { ok: true }
 * TC-V-02: delta-spec/<capability>.md → legacy-flat-dir violation
 * TC-V-03: delta-spec.md → legacy-flat-file violation
 * TC-V-04: specs/<name>.delta.md → legacy-flat-file violation
 * TC-V-05: canonical path but section header missing "Requirements" suffix → missing-requirements-section
 * TC-V-06: canonical path + section header + no Requirement block → empty-section
 * TC-V-07: canonical path + legacy path coexist → legacy violation registered
 * TC-V-08: multiple canonical paths all ok → { ok: true }
 */
import { describe, it, expect } from "vitest";
import { validateDeltaSpecPaths } from "../../../../src/core/spec/delta-spec-validator.js";
import type { DeltaSpecValidatorFs } from "../../../../src/core/spec/delta-spec-validator.js";

const CHANGE_PATH = "/work/specrunner/changes/my-change";

/** Build a mock DeltaSpecValidatorFs from a map of path → content. */
function makeFsMock(files: Record<string, string>): DeltaSpecValidatorFs {
  return {
    readdir: async (p: string) => {
      // Return entries (basenames) that are direct children of p
      const prefix = p.endsWith("/") ? p : p + "/";
      const seen = new Set<string>();
      for (const filePath of Object.keys(files)) {
        if (filePath.startsWith(prefix)) {
          const rest = filePath.slice(prefix.length);
          const parts = rest.split("/");
          if (parts.length > 0 && parts[0]) {
            seen.add(parts[0]);
          }
        }
      }
      if (seen.size === 0) {
        throw new Error(`ENOENT: no such directory: ${p}`);
      }
      return [...seen];
    },
    readFile: async (p: string) => {
      if (p in files) return files[p]!;
      throw new Error(`ENOENT: no such file: ${p}`);
    },
  };
}

/** Minimal valid spec.md content */
function validSpecContent(capability: string = "my-capability"): string {
  return `# ${capability} Spec

## ADDED Requirements

### Requirement: The system SHALL do something

The system SHALL support the feature.

#### Scenario: Basic usage

- **GIVEN** a user
- **WHEN** they use the feature
- **THEN** it works
`;
}

// ---------------------------------------------------------------------------
// TC-V-01: canonical path + valid content → { ok: true }
// ---------------------------------------------------------------------------
describe("TC-V-01: canonical path + valid section + non-empty Requirement → ok: true", () => {
  it("returns { ok: true } when no violations exist", async () => {
    const files = {
      [`${CHANGE_PATH}/design.md`]: "# Design",
      [`${CHANGE_PATH}/tasks.md`]: "# Tasks",
      [`${CHANGE_PATH}/specs/my-capability/spec.md`]: validSpecContent("my-capability"),
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files));
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-V-02: delta-spec/<cap>.md → legacy-flat-dir violation
// ---------------------------------------------------------------------------
describe("TC-V-02: <change>/delta-spec/<capability>.md → legacy-flat-dir", () => {
  it("detects files in delta-spec/ subdirectory as legacy-flat-dir violations", async () => {
    const files = {
      [`${CHANGE_PATH}/delta-spec/my-capability.md`]: "# Delta Spec\n\n## ADDED Requirements\n\n### Requirement: Something\n\nThe system SHALL do something.\n\n#### Scenario: Basic\n\n- **WHEN** X\n- **THEN** Y\n",
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.reason).toBe("legacy-flat-dir");
      expect(result.violations[0]!.path).toContain("delta-spec/my-capability.md");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-V-03: delta-spec.md → legacy-flat-file violation
// ---------------------------------------------------------------------------
describe("TC-V-03: <change>/delta-spec.md → legacy-flat-file", () => {
  it("detects delta-spec.md at change root as legacy-flat-file violation", async () => {
    const files = {
      [`${CHANGE_PATH}/delta-spec.md`]: "# Delta Spec",
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.reason).toBe("legacy-flat-file");
      expect(result.violations[0]!.path).toContain("delta-spec.md");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-V-04: specs/<name>.delta.md → legacy-flat-file violation
// ---------------------------------------------------------------------------
describe("TC-V-04: <change>/specs/<name>.delta.md → legacy-flat-file", () => {
  it("detects .delta.md files directly in specs/ as legacy-flat-file violations", async () => {
    const files = {
      [`${CHANGE_PATH}/specs/my-capability.delta.md`]: "# Delta Spec",
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.reason).toBe("legacy-flat-file");
      expect(result.violations[0]!.path).toContain("my-capability.delta.md");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-V-05: canonical path but section header lacks "Requirements" suffix → missing-requirements-section
// ---------------------------------------------------------------------------
describe("TC-V-05: canonical path but section is '## ADDED' (no 'Requirements') → missing-requirements-section", () => {
  it("detects missing-requirements-section when header lacks 'Requirements' suffix", async () => {
    const badContent = `# Spec

## ADDED

### Requirement: The system SHALL do something

The system SHALL do something.

#### Scenario: Basic

- **WHEN** X
- **THEN** Y
`;
    const files = {
      [`${CHANGE_PATH}/specs/cap/spec.md`]: badContent,
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.reason).toBe("missing-requirements-section");
      expect(result.violations[0]!.path).toContain("specs/cap/spec.md");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-V-06: canonical path + section header + no Requirement block → empty-section
// ---------------------------------------------------------------------------
describe("TC-V-06: canonical path + section header + 0 Requirement blocks → empty-section", () => {
  it("detects empty-section when a valid section header has no Requirement blocks", async () => {
    const emptySection = `# Spec

## ADDED Requirements

No requirements here yet.
`;
    const files = {
      [`${CHANGE_PATH}/specs/cap/spec.md`]: emptySection,
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.reason).toBe("empty-section");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-V-07: canonical path + legacy path coexist → legacy violation registered
// ---------------------------------------------------------------------------
describe("TC-V-07: canonical path + legacy path coexist → legacy violation registered", () => {
  it("reports legacy violation even when a canonical path also exists", async () => {
    const files = {
      [`${CHANGE_PATH}/delta-spec.md`]: "# Legacy",
      [`${CHANGE_PATH}/specs/cap/spec.md`]: validSpecContent("cap"),
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const legacyViolation = result.violations.find((v) => v.reason === "legacy-flat-file");
      expect(legacyViolation).toBeDefined();
    }
  });

  it("canonical spec.md is still validated even when legacy path exists", async () => {
    const files = {
      [`${CHANGE_PATH}/delta-spec.md`]: "# Legacy",
      [`${CHANGE_PATH}/specs/cap/spec.md`]: validSpecContent("cap"),
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files));
    // Only 1 violation: the legacy-flat-file. canonical is valid.
    if (!result.ok) {
      const legacyViolations = result.violations.filter((v) => v.reason === "legacy-flat-file");
      expect(legacyViolations).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-V-08: multiple canonical paths all ok → { ok: true }
// ---------------------------------------------------------------------------
describe("TC-V-08: multiple capabilities, all canonical and valid → ok: true", () => {
  it("returns { ok: true } when all specs/<cap>/spec.md files are valid", async () => {
    const files = {
      [`${CHANGE_PATH}/specs/cap-a/spec.md`]: validSpecContent("cap-a"),
      [`${CHANGE_PATH}/specs/cap-b/spec.md`]: validSpecContent("cap-b"),
      [`${CHANGE_PATH}/design.md`]: "# Design",
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files));
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Additional: specs/<name>.md directly in specs/ (no subdir) → non-canonical-path
// ---------------------------------------------------------------------------
describe("specs/<name>.md directly in specs/ without subdir → non-canonical-path", () => {
  it("detects non-canonical-path for .md files directly in specs/", async () => {
    const files = {
      [`${CHANGE_PATH}/specs/my-capability.md`]: "# Direct file",
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.reason).toBe("non-canonical-path");
    }
  });
});

// ---------------------------------------------------------------------------
// Edge: empty change folder → ok: true
// ---------------------------------------------------------------------------
describe("Empty or non-existent change folder → ok: true", () => {
  it("returns ok: true when changePath does not exist", async () => {
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock({}));
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-V-10: delta-spec.md + delta-spec/<cap>.md both present → both violations reported
// ---------------------------------------------------------------------------
describe("TC-V-10: multiple violations are reported in a single result", () => {
  it("reports both legacy-flat-file and legacy-flat-dir violations simultaneously", async () => {
    const files = {
      [`${CHANGE_PATH}/delta-spec.md`]: "# Legacy Flat File",
      [`${CHANGE_PATH}/delta-spec/my-capability.md`]: "# Legacy Flat Dir",
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const flatFileViolation = result.violations.find((v) => v.reason === "legacy-flat-file");
      const flatDirViolation = result.violations.find((v) => v.reason === "legacy-flat-dir");
      expect(flatFileViolation).toBeDefined();
      expect(flatDirViolation).toBeDefined();
      expect(result.violations.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-V-11: type=spec-change, specs/ has 0 .md files → needs-fix
// ---------------------------------------------------------------------------
describe("TC-V-11: type=spec-change + no specs → no-specs-for-required-type", () => {
  it("returns violation when type=spec-change and specs/ has no .md files", async () => {
    const files = {
      [`${CHANGE_PATH}/design.md`]: "# Design",
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files), "spec-change");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.reason).toBe("no-specs-for-required-type");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-V-12: type=new-feature, specs/ has 0 .md files → needs-fix
// ---------------------------------------------------------------------------
describe("TC-V-12: type=new-feature + no specs → no-specs-for-required-type", () => {
  it("returns violation when type=new-feature and specs/ has no .md files", async () => {
    const files = {
      [`${CHANGE_PATH}/design.md`]: "# Design",
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files), "new-feature");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.reason).toBe("no-specs-for-required-type");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-V-13: type=bug-fix, specs/ has 0 .md files → approved (対象外)
// ---------------------------------------------------------------------------
describe("TC-V-13: type=bug-fix + no specs → ok (not required)", () => {
  it("returns ok: true when type=bug-fix even if specs/ is empty", async () => {
    const files = {
      [`${CHANGE_PATH}/design.md`]: "# Design",
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files), "bug-fix");
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-V-14: type=refactoring, specs/ has 0 .md files → approved (対象外)
// ---------------------------------------------------------------------------
describe("TC-V-14: type=refactoring + no specs → ok (not required)", () => {
  it("returns ok: true when type=refactoring even if specs/ is empty", async () => {
    const files = {
      [`${CHANGE_PATH}/design.md`]: "# Design",
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files), "refactoring");
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-V-15: type=spec-change, specs/ has 1 .md file → existing Step 1-4 continues
// ---------------------------------------------------------------------------
describe("TC-V-15: type=spec-change + valid spec → existing steps continue", () => {
  it("does not trigger no-specs violation when specs/ has .md files", async () => {
    const files = {
      [`${CHANGE_PATH}/design.md`]: "# Design",
      [`${CHANGE_PATH}/specs/my-cap/spec.md`]: validSpecContent("my-cap"),
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files), "spec-change");
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MODIFIED Requirements section also triggers valid detection
// ---------------------------------------------------------------------------
describe("MODIFIED Requirements section is recognised as valid", () => {
  it("accepts ## MODIFIED Requirements as a valid section", async () => {
    const content = `# Spec

## MODIFIED Requirements

### Requirement: The system SHALL support X

The system SHALL support X.

#### Scenario: Modified behaviour

- **WHEN** X
- **THEN** Y
`;
    const files = {
      [`${CHANGE_PATH}/specs/cap/spec.md`]: content,
    };
    const result = await validateDeltaSpecPaths(CHANGE_PATH, makeFsMock(files));
    expect(result.ok).toBe(true);
  });
});
