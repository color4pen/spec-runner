/**
 * TC-003 ~ TC-007, TC-018 ~ TC-021: Value-import SCC architecture test.
 *
 * Verifies that the runtime value-import graph of `src/` contains zero
 * strongly-connected components (SCCs) with size > 1.
 *
 * Detection strategy:
 * - Static file analysis only via the TypeScript compiler's syntax parser
 *   (`ts.createSourceFile` — parse only, no type checking, no production
 *   module loading).
 * - `import type { ... }` and `export type { ... }` are NOT counted as value edges.
 * - Inline type modifiers (`import { type X, Y }`) exclude type-annotated specifiers.
 * - Tarjan's algorithm (O(V+E)) implemented inline — no external libraries.
 * - Scans `src/` only; excludes `__tests__/` directories and `.test.ts` files.
 *
 * TC-001 / TC-002 are covered by the direct review-routing.ts import constraint at the bottom.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import * as ts from "typescript";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const SRC_DIR = path.join(ROOT, "src");

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

/**
 * Recursively collect all `.ts` files under `dir`.
 * Excludes:
 * - Any path segment named `__tests__`
 * - Files whose name ends in `.test.ts`
 */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue; // skip test directories
      results.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Import parsing
// ---------------------------------------------------------------------------

/**
 * Extract value import paths from TypeScript source text.
 *
 * Parses the source with the TypeScript compiler's syntax parser
 * (`ts.createSourceFile` — parse only, no type checking, no module loading)
 * and walks top-level import/export declarations. Statement boundaries are
 * therefore exact: a preceding non-`from` declaration can never bleed into
 * the classification of the next statement.
 *
 * Rules:
 * - `import type { ... } from "..."` → excluded (type-only)
 * - `export type { ... } from "..."` → excluded (type-only)
 * - `export type * from "..."` → excluded (type-only)
 * - `import { type X, Y } from "..."` → Y is value edge (type X excluded)
 * - `export { type X, Y } from "..."` → Y is value edge (type X excluded)
 * - `import X from "..."` → value edge
 * - `import * as X from "..."` → value edge
 * - `export * from "..."` / `export * as ns from "..."` → value edge
 * - `import "..."` → side-effect import, counted as value edge (to be conservative)
 *
 * Returns an array of import specifier strings (the module path, e.g. "./foo.js").
 * Only relative paths (starting with "./" or "../") are returned; node: builtins
 * and npm packages are excluded.
 */
function extractValueImportPaths(source: string): string[] {
  const paths: string[] = [];
  const sourceFile = ts.createSourceFile(
    "module.ts",
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    ts.ScriptKind.TS,
  );

  const relativeSpecifier = (moduleSpecifier: ts.Expression): string | null => {
    if (!ts.isStringLiteral(moduleSpecifier)) return null;
    const specifier = moduleSpecifier.text;
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) return null;
    return specifier;
  };

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const specifier = relativeSpecifier(statement.moduleSpecifier);
      if (specifier === null) continue;

      const clause = statement.importClause;
      if (!clause) {
        // Side-effect import: `import "./mod.js"` — conservative value edge.
        paths.push(specifier);
        continue;
      }
      if (clause.isTypeOnly) continue; // `import type ...`
      if (clause.name) {
        // Default import binding is a value edge.
        paths.push(specifier);
        continue;
      }
      const bindings = clause.namedBindings;
      if (!bindings || ts.isNamespaceImport(bindings)) {
        // `import * as X` (namespace) is a value edge.
        paths.push(specifier);
        continue;
      }
      // Named imports: value edge iff at least one specifier lacks `type`.
      if (bindings.elements.some((el) => !el.isTypeOnly)) {
        paths.push(specifier);
      }
    } else if (ts.isExportDeclaration(statement)) {
      if (!statement.moduleSpecifier) continue; // local `export { X }` — no edge
      const specifier = relativeSpecifier(statement.moduleSpecifier);
      if (specifier === null) continue;

      if (statement.isTypeOnly) continue; // `export type { ... } from` / `export type * from`
      const clause = statement.exportClause;
      if (!clause || ts.isNamespaceExport(clause)) {
        // `export * from` / `export * as ns from` re-exports values.
        paths.push(specifier);
        continue;
      }
      // Named re-exports: value edge iff at least one specifier lacks `type`.
      if (clause.elements.some((el) => !el.isTypeOnly)) {
        paths.push(specifier);
      }
    }
  }

  return paths;
}

/**
 * Resolve a relative import specifier from a source file to an absolute path.
 * Converts `.js` extensions to `.ts` (TypeScript ESM convention).
 * Returns null if the resolved path does not exist.
 */
function resolveImportPath(fromFile: string, specifier: string): string | null {
  const fromDir = path.dirname(fromFile);
  // Replace .js extension with .ts (TypeScript ESM imports use .js)
  const tsSpecifier = specifier.replace(/\.js$/, ".ts");
  const resolved = path.resolve(fromDir, tsSpecifier);

  // Try direct path first
  if (fs.existsSync(resolved)) return resolved;

  // Try as directory index
  const indexPath = path.join(resolved.replace(/\.ts$/, ""), "index.ts");
  if (fs.existsSync(indexPath)) return indexPath;

  return null;
}

// ---------------------------------------------------------------------------
// Tarjan's SCC algorithm
// ---------------------------------------------------------------------------

/**
 * Run Tarjan's SCC algorithm on a directed graph.
 *
 * @param nodes - All node identifiers in the graph.
 * @param edges - Adjacency list: Map from node → Set of destination nodes.
 * @returns Array of SCCs, each SCC is an array of node identifiers.
 *          Only SCCs with size >= 2 are meaningful for cycle detection.
 */
function tarjanSCC(nodes: string[], edges: Map<string, Set<string>>): string[][] {
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Map<string, boolean>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  function strongConnect(v: string): void {
    index.set(v, counter);
    lowlink.set(v, counter);
    counter++;
    stack.push(v);
    onStack.set(v, true);

    const neighbors = edges.get(v) ?? new Set<string>();
    for (const w of neighbors) {
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

  for (const v of nodes) {
    if (!index.has(v)) {
      strongConnect(v);
    }
  }

  return sccs;
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

/**
 * Build the value-import graph for all files in `files`.
 * Returns adjacency list (Map from absolute path → Set of absolute paths).
 */
function buildImportGraph(files: string[]): { nodes: string[]; edges: Map<string, Set<string>> } {
  const fileSet = new Set(files);
  const edges = new Map<string, Set<string>>();

  for (const file of files) {
    const source = fs.readFileSync(file, "utf-8");
    const importPaths = extractValueImportPaths(source);
    const deps = new Set<string>();

    for (const specifier of importPaths) {
      const resolved = resolveImportPath(file, specifier);
      if (resolved && fileSet.has(resolved)) {
        deps.add(resolved);
      }
    }

    edges.set(file, deps);
  }

  return { nodes: files, edges };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("value-import-scc: liveness guard (TC-018)", () => {
  it("scans at least 1 source file from src/", () => {
    const files = collectSourceFiles(SRC_DIR);
    expect(files.length).toBeGreaterThan(0);
  });
});

describe("value-import-scc: regression guard — Tarjan detects synthetic 2-node SCC (TC-019)", () => {
  it("detects a bidirectional edge as a size-2 SCC", () => {
    const nodes = ["A", "B"];
    const edges = new Map<string, Set<string>>([
      ["A", new Set(["B"])],
      ["B", new Set(["A"])],
    ]);
    const sccs = tarjanSCC(nodes, edges);
    const largeSCCs = sccs.filter((scc) => scc.length > 1);
    expect(largeSCCs).toHaveLength(1);
    expect(largeSCCs[0]).toHaveLength(2);
  });

  it("does not report a DAG edge as a cycle", () => {
    const nodes = ["A", "B", "C"];
    const edges = new Map<string, Set<string>>([
      ["A", new Set(["B"])],
      ["B", new Set(["C"])],
      ["C", new Set()],
    ]);
    const sccs = tarjanSCC(nodes, edges);
    const largeSCCs = sccs.filter((scc) => scc.length > 1);
    expect(largeSCCs).toHaveLength(0);
  });
});

describe("value-import-scc: import type is not a value edge (TC-006)", () => {
  it("import type { ... } from '...' does NOT produce a value edge", () => {
    const source = `import type { Foo } from "./foo.js";`;
    const paths = extractValueImportPaths(source);
    expect(paths).toHaveLength(0);
  });

  it("export type { ... } from '...' does NOT produce a value edge", () => {
    const source = `export type { Bar } from "./bar.js";`;
    const paths = extractValueImportPaths(source);
    expect(paths).toHaveLength(0);
  });
});

describe("value-import-scc: inline type modifier partial exclusion (TC-007)", () => {
  it("import { type X, Y } — Y is value edge, X is not", () => {
    const source = `import { type TypeOnly, ValueExport } from "./mod.js";`;
    const paths = extractValueImportPaths(source);
    // The specifier "./mod.js" should be present because ValueExport is a value import
    expect(paths).toContain("./mod.js");
  });

  it("import { type X } — no value edge", () => {
    const source = `import { type OnlyType } from "./mod.js";`;
    const paths = extractValueImportPaths(source);
    expect(paths).not.toContain("./mod.js");
  });
});

describe("value-import-scc: statement boundaries — type-only re-export after a non-from statement", () => {
  it("export interface followed by export type { ... } from '...' does NOT produce a value edge", () => {
    const source = [
      `export interface Marker {}`,
      `export type { RuntimeCredentials } from "../port/runtime-prereqs.js";`,
    ].join("\n");
    const paths = extractValueImportPaths(source);
    expect(paths).toHaveLength(0);
  });

  it("export function followed by export type { ... } from '...' does NOT produce a value edge", () => {
    const source = [
      `export function helper(): number {`,
      `  return 1;`,
      `}`,
      `export type { RuntimeCredentials } from "../port/runtime-prereqs.js";`,
    ].join("\n");
    const paths = extractValueImportPaths(source);
    expect(paths).toHaveLength(0);
  });

  it("import type followed by export type from the same module does NOT produce a value edge", () => {
    // Mirrors the agent-runner.ts re-export pattern that the regex-based
    // detector misclassified: a non-from statement above must not bleed into
    // the classification of the type-only re-export below.
    const source = [
      `export interface AgentRunContext {`,
      `  writeScope?: string;`,
      `}`,
      ``,
      `import type { CompletionReportDiagnostic } from "../../kernel/completion-report-diagnostic.js";`,
      `export type { CompletionReportDiagnostic } from "../../kernel/completion-report-diagnostic.js";`,
    ].join("\n");
    const paths = extractValueImportPaths(source);
    expect(paths).toHaveLength(0);
  });

  it("a genuine value import in the same file is still detected alongside type-only re-exports", () => {
    const source = [
      `import { realValue } from "./value-mod.js";`,
      `export interface Marker {}`,
      `export type { Foo } from "./type-mod.js";`,
    ].join("\n");
    const paths = extractValueImportPaths(source);
    expect(paths).toEqual(["./value-mod.js"]);
  });
});

describe("value-import-scc: star re-exports", () => {
  it("export * from '...' IS a value edge", () => {
    const source = `export * from "./mod.js";`;
    expect(extractValueImportPaths(source)).toEqual(["./mod.js"]);
  });

  it("export type * from '...' is NOT a value edge", () => {
    const source = `export type * from "./mod.js";`;
    expect(extractValueImportPaths(source)).toHaveLength(0);
  });

  it("side-effect import '...' IS a value edge", () => {
    const source = `import "./side-effect.js";`;
    expect(extractValueImportPaths(source)).toEqual(["./side-effect.js"]);
  });
});

describe("value-import-scc: __tests__ / .test.ts files are excluded (TC-020)", () => {
  it("collectSourceFiles excludes __tests__ directories", () => {
    const files = collectSourceFiles(SRC_DIR);
    const hasTestDir = files.some((f) => f.includes("__tests__"));
    expect(hasTestDir).toBe(false);
  });

  it("collectSourceFiles excludes .test.ts files", () => {
    const files = collectSourceFiles(SRC_DIR);
    const hasTestFile = files.some((f) => f.endsWith(".test.ts"));
    expect(hasTestFile).toBe(false);
  });
});

describe("value-import-scc: no dynamic module loading (TC-021)", () => {
  it("this test file uses only readFileSync and readdirSync — no dynamic module loading", () => {
    // This is a structural assertion: confirm the test file's own source
    // does not call dynamic module loading (no import-function calls, no require calls).
    // We strip string literals before checking to avoid false positives from test names.
    const rawSource = fs.readFileSync(url.fileURLToPath(import.meta.url), "utf-8");
    // Remove string literals (double-quoted and single-quoted) to avoid matching inside them
    const stripped = rawSource
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/`(?:[^`\\]|\\.)*`/g, "``");
    // Check for dynamic require/createRequire patterns
    const requirePattern = /\brequire\s*\(/g;
    const createRequirePattern = /\bcreateRequire\b/g;
    expect(stripped.match(requirePattern)).toBeNull();
    expect(stripped.match(createRequirePattern)).toBeNull();
    // Check for dynamic import() calls — import followed by ( but not import.meta
    const dynamicImportCallPattern = /\bimport\s*\((?!\.meta)/g;
    expect(stripped.match(dynamicImportCallPattern)).toBeNull();
  });
});

describe("value-import-scc: src/ value-import SCC count is 0 (TC-003, TC-004, TC-005)", () => {
  it("no strongly-connected components with size > 1 exist in src/", () => {
    const files = collectSourceFiles(SRC_DIR);
    const { nodes, edges } = buildImportGraph(files);
    const sccs = tarjanSCC(nodes, edges);
    const cyclicSCCs = sccs.filter((scc) => scc.length > 1);

    if (cyclicSCCs.length > 0) {
      const formatted = cyclicSCCs
        .map((scc) => {
          const relPaths = scc.map((f) => path.relative(ROOT, f)).join(", ");
          return `  SCC(${scc.length}): [${relPaths}]`;
        })
        .join("\n");
      throw new Error(
        `Found ${cyclicSCCs.length} value-import SCC(s) with size > 1:\n${formatted}`,
      );
    }

    expect(cyclicSCCs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-001 / TC-002: Direct import constraint on review-routing.ts
//
// review-routing.ts MUST NOT have value imports from:
// - pipeline/ (any file)
// - step/fixer-helpers
// - step/regression-gate
//
// Allowed value imports: step/step-names, step/judge-verdict, decision/decision-ledger
// ---------------------------------------------------------------------------

describe("value-import-scc: review-routing.ts import constraints (TC-001, TC-002)", () => {
  const reviewRoutingPath = path.join(SRC_DIR, "core", "review-routing.ts");

  it("review-routing.ts exists", () => {
    expect(fs.existsSync(reviewRoutingPath)).toBe(true);
  });

  it("review-routing.ts has no value imports from pipeline/ modules", () => {
    const source = fs.readFileSync(reviewRoutingPath, "utf-8");
    const valuePaths = extractValueImportPaths(source);

    const pipelineImports = valuePaths.filter((p) => p.includes("pipeline/") || p.includes("/pipeline"));
    if (pipelineImports.length > 0) {
      throw new Error(
        `review-routing.ts has forbidden value imports from pipeline/: ${pipelineImports.join(", ")}`,
      );
    }
    expect(pipelineImports).toHaveLength(0);
  });

  it("review-routing.ts has no value imports from step/fixer-helpers", () => {
    const source = fs.readFileSync(reviewRoutingPath, "utf-8");
    const valuePaths = extractValueImportPaths(source);

    const fixerHelperImports = valuePaths.filter((p) => p.includes("fixer-helpers"));
    expect(fixerHelperImports).toHaveLength(0);
  });

  it("review-routing.ts has no value imports from step/regression-gate", () => {
    const source = fs.readFileSync(reviewRoutingPath, "utf-8");
    const valuePaths = extractValueImportPaths(source);

    const regressionGateImports = valuePaths.filter((p) => p.includes("regression-gate"));
    expect(regressionGateImports).toHaveLength(0);
  });

  it("review-routing.ts value imports are only from allowed modules", () => {
    const source = fs.readFileSync(reviewRoutingPath, "utf-8");
    const valuePaths = extractValueImportPaths(source);

    // Allowed value import path fragments
    const allowedFragments = ["step/step-names", "step/judge-verdict", "decision/decision-ledger"];

    for (const p of valuePaths) {
      const isAllowed = allowedFragments.some((fragment) => p.includes(fragment));
      if (!isAllowed) {
        throw new Error(
          `review-routing.ts has unexpected value import: "${p}". ` +
          `Allowed: ${allowedFragments.join(", ")}`,
        );
      }
    }
    // Passes if no error thrown
    expect(true).toBe(true);
  });
});
