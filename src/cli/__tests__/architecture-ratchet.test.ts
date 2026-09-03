/**
 * Architecture ratchet tests (T-17, T-19).
 *
 * Six checks mechanically prevent regression of the handler-extraction
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
 *
 * Check 5 — no value-import cycles within src/cli/ (T-19)
 *   All value imports among src/cli/*.ts modules must form a DAG (no strongly
 *   connected component of size ≥ 2).  This prevents the kind of cycle that
 *   run.ts ↔ from-issue.ts created and that was hidden by await import().
 *
 * Check 6 — no ./ dynamic imports within src/cli/ (T-19)
 *   specifier that starts with "./" inside an import() expression indicates
 *   that a cycle was (re-)introduced and hidden by a lazy import.  Only
 *   dynamic imports of ../core/* or other non-sibling modules are acceptable.
 *   Regression test: adding `await import("./from-issue.js")` to run.ts fails
 *   this check.
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

// ---------------------------------------------------------------------------
// Check 5: no value-import cycles within src/cli/ (T-19)
// ---------------------------------------------------------------------------

/**
 * Build the relative-specifier value-import graph for all src/cli/*.ts files
 * (excluding __tests__) and run Tarjan's SCC to find cycles.
 *
 * An edge A → B exists when A has a non-type ImportDeclaration whose specifier,
 * resolved relative to A, points to B (a .ts file inside CLI_DIR).
 */
function buildCliImportGraph(cliFiles: string[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const file of cliFiles) {
    graph.set(file, new Set());
  }
  const fileSet = new Set(cliFiles);

  for (const file of cliFiles) {
    const src = fs.readFileSync(file, "utf-8");
    let ast;
    try {
      ast = tseParse(src, { jsx: false, range: false, loc: false });
    } catch {
      continue; // skip unparseable files
    }

    for (const node of ast.body) {
      if (
        node.type !== "ImportDeclaration" ||
        node.importKind === "type" ||
        typeof node.source.value !== "string"
      ) continue;

      const spec = node.source.value;
      // Only relative specifiers within the same directory or parent
      if (!spec.startsWith("./") && !spec.startsWith("../")) continue;

      // Resolve the specifier to an absolute path with .ts extension
      const dir = path.dirname(file);
      let resolved = path.resolve(dir, spec);
      // Try .ts extension if not already present
      if (!resolved.endsWith(".ts")) resolved = resolved.replace(/\.js$/, ".ts");

      if (fileSet.has(resolved)) {
        graph.get(file)!.add(resolved);
      }
    }
  }
  return graph;
}

/**
 * Tarjan's strongly connected components algorithm.
 * Returns an array of SCCs (arrays of node strings); only SCCs of size ≥ 2
 * represent cycles.
 */
function tarjanSCC(graph: Map<string, Set<string>>): string[][] {
  const index: Map<string, number> = new Map();
  const lowlink: Map<string, number> = new Map();
  const onStack: Map<string, boolean> = new Map();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  function strongConnect(v: string): void {
    index.set(v, counter);
    lowlink.set(v, counter);
    counter++;
    stack.push(v);
    onStack.set(v, true);

    for (const w of (graph.get(v) ?? [])) {
      if (!index.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.get(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, index.get(w)!));
      }
    }

    if (lowlink.get(v) === index.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.set(w, false);
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  }

  for (const v of graph.keys()) {
    if (!index.has(v)) strongConnect(v);
  }

  return sccs;
}

/** List src/cli/*.ts files excluding test files (*.test.ts, *.spec.ts). */
function listCliTsFilesNoTests(): string[] {
  return listCliTsFiles().filter(
    (f) => !f.endsWith(".test.ts") && !f.endsWith(".spec.ts"),
  );
}

describe("Check 5: no value-import cycles within src/cli/ (T-19)", () => {
  it("the src/cli/ value-import graph has no strongly connected component of size ≥ 2", () => {
    const files = listCliTsFilesNoTests();
    const graph = buildCliImportGraph(files);
    const sccs = tarjanSCC(graph);
    const cycles = sccs
      .filter((scc) => scc.length >= 2)
      .map((scc) => scc.map((f) => path.relative(CLI_DIR, f)).join(" ↔ "));

    expect(cycles).toEqual([]);
  });

  // Regression guard: verify that the cycle detection actually works
  it("tarjanSCC correctly identifies a 2-node cycle", () => {
    const graph = new Map<string, Set<string>>([
      ["a", new Set(["b"])],
      ["b", new Set(["a"])],
      ["c", new Set()],
    ]);
    const sccs = tarjanSCC(graph);
    const cycles = sccs.filter((s) => s.length >= 2);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.sort()).toEqual(["a", "b"]);
  });

  // Regression guard: a self-loop is not a 2-node cycle
  it("tarjanSCC does not flag a single-node SCC as a cycle", () => {
    const graph = new Map<string, Set<string>>([
      ["a", new Set(["b"])],
      ["b", new Set(["c"])],
      ["c", new Set()],
    ]);
    const sccs = tarjanSCC(graph);
    const cycles = sccs.filter((s) => s.length >= 2);
    expect(cycles).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Check 6: no ./ dynamic imports within src/cli/ (T-19)
// ---------------------------------------------------------------------------

/**
 * Walk an AST and collect all ImportExpression (dynamic import) nodes whose
 * specifier argument is a StringLiteral starting with "./".
 * These indicate a lazy import of a same-directory module, which is a sign
 * that a value-import cycle is being hidden.
 */
function findDotSlashDynamicImports(ast: unknown): string[] {
  const hits: string[] = [];

  function walk(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;

    if (n.type === "ImportExpression") {
      const arg = n.source as Record<string, unknown> | null | undefined;
      if (arg?.type === "Literal" && typeof arg.value === "string" && arg.value.startsWith("./")) {
        const loc = n.loc as { start: { line: number } } | null | undefined;
        hits.push(`line ${loc?.start.line ?? "?"}: import("${arg.value}")`);
      }
    }

    for (const val of Object.values(n)) {
      if (Array.isArray(val)) {
        for (const child of val) {
          if (child && typeof child === "object" && (child as Record<string, unknown>).type) walk(child);
        }
      } else if (val && typeof val === "object" && (val as Record<string, unknown>).type) {
        walk(val);
      }
    }
  }

  walk(ast);
  return hits;
}

describe("Check 6: no ./ dynamic imports within src/cli/ (T-19)", () => {
  it("no src/cli/*.ts file uses import('./...') to load a sibling module", () => {
    const files = listCliTsFilesNoTests();
    const violations: string[] = [];

    for (const file of files) {
      const src = fs.readFileSync(file, "utf-8");
      let ast;
      try {
        ast = tseParse(src, { jsx: false, range: false, loc: true });
      } catch {
        continue;
      }
      const hits = findDotSlashDynamicImports(ast);
      for (const hit of hits) {
        violations.push(`${path.relative(CLI_DIR, file)}: ${hit}`);
      }
    }

    // If this fails, a ./ dynamic import was added — likely hiding a new cycle.
    expect(violations).toEqual([]);
  });

  // Regression guard: verify the detector catches the pattern that caused PR #1109 review F1
  it("findDotSlashDynamicImports detects await import('./from-issue.js')", () => {
    const src = `if (true) { const m = await import("./from-issue.js"); }`;
    const ast = tseParse(src, { jsx: false, range: false, loc: true });
    expect(findDotSlashDynamicImports(ast)).toHaveLength(1);
  });

  it("findDotSlashDynamicImports does NOT flag import('../core/issue-target/start.js')", () => {
    const src = `const { x } = await import("../core/issue-target/start.js");`;
    const ast = tseParse(src, { jsx: false, range: false, loc: true });
    expect(findDotSlashDynamicImports(ast)).toHaveLength(0);
  });
});
