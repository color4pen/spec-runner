/**
 * Tests that hint messages only reference commands that are registered in COMMANDS.
 *
 * Rationale: prevents dead-end UX where a hint directs users to an unimplemented command.
 * Regression guard for: finish-hint-actionable-fallback (issue #73)
 *
 * TC-005: Auth prescriptions in PROVIDER_READINESS_HINTS name only real commands
 * TC-014: doctor hints reference registered commands (including subcommands)
 */
import { describe, it, expect } from "vitest";
import { COMMANDS } from "../src/cli/command-registry.js";
import type { CommandEntry, ParentCommandDef } from "../src/cli/command-registry.js";
import { STATUS_HINTS } from "../src/core/finish/job-state-update.js";
import { pollTimeoutError } from "../src/errors.js";
import { PROVIDER_READINESS_HINTS } from "../src/core/runtime/provider-readiness.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/** Extract `specrunner <verb>` patterns from a hint string. Returns top-level verb only. */
function extractCommandVerbs(hint: string): string[] {
  const matches = [...hint.matchAll(/specrunner (\w+)/g)];
  return matches.map((m) => m[1]!);
}

/**
 * Extract `specrunner <verb> <sub>` two-word patterns.
 * Returns { verb, sub } pairs where sub is the second word.
 */
function extractCommandVerbSubs(hint: string): Array<{ verb: string; sub: string }> {
  const matches = [...hint.matchAll(/specrunner (\w+) (\w+)/g)];
  return matches.map((m) => ({ verb: m[1]!, sub: m[2]! }));
}

function isParent(entry: CommandEntry): entry is ParentCommandDef {
  return "subcommands" in entry;
}

const registeredCommands = new Set(Object.keys(COMMANDS));

describe("hint command existence", () => {
  it("STATUS_HINTS reference only registered commands", () => {
    for (const [status, hint] of Object.entries(STATUS_HINTS)) {
      const verbs = extractCommandVerbs(hint);
      for (const verb of verbs) {
        expect(
          registeredCommands.has(verb),
          `STATUS_HINTS["${status}"] references unregistered command 'specrunner ${verb}'`,
        ).toBe(true);
      }
    }
  });

  it("pollTimeoutError hint references only registered commands", () => {
    const error = pollTimeoutError("dummy-session-id", 60000);
    const verbs = extractCommandVerbs(error.hint);
    for (const verb of verbs) {
      expect(
        registeredCommands.has(verb),
        `pollTimeoutError hint references unregistered command 'specrunner ${verb}'`,
      ).toBe(true);
    }
  });
});

// TC-005: Auth prescriptions name only real commands (including subcommands)
describe("TC-005: PROVIDER_READINESS_HINTS reference only registered commands", () => {
  it("every specrunner <verb> in PROVIDER_READINESS_HINTS is a registered command", () => {
    const hints = PROVIDER_READINESS_HINTS as Record<string, string>;
    for (const [kind, hint] of Object.entries(hints)) {
      const verbs = extractCommandVerbs(hint);
      for (const verb of verbs) {
        expect(
          registeredCommands.has(verb),
          `PROVIDER_READINESS_HINTS["${kind}"] references unregistered command 'specrunner ${verb}'`,
        ).toBe(true);
      }
    }
  });

  it("every specrunner <verb> <sub> in PROVIDER_READINESS_HINTS has a registered subcommand", () => {
    const hints = PROVIDER_READINESS_HINTS as Record<string, string>;
    for (const [kind, hint] of Object.entries(hints)) {
      const verbSubs = extractCommandVerbSubs(hint);
      for (const { verb, sub } of verbSubs) {
        const entry = COMMANDS[verb];
        if (!entry) {
          // top-level check already handled above; skip here
          continue;
        }
        if (isParent(entry)) {
          expect(
            Object.prototype.hasOwnProperty.call(entry.subcommands, sub),
            `PROVIDER_READINESS_HINTS["${kind}"] references unregistered subcommand 'specrunner ${verb} ${sub}'`,
          ).toBe(true);
        }
        // If entry is a CommandDef (not parent), the sub is likely a positional arg — skip subcommand check
      }
    }
  });
});

// TC-014: doctor hints reference registered commands (subcommand level)
describe("TC-014: doctor hints reference registered commands (including subcommands)", () => {
  const DOCTOR_CHECKS_DIR = path.resolve(__dirname, "../src/core/doctor");

  /** Recursively collect all .ts files under a directory. */
  async function collectTsFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await collectTsFiles(fullPath)));
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it("every 'specrunner <verb>' in doctor hints is a registered top-level command", async () => {
    const tsFiles = await collectTsFiles(DOCTOR_CHECKS_DIR);
    const violations: string[] = [];

    for (const filePath of tsFiles) {
      const content = await fs.readFile(filePath, "utf-8");
      // Extract hint strings: look for hint: "..." or hint: `...` patterns
      const hintMatches = [...content.matchAll(/hint\s*:\s*["'`]([^"'`]+)["'`]/g)];
      for (const m of hintMatches) {
        const hint = m[1] ?? "";
        const verbs = extractCommandVerbs(hint);
        for (const verb of verbs) {
          if (!registeredCommands.has(verb)) {
            violations.push(
              `${path.relative(DOCTOR_CHECKS_DIR, filePath)}: hint references unregistered command 'specrunner ${verb}': ${hint.slice(0, 80)}`,
            );
          }
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(`Doctor hints reference unregistered commands:\n  ${violations.join("\n  ")}`);
    }
    expect(violations.length).toBe(0);
  });

  it("every 'specrunner <verb> <sub>' in doctor hints has a registered subcommand", async () => {
    const tsFiles = await collectTsFiles(DOCTOR_CHECKS_DIR);
    const violations: string[] = [];

    for (const filePath of tsFiles) {
      const content = await fs.readFile(filePath, "utf-8");
      const hintMatches = [...content.matchAll(/hint\s*:\s*["'`]([^"'`]+)["'`]/g)];
      for (const m of hintMatches) {
        const hint = m[1] ?? "";
        const verbSubs = extractCommandVerbSubs(hint);
        for (const { verb, sub } of verbSubs) {
          const entry = COMMANDS[verb];
          if (!entry || !isParent(entry)) continue;
          if (!Object.prototype.hasOwnProperty.call(entry.subcommands, sub)) {
            violations.push(
              `${path.relative(DOCTOR_CHECKS_DIR, filePath)}: hint references unregistered subcommand 'specrunner ${verb} ${sub}': ${hint.slice(0, 80)}`,
            );
          }
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(`Doctor hints reference unregistered subcommands:\n  ${violations.join("\n  ")}`);
    }
    expect(violations.length).toBe(0);
  });
});
