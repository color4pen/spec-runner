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

/** Generic AST node shape used for property-access type narrowing. */
type AstNode = Record<string, unknown>;

/**
 * Return true if `node` is a function expression node (FunctionExpression or
 * ArrowFunctionExpression), possibly wrapped in a TSAsExpression cast.
 * This is used to detect `handler: async function myFn() {}` and
 * `handler: async () => {}` in CommandSpec object literals.
 */
function isFunctionNode(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as AstNode;
  if (
    n.type === "FunctionExpression" ||
    n.type === "ArrowFunctionExpression"
  )
    return true;
  // Handle `(fn) as Handler` casts
  if (n.type === "TSAsExpression" || n.type === "TSTypeAssertion") {
    return isFunctionNode(n.expression);
  }
  return false;
}

/**
 * Walk an AST node tree and collect locations of `handler:` properties whose
 * value is a function expression (inline implementation) rather than an
 * identifier reference to a named exported function.
 *
 * This catches both anonymous arrow functions (`.name === "handler"` at
 * runtime) and named inline function expressions (`.name === "myFn"` at
 * runtime, which the pure runtime check misses).
 */
function findInlineHandlerNodes(ast: unknown): string[] {
  const violations: string[] = [];

  function walk(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const n = node as AstNode;
    if (n.type === "Property") {
      const key = n.key as AstNode | null | undefined;
      const isHandlerKey =
        (key?.type === "Identifier" && key.name === "handler") ||
        (key?.type === "Literal" && key.value === "handler");
      if (isHandlerKey && isFunctionNode(n.value)) {
        const loc = n.loc as { start: { line: number } } | null | undefined;
        const line = loc?.start.line ?? "?";
        const valueType = String((n.value as AstNode | null | undefined)?.type ?? "unknown");
        violations.push(`line ${line}: inline handler (${valueType})`);
      }
    }
    // Recurse into all child nodes
    for (const val of Object.values(n)) {
      if (Array.isArray(val)) {
        for (const child of val) {
          if (child && typeof child === "object" && (child as AstNode).type) walk(child);
        }
      } else if (val && typeof val === "object" && (val as AstNode).type) {
        walk(val);
      }
    }
  }

  walk(ast);
  return violations;
}

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

  it("command-registry.ts source has no handler: <function expression> properties (catches named inline functions)", () => {
    const src = fs.readFileSync(REGISTRY_FILE, "utf-8");
    const ast = tseParse(src, { jsx: false, range: false, loc: true });
    const violations = findInlineHandlerNodes(ast);
    expect(violations).toEqual([]);
  });

  // Regression guard: named function expression must be caught by AST check
  it("findInlineHandlerNodes detects a named inline function expression on handler:", () => {
    const src = `const spec = { handler: async function myFn(p, ctx) { return 0; } };`;
    const ast = tseParse(src, { jsx: false, range: false, loc: true });
    expect(findInlineHandlerNodes(ast)).toHaveLength(1);
  });

  it("findInlineHandlerNodes does NOT flag a handler: identifier reference", () => {
    const src = `const spec = { handler: handleFoo };`;
    const ast = tseParse(src, { jsx: false, range: false, loc: true });
    expect(findInlineHandlerNodes(ast)).toHaveLength(0);
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
 *
 * Parse errors are intentionally re-thrown: a src/cli/*.ts file that the
 * installed parser cannot handle is itself an error condition, and silently
 * returning [] would hide any value imports from command-registry in that
 * file.
 */
function findValueImportsFrom(source: string, needle: string): string[] {
  // Let parse errors propagate — callers (the ratchet tests) must not swallow
  // them, as that would silently skip import detection on broken files.
  const ast = tseParse(source, { jsx: false, range: false, loc: true });

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
