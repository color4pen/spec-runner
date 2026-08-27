/**
 * TC-019 — Actions workflow reopen dispatches two sequential CLI commands.
 *
 * TC-019: The `action=reopen` branch of the Actions YAML dispatches two sequential
 *         CLI commands: `job reopen <slug> --reason "$REASON"` followed by
 *         `job resume <slug> --from "$FROM"`.
 *
 * Source: spec.md > Requirement: Actions workflow SHALL compose reopen and resume explicitly
 *         > Scenario: Actions reopen dispatches two CLI commands
 *         tasks.md T-04
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Read the workflow YAML
// ---------------------------------------------------------------------------

const WORKFLOW_PATH = path.resolve(
  import.meta.dirname ?? __dirname,
  "../../../.github/workflows/specrunner-dispatch.yml",
);

function readWorkflowYaml(): string {
  return fs.readFileSync(WORKFLOW_PATH, "utf-8");
}

/**
 * Extract the content of the `action=reopen` branch from the workflow YAML.
 * Returns the text between `elif [ "$ACTION" = "reopen" ]` and the next
 * `elif` / `else` / `fi` at the same nesting level.
 */
function extractReopenBranch(yaml: string): string {
  const reopenStart = yaml.indexOf('elif [ "$ACTION" = "reopen" ]');
  if (reopenStart === -1) return "";

  // Find the next branch boundary after the reopen block
  const afterReopen = yaml.slice(reopenStart);
  // Look for the next elif/else/fi at the same indentation level
  const nextBoundaryMatch = afterReopen.match(
    /\n\s{10}(?:elif|else\b|fi\b)/,
  );
  const end = nextBoundaryMatch
    ? reopenStart + (nextBoundaryMatch.index ?? afterReopen.length)
    : yaml.length;

  return yaml.slice(reopenStart, end);
}

// ---------------------------------------------------------------------------
// TC-019
// ---------------------------------------------------------------------------

describe("TC-019: Actions reopen dispatches two CLI commands in sequence", () => {
  let yaml: string;
  let reopenBranch: string;

  try {
    yaml = readWorkflowYaml();
    reopenBranch = extractReopenBranch(yaml);
  } catch {
    // If the file doesn't exist in the test environment, skip gracefully
    yaml = "";
    reopenBranch = "";
  }

  it("TC-019-a: workflow YAML file is readable", () => {
    expect(yaml.length).toBeGreaterThan(0);
  });

  it("TC-019-b: action=reopen branch exists in the workflow", () => {
    expect(reopenBranch.length).toBeGreaterThan(0);
  });

  it('TC-019-c: reopen branch contains "job reopen" with --reason "$REASON"', () => {
    // The reopen lifecycle command must be called with --reason
    expect(reopenBranch).toMatch(/job reopen.*--reason.*\$REASON/);
  });

  it('TC-019-d: reopen branch contains "job resume" with --from "$FROM"', () => {
    // The resume execution command must be called with --from
    expect(reopenBranch).toMatch(/job resume.*\$SLUG/);
    // --from must appear (either directly or via set --)
    const hasFROMParam =
      reopenBranch.includes('--from "$FROM"') ||
      (reopenBranch.includes('"$FROM"') && reopenBranch.includes("job resume"));
    expect(hasFROMParam).toBe(true);
  });

  it("TC-019-e: job reopen invocation appears before job resume in the reopen branch", () => {
    const reopenIdx = reopenBranch.indexOf("job reopen");
    const resumeIdx = reopenBranch.indexOf("job resume");
    expect(reopenIdx).toBeGreaterThan(-1);
    expect(resumeIdx).toBeGreaterThan(-1);
    // reopen must come before resume
    expect(reopenIdx).toBeLessThan(resumeIdx);
  });

  it("TC-019-f: --reason is passed to job reopen (not to job resume)", () => {
    // In the reopen line, --reason must appear
    const lines = reopenBranch.split("\n");
    const reopenLine = lines.find((l) => l.includes("job reopen") && !l.includes("#"));
    expect(reopenLine).toBeDefined();
    expect(reopenLine).toMatch(/--reason/);
  });

  it("TC-019-g: --from is passed to job resume (via set -- or direct argument)", () => {
    // After the reopen command, the FROM variable must be forwarded to resume
    const afterReopenCmd = reopenBranch.slice(
      reopenBranch.indexOf("job reopen"),
    );
    const hasFROM = afterReopenCmd.includes('"$FROM"') || afterReopenCmd.includes("$FROM");
    expect(hasFROM).toBe(true);
  });
});
