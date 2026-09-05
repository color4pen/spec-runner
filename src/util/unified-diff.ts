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
  if (oldText === newText) return "";

  const ctx = opts.context ?? 3;
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);

  const lcs = computeLCS(oldLines, newLines);
  const ops = buildOps(oldLines.length, newLines.length, lcs);
  const hunkStrings = formatHunks(ops, oldLines, newLines, ctx);

  if (hunkStrings.length === 0) return "";

  return `--- ${opts.oldPath}\n+++ ${opts.newPath}\n${hunkStrings.join("")}`;
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

/** Compute Longest Common Subsequence pairs (0-based indices). */
function computeLCS(a: string[], b: string[]): [number, number][] {
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return [];

  // O(m*n) DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Backtrack to find match pairs
  const pairs: [number, number][] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      i--;
    } else {
      j--;
    }
  }
  return pairs.reverse();
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
