/**
 * Doctor check: slug-occupancy
 *
 * Detects per-slug occupancy breaches and sidecar mismatches.
 *
 * For each known slug:
 *   (a) ≥2 non-terminal jobs → breach: enumerate candidates, advise manual cancel
 *   (b) sidecar points to a terminal/absent job while exactly 1 non-terminal exists
 *       → mismatch: hint pointing to `specrunner doctor repair <slug>`
 *   clean → pass
 *
 * Category: storage
 * Required: false (warn-level finding)
 *
 * Design: factory function mirrors orphan-sidecars check pattern.
 * Injected scan function allows deterministic unit testing.
 */
import type { DoctorCheck, DoctorContext } from "../../types.js";
import type { OccupancyScanResult } from "../../../occupancy/scan.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Extends OccupancyScanResult with the current sidecar's jobId.
 * `sidecarJobId` is optional so partial scan result fixtures in tests can omit it;
 * the default scan function always supplies it as string | null.
 */
export interface SlugOccupancyScanResult extends OccupancyScanResult {
  sidecarJobId?: string | null;
}

/** Injectable scan function for doctor slug-occupancy check. */
export type SlugOccupancyScanFn = (
  repoRoot: string,
  slug: string,
) => Promise<SlugOccupancyScanResult>;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the slug-occupancy doctor check.
 *
 * @param overrideScan - injectable scan function for testing
 * @param slugs        - slug list to check (if omitted, check resolves slugs from state store)
 */
export function createSlugOccupancyCheck(
  overrideScan?: SlugOccupancyScanFn,
  slugs?: string[],
): DoctorCheck {
  return {
    name: "slug-occupancy",
    category: "storage",
    required: false,

    async check(ctx: DoctorContext) {
      const repoRoot = ctx.repoRoot ?? ctx.cwd;
      const scan = overrideScan ?? defaultSlugOccupancyScanFn;

      // Resolve slugs: use injected list or discover from state store
      let slugList: string[];
      if (slugs !== undefined) {
        slugList = slugs;
      } else {
        slugList = await discoverSlugs(repoRoot);
      }

      if (slugList.length === 0) {
        return { status: "pass", message: "No slugs to check." };
      }

      const breaches: Array<{ slug: string; candidates: string[] }> = [];
      const mismatches: Array<{ slug: string; nonTerminalJobId: string; sidecarJobId: string | null }> = [];

      for (const slug of slugList) {
        const result = await scan(repoRoot, slug);

        if (result.nonTerminal.length >= 2) {
          // Breach: multiple non-terminal jobs
          const candidates = result.nonTerminal.map(
            (e) => `${e.jobId} (status: ${e.status})`,
          );
          breaches.push({ slug, candidates });
        } else if (
          result.nonTerminal.length === 1 &&
          result.sidecarJobId !== result.nonTerminal[0]!.jobId
        ) {
          // Mismatch: sidecar points to wrong (or absent) job
          mismatches.push({
            slug,
            nonTerminalJobId: result.nonTerminal[0]!.jobId,
            sidecarJobId: result.sidecarJobId ?? null,
          });
        }
      }

      if (breaches.length === 0 && mismatches.length === 0) {
        return { status: "pass", message: "All slug occupancy sidecars are consistent." };
      }

      const details: string[] = [];

      for (const b of breaches) {
        details.push(`Breach in slug '${b.slug}': multiple non-terminal jobs detected. Cancel the unwanted job(s) manually:`);
        for (const c of b.candidates) {
          details.push(`  ${c}`);
        }
      }

      for (const m of mismatches) {
        const sidecarDesc = m.sidecarJobId ? `points to '${m.sidecarJobId}'` : "is absent";
        details.push(
          `Mismatch in slug '${m.slug}': sidecar ${sidecarDesc} but non-terminal job is '${m.nonTerminalJobId}'.`,
        );
      }

      const hasBreaches = breaches.length > 0;
      const hasMismatches = mismatches.length > 0;

      const summary = [
        hasBreaches ? `${breaches.length} breach(es)` : "",
        hasMismatches ? `${mismatches.length} mismatch(es)` : "",
      ]
        .filter(Boolean)
        .join(", ");

      const hintParts: string[] = [];
      if (hasBreaches) {
        hintParts.push("Cancel the unwanted non-terminal jobs manually (human judgment required).");
      }
      if (hasMismatches) {
        hintParts.push(
          "Run 'specrunner doctor repair <slug>' to re-point the sidecar to the correct job.",
        );
      }

      return {
        status: "warn",
        message: `Slug occupancy issues found: ${summary}.`,
        hint: hintParts.join(" "),
        details,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Default implementations
// ---------------------------------------------------------------------------

async function discoverSlugs(repoRoot: string): Promise<string[]> {
  const { JobStateStore } = await import("../../../../store/job-state-store.js");
  const { getJobSlug } = await import("../../../../state/job-slug.js");
  const states = await JobStateStore.list(repoRoot);
  const slugSet = new Set<string>();
  for (const s of states) {
    const slug = getJobSlug(s);
    if (slug) slugSet.add(slug);
  }
  return [...slugSet];
}

async function defaultSlugOccupancyScanFn(
  repoRoot: string,
  slug: string,
): Promise<SlugOccupancyScanResult> {
  const { scanSlugOccupancy } = await import("../../../occupancy/scan.js");
  const { livenessJsonPath } = await import("../../../../util/paths.js");
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const [scanResult, sidecarJobId] = await Promise.all([
    scanSlugOccupancy(repoRoot, slug),
    (async () => {
      try {
        const raw = await fs.readFile(path.join(repoRoot, livenessJsonPath(slug)), "utf-8");
        const obj = JSON.parse(raw) as Record<string, unknown>;
        return typeof obj["jobId"] === "string" ? obj["jobId"] : null;
      } catch {
        return null;
      }
    })(),
  ]);

  return { ...scanResult, sidecarJobId };
}
