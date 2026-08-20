/**
 * Core function: issue body → draft → start.
 *
 * Single implementation shared by inbox's startJob effect and the
 * `job start --from-issue` CLI path.
 *
 * Does NOT include the occupancy pre-check — inbox retains that check so it
 * can post a rejection comment on SlugOccupiedError. The --from-issue path
 * relies on the existing assertNoDuplicateLiveJob check inside runRunCore.
 */
import { writeDraft } from "../inbox/draft-writer.js";

export interface MaterializeDraftAndStartOptions {
  repoRoot: string;
  slug: string;
  issueBody: string;
  issueNumber: number;
}

/**
 * Write the issue body as a draft request.md and start the pipeline.
 *
 * Returns the exit code from runRunCore (0 = success).
 */
export async function materializeDraftAndStart(
  opts: MaterializeDraftAndStartOptions,
): Promise<number> {
  const { repoRoot, slug, issueBody, issueNumber } = opts;
  await writeDraft(repoRoot, slug, issueBody);
  const draftPath = `specrunner/drafts/${slug}/request.md`;
  const { runRunCore } = await import("../../cli/run.js");
  return runRunCore(draftPath, { cwd: repoRoot, issue: issueNumber, inboxOrigin: true });
}
