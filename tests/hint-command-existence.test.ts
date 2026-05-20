/**
 * Tests that hint messages only reference commands that are registered in COMMANDS.
 *
 * Rationale: prevents dead-end UX where a hint directs users to an unimplemented command.
 * Regression guard for: finish-hint-actionable-fallback (issue #73)
 */
import { describe, it, expect } from "vitest";
import { COMMANDS } from "../src/cli/command-registry.js";
import { STATUS_HINTS } from "../src/core/finish/job-state-update.js";
import { pollTimeoutError } from "../src/errors.js";

/** Extract `specrunner <verb>` patterns from a hint string. */
function extractCommandVerbs(hint: string): string[] {
  const matches = [...hint.matchAll(/specrunner (\w+)/g)];
  return matches.map((m) => m[1]!);
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
