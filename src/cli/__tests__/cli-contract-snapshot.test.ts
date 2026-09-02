/**
 * CLI contract snapshot test (T-01).
 *
 * Serialises the full COMMANDS tree into a normalised shape that captures
 * path / flags / args / requiresRepo / worktreeGuard / aliasOf / visibility /
 * hasHandler for every CommandSpec node.
 *
 * The snapshot file acts as a living contract: if any flag, arg, guard, or
 * visibility annotation changes, the snapshot will fail and the author must
 * update it intentionally.
 *
 * The `hasHandler` boolean deliberately captures only presence (true/false),
 * not the handler's identity, so renaming an inline handler to a named
 * reference does NOT cause a snapshot mismatch — which is exactly what we
 * want to verify after the extraction refactoring.
 */

import { describe, it, expect } from "vitest";
import { COMMANDS } from "../command-registry.js";
import type { CommandSpec } from "../command-registry.js";

// ---------------------------------------------------------------------------
// Normalised shape
// ---------------------------------------------------------------------------

interface NormalisedSpec {
  path: string[];
  flags: string[];
  args: string[];
  requiresRepo: boolean | undefined;
  worktreeGuard: boolean | undefined;
  aliasOf: string[] | undefined;
  visibility: string | undefined;
  hasHandler: boolean;
  children?: Record<string, NormalisedSpec>;
}

function normaliseSpec(spec: CommandSpec): NormalisedSpec {
  const norm: NormalisedSpec = {
    path: spec.path,
    flags: Object.keys(spec.flags ?? {}).sort(),
    args: (spec.args ?? []).map((a) => a.name),
    requiresRepo: spec.requiresRepo,
    worktreeGuard: spec.worktreeGuard,
    aliasOf: spec.aliasOf,
    visibility: spec.visibility,
    hasHandler: spec.handler !== undefined,
  };
  if (spec.children) {
    norm.children = Object.fromEntries(
      Object.entries(spec.children).map(([key, child]) => [key, normaliseSpec(child)]),
    );
  }
  return norm;
}

export function normalizeCommandsTree(
  commands: Record<string, CommandSpec>,
): Record<string, NormalisedSpec> {
  return Object.fromEntries(
    Object.entries(commands).map(([key, spec]) => [key, normaliseSpec(spec)]),
  );
}

// ---------------------------------------------------------------------------
// Snapshot test
// ---------------------------------------------------------------------------

describe("CLI contract snapshot", () => {
  it("COMMANDS tree shape is stable", () => {
    const snapshot = normalizeCommandsTree(COMMANDS);

    // Sanity: all expected top-level commands are present
    const topLevel = Object.keys(snapshot);
    const expected = [
      "init", "login", "credentials", "run", "request", "job",
      "config", "inbox", "rules", "reviewers", "runtime", "doctor", "guide", "usage",
    ];
    for (const cmd of expected) {
      expect(topLevel).toContain(cmd);
    }

    expect(snapshot).toMatchSnapshot();
  });
});
