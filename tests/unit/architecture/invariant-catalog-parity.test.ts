/**
 * Invariant catalog ↔ teeth B-x ID parity test.
 *
 * Asserts that the B-x invariant ID set in the documentation catalog
 * (architecture/model.md §4 and architecture/conformance.md section (A))
 * matches the B-x ID set enforced by the teeth
 * (core-invariants.test.ts describe("B-N") blocks unioned with
 * arch-allowlist.ts invariant fields).
 *
 * New test-ID namespace: TC-ICS-* (invariant-catalog-sync).
 *
 * Design decisions: see specrunner/changes/invariant-catalog-id-sync/design.md
 * (D1–D6). The new file is placed separately from core-invariants.test.ts
 * (D1) so that it can read that file as text without self-contamination.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

// ─── source texts ─────────────────────────────────────────────────────────────

const modelText = fs.readFileSync(
  path.join(ROOT, "architecture/model.md"),
  "utf-8",
);

const conformanceText = fs.readFileSync(
  path.join(ROOT, "architecture/conformance.md"),
  "utf-8",
);

const coreInvariantsText = fs.readFileSync(
  path.join(__dirname, "core-invariants.test.ts"),
  "utf-8",
);

const archAllowlistText = fs.readFileSync(
  path.join(__dirname, "arch-allowlist.ts"),
  "utf-8",
);

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Slice a section of text from the first line matching startRe to
 * the next line matching endRe (exclusive), or end of text.
 * Throws loudly if the start heading cannot be found, so a changed
 * heading format fails loud rather than returning an empty set vacuously.
 */
function sliceSection(text: string, startRe: RegExp, endRe: RegExp): string {
  const lines = text.split("\n");
  const startIdx = lines.findIndex((l) => startRe.test(l));
  if (startIdx === -1) {
    throw new Error(`catalog section heading not found: ${startRe}`);
  }
  const endIdx = lines.findIndex((l, i) => i > startIdx && endRe.test(l));
  const sliceEnd = endIdx === -1 ? lines.length : endIdx;
  return lines.slice(startIdx, sliceEnd).join("\n");
}

/** Normalize an extracted digit string to a canonical "B-<n>" string. */
function normalizeId(n: string): string {
  return `B-${parseInt(n, 10)}`;
}

/** Sort B-x IDs by numeric value (B-2 < B-10). */
function sortIds(ids: Iterable<string>): string[] {
  return [...ids].sort((a, b) => {
    const numA = parseInt(a.slice(2), 10);
    const numB = parseInt(b.slice(2), 10);
    return numA - numB;
  });
}

// ─── extractors ───────────────────────────────────────────────────────────────

/**
 * Extract B-x IDs from the model.md §4 table.
 * Scoped to the §4 section (from "## 4." to the next "## " heading).
 * Only leading-cell rows matching `| **B-N** |` contribute IDs.
 */
function extractModelCatalogIds(md: string): Set<string> {
  const section = sliceSection(md, /^##\s+4\./m, /^##\s+/m);
  const ids = new Set<string>();
  for (const line of section.split("\n")) {
    const m = line.match(/^\s*\|\s*\*\*B-(\d+)\*\*/);
    if (m && m[1]) ids.add(normalizeId(m[1]));
  }
  return ids;
}

/**
 * Extract B-x IDs from the conformance.md (A) section table.
 * Scoped to section (A) (from "### (A)" to the next "### " heading).
 * Only leading-cell rows matching `| **B-N** |` contribute IDs.
 */
function extractConformanceCatalogIds(md: string): Set<string> {
  const section = sliceSection(md, /^###\s+\(A\)/m, /^###\s+/m);
  const ids = new Set<string>();
  for (const line of section.split("\n")) {
    const m = line.match(/^\s*\|\s*\*\*B-(\d+)\*\*/);
    if (m && m[1]) ids.add(normalizeId(m[1]));
  }
  return ids;
}

/**
 * Extract B-x IDs from describe("B-N") blocks in core-invariants.test.ts.
 */
function extractDescribeIds(ts: string): Set<string> {
  const ids = new Set<string>();
  const re = /describe\("B-(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ts)) !== null) {
    if (m[1]) ids.add(normalizeId(m[1]));
  }
  return ids;
}

/**
 * Extract B-x IDs from invariant: "B-N" fields in arch-allowlist.ts.
 * "DSM" entries and JSDoc examples (no `invariant:` key) are naturally excluded.
 */
function extractAllowlistIds(ts: string): Set<string> {
  const ids = new Set<string>();
  const re = /invariant:\s*"B-(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ts)) !== null) {
    if (m[1]) ids.add(normalizeId(m[1]));
  }
  return ids;
}

// ─── parity ───────────────────────────────────────────────────────────────────

interface ParityResult {
  /** IDs in teeth but absent from catalog (undocumented invariant). */
  undocumented: string[];
  /** IDs in catalog but absent from teeth (documented-but-unenforced). */
  unenforced: string[];
}

/**
 * Compute the bidirectional parity between catalog and teeth ID sets.
 * Results are sorted by numeric value for readable assertion output.
 */
function computeParity(
  catalog: Set<string>,
  teeth: Set<string>,
): ParityResult {
  const undocumented = sortIds([...teeth].filter((id) => !catalog.has(id)));
  const unenforced = sortIds([...catalog].filter((id) => !teeth.has(id)));
  return { undocumented, unenforced };
}

// ─── extracted sets (shared across all test assertions) ──────────────────────

const modelIds = extractModelCatalogIds(modelText);
const conformanceIds = extractConformanceCatalogIds(conformanceText);
const describeIds = extractDescribeIds(coreInvariantsText);
const allowlistIds = extractAllowlistIds(archAllowlistText);

// teeth = describe ∪ allowlist.  allowlist is a subset of describe (D3), so
// the union equals describe in the current state; the formulation is correct
// when allowlist grows beyond describe or shrinks to empty.
const teethIds = new Set([...describeIds, ...allowlistIds]);

// catalog canonical = model §4 (asserted equal to conformance (A) in TC-ICS-01)
const catalogIds = modelIds;

// ─── TC-ICS-01..03: parity assertions ────────────────────────────────────────

describe("invariant catalog ↔ teeth B-x ID parity", () => {
  it("TC-ICS-01: model.md §4 and conformance.md (A) catalog tables agree on the same B-x IDs", () => {
    // Both are authoritative catalog sources; they must enumerate the same set.
    expect(sortIds(modelIds)).toEqual(sortIds(conformanceIds));
  });

  it("TC-ICS-02: catalog B-x IDs and teeth B-x IDs match bidirectionally (no undocumented, no unenforced)", () => {
    const { undocumented, unenforced } = computeParity(catalogIds, teethIds);
    expect(undocumented).toEqual([]);
    expect(unenforced).toEqual([]);
  });

  it("TC-ICS-03: every allowlist invariant ID has a corresponding describe block", () => {
    // allowlist must be a subset of describe; an orphaned entry references
    // a non-existent invariant and should fail.
    const orphaned = sortIds(
      [...allowlistIds].filter((id) => !describeIds.has(id)),
    );
    expect(orphaned).toEqual([]);
  });
});

// ─── TC-ICS-04: liveness ─────────────────────────────────────────────────────

describe("invariant catalog parity — liveness", () => {
  it("TC-ICS-04: catalog and describe extracted sets are non-empty (guards against vacuous pass from a broken extractor)", () => {
    // A broken extractor returning an empty set would make TC-ICS-02 pass
    // vacuously (∅ = ∅). The allowlist legitimately may be empty when all
    // divergences are burned down, so no liveness assertion is placed on it.
    expect(modelIds.size).toBeGreaterThan(0);
    expect(conformanceIds.size).toBeGreaterThan(0);
    expect(describeIds.size).toBeGreaterThan(0);
  });
});

// ─── TC-ICS-05: detection test — reproduce the B-12 desync ──────────────────

describe("invariant catalog parity — detection test (B-12 desync reproduction)", () => {
  it("TC-ICS-05: removing B-12 from the catalog text makes parity report B-12 as undocumented", () => {
    // Reproduce the historical desync: B-12 absent from both catalog tables
    // while the teeth still reference it.
    const dropB12 = (text: string): string =>
      text
        .split("\n")
        .filter((l) => !/^\s*\|\s*\*\*B-12\*\*/.test(l))
        .join("\n");

    const catalogIdsNo12 = extractModelCatalogIds(dropB12(modelText));

    // Perturbation guard: the row removal must have taken effect.
    // If the table row format drifted, this assertion fails loudly here
    // rather than making the parity check pass vacuously.
    expect(catalogIdsNo12.has("B-12")).toBe(false);

    // The parity check against real teeth (which still contain B-12) must
    // report B-12 as undocumented — proving the tooth catches this exact desync.
    const { undocumented } = computeParity(catalogIdsNo12, teethIds);
    expect(undocumented).toContain("B-12");

    // Optionally confirm conformance extractor also drops B-12 from its
    // perturbed text, matching the historical state where both tables stopped at B-11.
    const conformanceIdsNo12 = extractConformanceCatalogIds(
      dropB12(conformanceText),
    );
    expect(conformanceIdsNo12.has("B-12")).toBe(false);
  });
});
