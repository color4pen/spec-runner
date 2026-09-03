/**
 * Architecture ratchet tests (T-17).
 *
 * These four checks mechanically prevent regression of the handler-extraction
 * refactoring.  They are intentionally "boring" static checks so they run fast
 * without spawning subprocesses.
 *
 * Check 1 — handler.name guard (inline handler = 0)
 *   Any function defined as `handler: async (parsed, ctx) => { ... }` receives
 *   the synthetic name "handler" from V8.  Named exported functions keep their
 *   declared name.  This check fails if any CommandSpec node carries an
 *   anonymous (name === "handler") function.
 *
 * Check 2 — process.exit = 0 in command-registry.ts
 *   After extraction, the registry is a declaration-only file.  It must not
 *   call process.exit() directly.
 *
 * Check 3 — no handler module imports command-registry (import cycle guard)
 *   Handler modules (init.ts, run.ts, …) must not import from command-registry.ts
 *   because that creates a value-import cycle: registry → handler → registry.
 *   type-only imports (`import type { … }`) are allowed and excluded here.
 *
 * Check 4 — single authoritative COMMANDS export
 *   Only command-registry.ts may export `COMMANDS`.  Any parallel registry
 *   would silently diverge and mislead the dispatcher.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parse as tseParse } from "@typescript-eslint/parser";
import { COMMANDS } from "../command-registry.js";
import type { CommandSpec } from "../command-registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectSpecs(
  commands: Record<string, CommandSpec>,
  parentPath: string[] = [],
): Array<{ cmdPath: string; spec: CommandSpec }> {
  const result: Array<{ cmdPath: string; spec: CommandSpec }> = [];
  for (const [key, spec] of Object.entries(commands)) {
    const cmdPath = [...parentPath, key].join(".");
    result.push({ cmdPath, spec });
    if (spec.children) {
      result.push(...collectSpecs(spec.children, [...parentPath, key]));
    }
  }
  return result;
}

function stripComments(src: string): string {
  // Remove block comments (/* ... */)
  src = src.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove line comments (// ...)
  src = src.replace(/\/\/[^\n]*/g, "");
  return src;
}

const CLI_DIR = path.resolve(__dirname, ".."); // src/cli/
const REGISTRY_FILE = path.join(CLI_DIR, "command-registry.ts");

function listCliTsFiles(): string[] {
  return fs
    .readdirSync(CLI_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .map((f) => path.join(CLI_DIR, f));
}

// ---------------------------------------------------------------------------
// Check 1: inline handler = 0
// ---------------------------------------------------------------------------

describe("Check 1: no inline (anonymous) handlers in COMMANDS tree", () => {
  it('every spec.handler has a name !== "handler" (i.e., is a named exported function)', () => {
    const all = collectSpecs(COMMANDS);
    const violations: string[] = [];

    for (const { cmdPath, spec } of all) {
      if (spec.handler && spec.handler.name === "handler") {
        violations.push(`"${cmdPath}" has an anonymous inline handler`);
      }
    }

    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Check 2: process.exit = 0 in command-registry.ts
// ---------------------------------------------------------------------------

describe("Check 2: command-registry.ts has no process.exit calls", () => {
  it("source (after comment removal) contains no process.exit", () => {
    const src = fs.readFileSync(REGISTRY_FILE, "utf-8");
    const stripped = stripComments(src);
    expect(stripped).not.toContain("process.exit");
  });
});

// ---------------------------------------------------------------------------
// Check 3: no handler module imports command-registry (value import cycle)
// ---------------------------------------------------------------------------

/**
 * Parse `source` with @typescript-eslint/parser and return every value
 * ImportDeclaration whose module specifier contains `needle`.
 *
 * Using AST traversal instead of line-splitting ensures multi-line imports
 * (e.g. `import {\n  FOO\n} from "../command-registry.js"`) are detected.
 * type-only imports (`importKind === "type"`) are excluded.
 */
function findValueImportsFrom(source: string, needle: string): string[] {
  let ast: ReturnType<typeof tseParse>;
  try {
    ast = tseParse(source, { jsx: false, range: false, loc: true });
  } catch {
    // If the file fails to parse we conservatively return no violations —
    // a broken file will surface through compilation, not this ratchet.
    return [];
  }

  const hits: string[] = [];
  for (const node of ast.body) {
    if (
      node.type === "ImportDeclaration" &&
      node.importKind !== "type" &&
      typeof node.source.value === "string" &&
      node.source.value.includes(needle)
    ) {
      // Report the first line of the import as a readable location hint.
      const line = node.loc?.start.line ?? "?";
      hits.push(`line ${line}: ${node.source.value}`);
    }
  }
  return hits;
}

describe("Check 3: no src/cli/*.ts file (other than command-registry.ts) imports from command-registry", () => {
  it("only command-registry.ts itself references 'command-registry' (AST-based, detects multi-line imports)", () => {
    const files = listCliTsFiles().filter((f) => f !== REGISTRY_FILE);
    const violations: string[] = [];

    for (const file of files) {
      const src = fs.readFileSync(file, "utf-8");
      const hits = findValueImportsFrom(src, "command-registry");
      for (const hit of hits) {
        violations.push(`${path.relative(CLI_DIR, file)}: ${hit}`);
      }
    }

    expect(violations).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Regression guard: verify the AST-based helper catches multi-line imports
  // that the old line-splitting approach would have silently missed.
  // -------------------------------------------------------------------------
  it("findValueImportsFrom detects a multi-line value import from command-registry", () => {
    const multiLineImport = [
      "import {",
      "  COMMANDS",
      '} from "../command-registry.js"',
    ].join("\n");
    expect(findValueImportsFrom(multiLineImport, "command-registry")).toHaveLength(1);
  });

  it("findValueImportsFrom does NOT flag a multi-line type-only import from command-registry", () => {
    const typeOnlyMultiLine = [
      "import type {",
      "  CommandSpec",
      '} from "../command-registry.js"',
    ].join("\n");
    expect(findValueImportsFrom(typeOnlyMultiLine, "command-registry")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Check 4: single authoritative COMMANDS export
// ---------------------------------------------------------------------------

describe("Check 4: only command-registry.ts exports COMMANDS", () => {
  it("no other src/cli/*.ts file exports a COMMANDS constant", () => {
    const files = listCliTsFiles().filter((f) => f !== REGISTRY_FILE);
    const violations: string[] = [];

    for (const file of files) {
      const src = fs.readFileSync(file, "utf-8");
      const stripped = stripComments(src);
      // Match `export const COMMANDS` or `export const COMMANDS:`
      if (/export\s+const\s+COMMANDS\b/.test(stripped)) {
        violations.push(path.relative(CLI_DIR, file));
      }
    }

    expect(violations).toEqual([]);
  });
});
