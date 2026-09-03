/**
 * Architecture ratchet tests (T-17, T-19, T-11).
 *
 * Ten checks mechanically prevent regression of the handler-extraction and
 * exit-boundary refactorings.  They are intentionally "boring" static checks
 * so they run fast without spawning subprocesses.
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
 *
 * Check 7 — no process.exit() in src/cli/**\/*.ts production files (T-11)
 *   All process.exit() calls must have been removed from src/cli/ production
 *   code (before: 74 text matches / 70 AST calls across 23–24 files;
 *   after: 0 / 0).  AST-based so comments are not counted.
 *
 * Check 8 — CommandHandler type is Promise<number>; all handle* exports conform (T-11)
 *   CommandHandler type alias in command-handler.ts must return Promise<number>.
 *   No exported handle* function in src/cli/ may carry a Promise<void> return
 *   type annotation (before: 0/30 conformant; after: 30/30).
 *
 * Check 9 — process.exit ownership non-redistribution (T-11)
 *   The set of production files (src/**\/*, bin\/**\/*; excl. __tests__ /
 *   *.test.ts) that contain a process.exit() CallExpression must equal exactly
 *   { "bin/specrunner.ts", "src/core/runtime/local.ts",
 *     "src/core/runtime/managed.ts" }.
 *   The latter two are signal-handler registrations, not in scope for this
 *   refactoring; they are permanently allowlisted.
 *
 * Check 10 — entrypoint has no parallel dispatch paths (T-11)
 *   bin/specrunner.ts must contain no SwitchStatement, and spec.handler must
 *   be called exactly once.
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

// ---------------------------------------------------------------------------
// Shared helpers for Checks 7–10
// ---------------------------------------------------------------------------

/**
 * Recursively list all .ts files under `dir`, excluding any `__tests__`
 * directory and any file ending in `.test.ts`, `.spec.ts`, or `.d.ts`.
 */
function listTsFilesRecursive(dir: string): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      result.push(...listTsFilesRecursive(path.join(dir, entry.name)));
    } else if (
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".d.ts") &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".spec.ts")
    ) {
      result.push(path.join(dir, entry.name));
    }
  }
  return result;
}

/**
 * Walk an AST and collect all `process.exit(...)` CallExpression nodes.
 * Comments are not part of the AST, so they are never reported.
 */
function findProcessExitCalls(ast: unknown): string[] {
  const hits: string[] = [];

  function walk(node: unknown): void {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;

    if (n.type === "CallExpression") {
      const callee = n.callee as Record<string, unknown> | null | undefined;
      if (
        callee?.type === "MemberExpression" &&
        (callee.object as Record<string, unknown> | undefined)?.type === "Identifier" &&
        (callee.object as Record<string, unknown> | undefined)?.name === "process" &&
        (callee.property as Record<string, unknown> | undefined)?.type === "Identifier" &&
        (callee.property as Record<string, unknown> | undefined)?.name === "exit"
      ) {
        const loc = n.loc as { start: { line: number } } | null | undefined;
        hits.push(`line ${loc?.start.line ?? "?"}: process.exit()`);
      }
    }

    for (const val of Object.values(n)) {
      if (Array.isArray(val)) {
        for (const child of val) {
          if (child && typeof child === "object" && (child as Record<string, unknown>).type)
            walk(child);
        }
      } else if (val && typeof val === "object" && (val as Record<string, unknown>).type) {
        walk(val);
      }
    }
  }

  walk(ast);
  return hits;
}

// ---------------------------------------------------------------------------
// Check 7: no process.exit() in src/cli/**/*.ts production files (T-11)
// ---------------------------------------------------------------------------

describe("Check 7: no process.exit() in src/cli/**/*.ts production files (T-11)", () => {
  it("no src/cli production .ts file contains a process.exit() call (AST-based)", () => {
    const cliFiles = listTsFilesRecursive(CLI_DIR);
    const violations: string[] = [];

    for (const file of cliFiles) {
      const src = fs.readFileSync(file, "utf-8");
      let ast;
      try {
        ast = tseParse(src, { jsx: false, range: false, loc: true });
      } catch {
        continue;
      }
      const hits = findProcessExitCalls(ast);
      for (const hit of hits) {
        violations.push(`${path.relative(CLI_DIR, file)}: ${hit}`);
      }
    }

    expect(violations).toEqual([]);
  });

  // Regression guard 1: actual call is detected
  it("findProcessExitCalls detects process.exit(1) in synthetic source", () => {
    const src = `function foo() { process.exit(1); }`;
    const ast = tseParse(src, { jsx: false, range: false, loc: true });
    expect(findProcessExitCalls(ast)).toHaveLength(1);
  });

  // Regression guard 2: comment mention is not detected
  it("findProcessExitCalls does NOT flag process.exit() inside a comment", () => {
    const src = `/** Calls process.exit() to terminate. */ function foo(): void {}`;
    const ast = tseParse(src, { jsx: false, range: false, loc: true });
    expect(findProcessExitCalls(ast)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Check 8: CommandHandler is Promise<number>; handle* exports conform (T-11)
// ---------------------------------------------------------------------------

/**
 * Walk AST body looking for exported `handle*` function declarations or
 * variable declarations whose return type annotation contains TSVoidKeyword
 * inside a Promise<…> type reference.
 *
 * Returns violation strings for each `Promise<void>` return type found.
 */
function findHandlersWithVoidReturn(src: string, label: string): string[] {
  let ast: ReturnType<typeof tseParse>;
  try {
    ast = tseParse(src, { jsx: false, range: false, loc: true });
  } catch {
    return [];
  }

  const violations: string[] = [];

  function isPromiseVoid(returnType: unknown): boolean {
    if (!returnType || typeof returnType !== "object") return false;
    const rta = returnType as Record<string, unknown>;
    // returnType is TSTypeAnnotation wrapping the real type
    const typeNode = rta.type === "TSTypeAnnotation"
      ? (rta.typeAnnotation as Record<string, unknown> | undefined)
      : rta;
    if (!typeNode) return false;
    if (typeNode.type !== "TSTypeReference") return false;
    const typeName = typeNode.typeName as Record<string, unknown> | undefined;
    if (!typeName || typeName.name !== "Promise") return false;
    // @typescript-eslint/parser uses `typeArguments` (not `typeParameters`) for generic args
    const typeArgs = ((typeNode.typeArguments ?? typeNode.typeParameters) as Record<string, unknown> | undefined);
    const paramList = (typeArgs?.params as unknown[] | undefined) ?? [];
    if (paramList.length !== 1) return false;
    return (paramList[0] as Record<string, unknown> | undefined)?.type === "TSVoidKeyword";
  }

  for (const node of ast.body) {
    if (node.type !== "ExportNamedDeclaration") continue;
    const decl = (node as Record<string, unknown>).declaration as Record<string, unknown> | null | undefined;
    if (!decl) continue;

    if (decl.type === "FunctionDeclaration") {
      const name = (decl.id as Record<string, unknown> | undefined)?.name as string | undefined;
      if (name?.startsWith("handle") && isPromiseVoid(decl.returnType)) {
        const loc = (node as Record<string, unknown>).loc as { start: { line: number } } | undefined;
        violations.push(`${label}: ${name} returns Promise<void> (line ${loc?.start.line ?? "?"})`);
      }
    } else if (decl.type === "VariableDeclaration") {
      for (const d of ((decl.declarations as unknown[]) ?? [])) {
        const vd = d as Record<string, unknown>;
        const id = vd.id as Record<string, unknown> | undefined;
        const name = id?.name as string | undefined;
        if (name?.startsWith("handle") && isPromiseVoid(id?.typeAnnotation)) {
          const loc = vd.loc as { start: { line: number } } | undefined;
          violations.push(`${label}: ${name} returns Promise<void> (line ${loc?.start.line ?? "?"})`);
        }
      }
    }
  }

  return violations;
}

describe("Check 8: CommandHandler is Promise<number>; handle* exports conform (T-11)", () => {
  it("CommandHandler type alias in command-handler.ts returns Promise<number>", () => {
    const src = fs.readFileSync(path.join(CLI_DIR, "command-handler.ts"), "utf-8");
    const stripped = stripComments(src);
    // The type alias must reference Promise<number> (not Promise<void>)
    expect(stripped).toMatch(/CommandHandler[^;]*Promise<number>/s);
    expect(stripped).not.toMatch(/CommandHandler[^;]*Promise<void>/s);
  });

  it("no exported handle* function in src/cli/ has a Promise<void> return type annotation", () => {
    const files = listCliTsFiles().filter(
      (f) => !f.endsWith(".test.ts") && !f.endsWith(".spec.ts"),
    );
    const violations: string[] = [];

    for (const file of files) {
      const src = fs.readFileSync(file, "utf-8");
      const hits = findHandlersWithVoidReturn(src, path.relative(CLI_DIR, file));
      violations.push(...hits);
    }

    expect(violations).toEqual([]);
  });

  // Regression guard: Promise<void> annotation is flagged
  it("findHandlersWithVoidReturn detects an exported handle* function returning Promise<void>", () => {
    const src = `export async function handleFoo(parsed: unknown): Promise<void> { return; }`;
    expect(findHandlersWithVoidReturn(src, "test.ts")).toHaveLength(1);
  });

  // Regression guard: Promise<number> annotation is not flagged
  it("findHandlersWithVoidReturn does NOT flag an exported handle* function returning Promise<number>", () => {
    const src = `export async function handleFoo(parsed: unknown): Promise<number> { return 0; }`;
    expect(findHandlersWithVoidReturn(src, "test.ts")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Check 9: process.exit ownership non-redistribution (T-11)
// ---------------------------------------------------------------------------

/**
 * Allowlist of files permitted to call process.exit().
 * - bin/specrunner.ts: the sole dispatch boundary (this refactoring's goal)
 * - src/core/runtime/local.ts: SIGINT/SIGTERM signal handler — out of scope
 * - src/core/runtime/managed.ts: SIGINT/SIGTERM signal handler — out of scope
 */
const PROCESS_EXIT_ALLOWLIST = new Set([
  "bin/specrunner.ts",
  "src/core/runtime/local.ts",
  "src/core/runtime/managed.ts",
]);

describe("Check 9: process.exit ownership non-redistribution (T-11)", () => {
  it("only allowlisted files contain process.exit() calls in src/ and bin/", () => {
    const REPO_ROOT = path.resolve(CLI_DIR, "../..");

    const srcDir = path.join(REPO_ROOT, "src");
    const binDir = path.join(REPO_ROOT, "bin");

    const allFiles: string[] = [];
    if (fs.existsSync(srcDir)) allFiles.push(...listTsFilesRecursive(srcDir));
    if (fs.existsSync(binDir)) allFiles.push(...listTsFilesRecursive(binDir));

    const violations: string[] = [];

    for (const file of allFiles) {
      const relPath = path.relative(REPO_ROOT, file).replace(/\\/g, "/");
      const src = fs.readFileSync(file, "utf-8");
      let ast;
      try {
        ast = tseParse(src, { jsx: false, range: false, loc: true });
      } catch {
        continue;
      }
      const hits = findProcessExitCalls(ast);
      if (hits.length > 0 && !PROCESS_EXIT_ALLOWLIST.has(relPath)) {
        violations.push(`${relPath}: ${hits.length} process.exit() call(s) — not in allowlist`);
      }
    }

    expect(violations).toEqual([]);
  });

  // Regression guard: a 4th file triggers violation
  it("detects an unexpected 4th file with process.exit() as a violation", () => {
    const actual = [
      "bin/specrunner.ts",
      "src/core/runtime/local.ts",
      "src/core/runtime/managed.ts",
      "src/cli/evil.ts",  // interloper
    ];
    const violations = actual.filter((f) => !PROCESS_EXIT_ALLOWLIST.has(f));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toBe("src/cli/evil.ts");
  });
});

// ---------------------------------------------------------------------------
// Check 10: entrypoint has no parallel dispatch paths (T-11)
// ---------------------------------------------------------------------------

describe("Check 10: bin/specrunner.ts has no SwitchStatement and spec.handler called once (T-11)", () => {
  const REPO_ROOT = path.resolve(CLI_DIR, "../..");
  const SPECRUNNER_FILE = path.join(REPO_ROOT, "bin", "specrunner.ts");

  function findNodes(ast: unknown, type: string): unknown[] {
    const found: unknown[] = [];
    function walk(node: unknown): void {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === type) found.push(n);
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
    return found;
  }

  /**
   * Count `spec.handler(...)` or `spec.handler!(...)` call expressions in AST.
   * These are CallExpression nodes whose callee is a MemberExpression with
   * optional chaining or non-null assertion accessing `handler` on `spec`.
   */
  function countSpecHandlerCalls(ast: unknown): number {
    let count = 0;
    function walk(node: unknown): void {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "CallExpression") {
        // callee may be TSNonNullExpression(MemberExpression) or direct MemberExpression
        let callee = n.callee as Record<string, unknown> | undefined;
        if (callee?.type === "TSNonNullExpression") {
          callee = callee.expression as Record<string, unknown> | undefined;
        }
        if (
          callee?.type === "MemberExpression" &&
          (callee.object as Record<string, unknown> | undefined)?.type === "Identifier" &&
          (callee.object as Record<string, unknown> | undefined)?.name === "spec" &&
          (callee.property as Record<string, unknown> | undefined)?.name === "handler"
        ) {
          count++;
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
    return count;
  }

  it("bin/specrunner.ts has no SwitchStatement", () => {
    const src = fs.readFileSync(SPECRUNNER_FILE, "utf-8");
    const ast = tseParse(src, { jsx: false, range: false, loc: true });
    const switches = findNodes(ast, "SwitchStatement");
    expect(switches).toHaveLength(0);
  });

  it("spec.handler is called exactly once in bin/specrunner.ts", () => {
    const src = fs.readFileSync(SPECRUNNER_FILE, "utf-8");
    const ast = tseParse(src, { jsx: false, range: false, loc: true });
    const count = countSpecHandlerCalls(ast);
    expect(count).toBe(1);
  });
});
