/**
 * Consumer-owned composite deps invariants (T-19, operator review on PR #1105).
 *
 * TC-049: PipelineDeps assigns to each composite without casts (compile-time proof).
 * TC-050: composites are explicit interfaces declared in their consumer modules,
 *         never derived from PipelineDeps via Pick/Omit (source-level invariant).
 */

import { describe, it, expect } from "vitest";
import * as url from "node:url";
import * as fs from "node:fs";
import * as path from "node:path";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { StepExecutionDeps } from "../../../src/core/step/step-deps.js";
import type { ParallelReviewRoundDeps } from "../../../src/core/pipeline/parallel-review-round.js";
import type { PipelineOrchestrationDeps } from "../../../src/core/pipeline/pipeline.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, "../../../src");

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("consumer-owned composite deps (T-19)", () => {
  // TC-049 — compile-time proof: these functions only typecheck if PipelineDeps
  // is structurally assignable to each composite without casts.
  it("PipelineDeps assigns to every composite without casts (TC-049)", () => {
    const toStep = (d: PipelineDeps): StepExecutionDeps => d;
    const toRound = (d: PipelineDeps): ParallelReviewRoundDeps => d;
    const toPipeline = (d: PipelineDeps): PipelineOrchestrationDeps => d;
    expect(typeof toStep).toBe("function");
    expect(typeof toRound).toBe("function");
    expect(typeof toPipeline).toBe("function");
  });

  // TC-050 — the contracts are owned by consumers: no production source may
  // derive a type from PipelineDeps via Pick/Omit (#1103: the source of truth
  // must not be the producer's key set).
  it("no production source derives types from PipelineDeps via Pick/Omit (TC-050)", () => {
    const offenders: string[] = [];
    for (const file of listSourceFiles(SRC_ROOT)) {
      const text = fs.readFileSync(file, "utf8");
      if (/(?:Pick|Omit)\s*<\s*PipelineDeps\b/.test(text)) {
        offenders.push(path.relative(SRC_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  // TC-050 — the composite declarations live in their consumer modules, not in
  // the producer module (src/core/types.ts).
  it("composites are declared in consumer modules, not in core/types.ts (TC-050)", () => {
    const declares = (file: string, name: string): boolean =>
      new RegExp(`export interface ${name}\\b`).test(
        fs.readFileSync(path.join(SRC_ROOT, file), "utf8"),
      );
    expect(declares("core/step/step-deps.ts", "StepExecutionDeps")).toBe(true);
    expect(declares("core/pipeline/parallel-review-round.ts", "ParallelReviewRoundDeps")).toBe(true);
    expect(declares("core/pipeline/pipeline.ts", "PipelineOrchestrationDeps")).toBe(true);

    const typesText = fs.readFileSync(path.join(SRC_ROOT, "core/types.ts"), "utf8");
    for (const name of ["StepExecutionDeps", "ParallelReviewRoundDeps", "PipelineOrchestrationDeps"]) {
      expect(typesText).not.toMatch(new RegExp(`export (type|interface) ${name}\\b`));
    }
  });
});
