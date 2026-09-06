/**
 * Unified diff / binary classification leaf util.
 * ZERO imports — pure ECMAScript only.
 *
 * T-01: unified-diff.ts — leaf layer, no external dependencies.
 */

// ─── Binary / text classification ────────────────────────────────────────────

/**
 * Classify bytes as "text" or "binary".
 * Returns "binary" if any NUL byte is present or if the bytes are not valid UTF-8.
 */
export function classifyContent(bytes: Uint8Array): "text" | "binary" {
  for (const b of bytes) {
    if (b === 0) return "binary";
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "text";
  } catch {
    return "binary";
  }
}

// ─── Unified diff builder ─────────────────────────────────────────────────────

/** Options for buildUnifiedDiff. */
export interface UnifiedDiffOptions {
  oldPath: string;
  newPath: string;
  /** Number of context lines around each hunk. Default: 3. */
  context?: number;
}

/**
 * Default computation budget for the LCS table, expressed as the product of the
 * old and new line counts AFTER trimming the common prefix / suffix. The DP table
 * holds (m + 1) * (n + 1) 32-bit cells, so 4,000,000 cells ≈ 16 MiB and a bounded
 * amount of CPU. A byte-size limit alone does not bound this (many short lines).
 */
export const DEFAULT_DIFF_LINE_PRODUCT_BUDGET = 4_000_000;

/** Options for buildUnifiedDiffBounded. */
export interface BoundedUnifiedDiffOptions extends UnifiedDiffOptions {
  /** Maximum (trimmed old lines) * (trimmed new lines). Default: DEFAULT_DIFF_LINE_PRODUCT_BUDGET. */
  maxLineProduct?: number;
}

/** Result of buildUnifiedDiffBounded. */
export type BoundedUnifiedDiffResult =
  | { kind: "ok"; diff: string }
  | { kind: "budget-exceeded"; lineProduct: number; budget: number };

/**
 * Build a unified diff string in the standard `---/+++/@@ -a,b +c,d @@` format.
 *
 * - Returns "" when oldText === newText (no change).
 * - CRLF is preserved as-is — never normalised to LF.
 * - Handles: addition-only, deletion-only, empty files, trailing-newline differences.
 * - Output is deterministic for the same inputs.
 */
export function buildUnifiedDiff(
  oldText: string,
  newText: string,
  opts: UnifiedDiffOptions,
): string {
  const result = buildUnifiedDiffBounded(oldText, newText, { ...opts, maxLineProduct: Infinity });
  // Unreachable: with an infinite budget the bounded builder always returns "ok".
  return result.kind === "ok" ? result.diff : "";
}

/**
 * Build a unified diff with an explicit computation budget.
 *
 * The common prefix and suffix lines are trimmed before the O(m*n) LCS step, so
 * a large file with a small localised change stays cheap. If the trimmed line
 * product still exceeds `maxLineProduct`, no diff is computed and
 * `{ kind: "budget-exceeded" }` is returned so the caller can fall back to an
 * alternative representation (e.g. omitting the entry from the patch and
 * carrying the full candidate bytes in the payload).
 */
export function buildUnifiedDiffBounded(
  oldText: string,
  newText: string,
  opts: BoundedUnifiedDiffOptions,
): BoundedUnifiedDiffResult {
  if (oldText === newText) return { kind: "ok", diff: "" };

  const ctx = opts.context ?? 3;
  const budget = opts.maxLineProduct ?? DEFAULT_DIFF_LINE_PRODUCT_BUDGET;
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  const lcsResult = computeLCSBounded(oldLines, newLines, budget);
  if (lcsResult.kind === "budget-exceeded") return lcsResult;

  const ops = buildOps(oldLines.length, newLines.length, lcsResult.pairs);
  const hunkStrings = formatHunks(ops, oldLines, newLines, ctx);

  if (hunkStrings.length === 0) return { kind: "ok", diff: "" };

  return {
    kind: "ok",
    diff: `--- ${opts.oldPath}\n+++ ${opts.newPath}\n${hunkStrings.join("")}`,
  };
}

// ─── internals ────────────────────────────────────────────────────────────────

/** Split text into lines, preserving trailing \n on each line. */
function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      lines.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) {
    lines.push(text.slice(start));
  }
  return lines;
}

type Op =
  | { kind: "equal"; ai: number; bi: number }
  | { kind: "delete"; ai: number }
  | { kind: "insert"; bi: number };

type LCSResult =
  | { kind: "ok"; pairs: [number, number][] }
  | { kind: "budget-exceeded"; lineProduct: number; budget: number };

/**
 * Compute Longest Common Subsequence pairs (0-based indices) under a budget.
 *
 * 1. Trim the common prefix and suffix (O(m + n)); those lines are LCS pairs by construction.
 * 2. If (trimmed m) * (trimmed n) exceeds `budget`, stop without allocating the table.
 * 3. Otherwise run the O(m*n) DP on the middle section using a single flat Uint32Array.
 */
function computeLCSBounded(a: string[], b: string[], budget: number): LCSResult {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return { kind: "ok", pairs: [] };

  // 1. Common prefix
  let prefix = 0;
  const maxPrefix = Math.min(m, n);
  while (prefix < maxPrefix && a[prefix] === b[prefix]) prefix++;

  // Common suffix (never overlapping the prefix)
  let suffix = 0;
  const maxSuffix = Math.min(m, n) - prefix;
  while (suffix < maxSuffix && a[m - 1 - suffix] === b[n - 1 - suffix]) suffix++;

  const midM = m - prefix - suffix;
  const midN = n - prefix - suffix;

  const pairs: [number, number][] = [];
  for (let i = 0; i < prefix; i++) pairs.push([i, i]);

  if (midM > 0 && midN > 0) {
    // 2. Budget check on the trimmed middle
    const lineProduct = midM * midN;
    if (lineProduct > budget) {
      return { kind: "budget-exceeded", lineProduct, budget };
    }

    // 3. DP on the middle section: flat (midM + 1) x (midN + 1) table
    const width = midN + 1;
    const dp = new Uint32Array((midM + 1) * width);
    for (let i = 1; i <= midM; i++) {
      const ai = a[prefix + i - 1];
      const row = i * width;
      const prevRow = row - width;
      for (let j = 1; j <= midN; j++) {
        if (ai === b[prefix + j - 1]) {
          dp[row + j] = dp[prevRow + j - 1]! + 1;
        } else {
          const up = dp[prevRow + j]!;
          const left = dp[row + j - 1]!;
          dp[row + j] = up >= left ? up : left;
        }
      }
    }

    // Backtrack to find match pairs (in reverse order)
    const midPairs: [number, number][] = [];
    let i = midM;
    let j = midN;
    while (i > 0 && j > 0) {
      if (a[prefix + i - 1] === b[prefix + j - 1]) {
        midPairs.push([prefix + i - 1, prefix + j - 1]);
        i--;
        j--;
      } else if (dp[(i - 1) * width + j]! >= dp[i * width + j - 1]!) {
        i--;
      } else {
        j--;
      }
    }
    for (let k = midPairs.length - 1; k >= 0; k--) pairs.push(midPairs[k]!);
  }

  for (let k = 0; k < suffix; k++) {
    pairs.push([m - suffix + k, n - suffix + k]);
  }
  return { kind: "ok", pairs };
}

/** Build edit operations from LCS. */
function buildOps(aLen: number, bLen: number, lcs: [number, number][]): Op[] {
  const ops: Op[] = [];
  let ai = 0;
  let bi = 0;
  for (const [la, lb] of lcs) {
    while (ai < la) ops.push({ kind: "delete", ai: ai++ });
    while (bi < lb) ops.push({ kind: "insert", bi: bi++ });
    ops.push({ kind: "equal", ai: ai++, bi: bi++ });
  }
  while (ai < aLen) ops.push({ kind: "delete", ai: ai++ });
  while (bi < bLen) ops.push({ kind: "insert", bi: bi++ });
  return ops;
}

/** Group change op indices into hunk ranges (including context expansion). */
function groupRanges(
  changeIndices: number[],
  totalOps: number,
  ctx: number,
): [number, number][] {
  if (changeIndices.length === 0) return [];
  const ranges: [number, number][] = [];
  let rangeStart = Math.max(0, changeIndices[0]! - ctx);
  let lastIdx = changeIndices[0]!;

  for (let k = 1; k < changeIndices.length; k++) {
    const idx = changeIndices[k]!;
    if (idx - lastIdx <= 2 * ctx) {
      lastIdx = idx;
    } else {
      ranges.push([rangeStart, Math.min(totalOps, lastIdx + ctx + 1)]);
      rangeStart = Math.max(0, idx - ctx);
      lastIdx = idx;
    }
  }
  ranges.push([rangeStart, Math.min(totalOps, lastIdx + ctx + 1)]);
  return ranges;
}

/** Format all hunks as strings. */
function formatHunks(
  ops: Op[],
  a: string[],
  b: string[],
  ctx: number,
): string[] {
  const changeIndices: number[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i]!.kind !== "equal") changeIndices.push(i);
  }
  if (changeIndices.length === 0) return [];

  const ranges = groupRanges(changeIndices, ops.length, ctx);
  const result: string[] = [];

  for (const [start, end] of ranges) {
    // Count a/b lines before this hunk to determine start positions
    let aPos = 0;
    let bPos = 0;
    for (let i = 0; i < start; i++) {
      const op = ops[i]!;
      if (op.kind === "equal") {
        aPos++;
        bPos++;
      } else if (op.kind === "delete") {
        aPos++;
      } else {
        bPos++;
      }
    }

    let aCount = 0;
    let bCount = 0;
    const bodyLines: string[] = [];

    for (let i = start; i < end; i++) {
      const op = ops[i]!;
      if (op.kind === "equal") {
        aCount++;
        bCount++;
        const line = a[op.ai]!;
        // Ensure diff line ends with \n
        const diffLine = line.endsWith("\n") ? line : line + "\n";
        bodyLines.push(` ${diffLine}`);
        // No-newline marker: only if this is the last line of both files and lacks \n
        if (
          !line.endsWith("\n") &&
          op.ai === a.length - 1 &&
          op.bi === b.length - 1
        ) {
          bodyLines.push("\\ No newline at end of file\n");
        }
      } else if (op.kind === "delete") {
        aCount++;
        const line = a[op.ai]!;
        const diffLine = line.endsWith("\n") ? line : line + "\n";
        bodyLines.push(`-${diffLine}`);
        if (!line.endsWith("\n") && op.ai === a.length - 1) {
          bodyLines.push("\\ No newline at end of file\n");
        }
      } else {
        bCount++;
        const line = b[op.bi]!;
        const diffLine = line.endsWith("\n") ? line : line + "\n";
        bodyLines.push(`+${diffLine}`);
        if (!line.endsWith("\n") && op.bi === b.length - 1) {
          bodyLines.push("\\ No newline at end of file\n");
        }
      }
    }

    // Format hunk header: `-l,s` / `+l,s`
    // For 0-count (pure insert/delete): show `N,0`
    const aHdr =
      aCount === 0 ? `${aPos},0` : aCount === 1 ? `${aPos + 1}` : `${aPos + 1},${aCount}`;
    const bHdr =
      bCount === 0 ? `${bPos},0` : bCount === 1 ? `${bPos + 1}` : `${bPos + 1},${bCount}`;

    result.push(`@@ -${aHdr} +${bHdr} @@\n${bodyLines.join("")}`);
  }

  return result;
}
