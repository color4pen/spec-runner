/**
 * issue-target: start face.
 *
 * Owns the issue → job lifecycle conversion:
 *   - materializeDraftAndStart: inbox / --from-issue path (writes draft, then starts via injected primitive)
 *   - startWithIssueLink: positional path (runs existing request.md, injecting link callback)
 *   - buildLinkedBranchRegistrar: builds the onFeatureBranchCreated callback (best-effort)
 *
 * This module does NOT import from the cli layer. The start primitive (runRunCore) is injected by callers.
 */
import { writeDraft } from "../inbox/draft-writer.js";
import { stderrWrite } from "../../logger/stdout.js";
import type { GitHubClient } from "../../kernel/github-client.js";

/**
 * Injected start primitive: caller-supplied function that starts a job from a request.md path.
 * Structurally compatible with runRunCore from the cli layer — injected by callers, never imported here.
 */
export type StartPrimitive = (
  requestMdPath: string,
  options: {
    cwd?: string;
    inboxOrigin?: boolean;
    issue?: number;
    onFeatureBranchCreated?: (baseOid: string, branchName: string) => Promise<void>;
  },
) => Promise<number>;

export interface MaterializeDraftAndStartOptions {
  repoRoot: string;
  slug: string;
  issueBody: string;
  issueNumber: number;
  githubClient: GitHubClient;
  owner: string;
  repo: string;
  startPrimitive: StartPrimitive;
}

export interface StartWithIssueLinkOptions {
  repoRoot: string;
  requestMdPath: string;
  issueNumber: number;
  githubClient: GitHubClient;
  owner: string;
  repo: string;
  startPrimitive: StartPrimitive;
}

/**
 * Build an onFeatureBranchCreated callback that registers a Development linked branch for an issue.
 *
 * Failure is caught internally: logs a warning and resolves (never rejects).
 * Callers receive best-effort semantics — link failure does not stop job start.
 */
export function buildLinkedBranchRegistrar(opts: {
  githubClient: GitHubClient;
  owner: string;
  repo: string;
  issueNumber: number;
}): (baseOid: string, branchName: string) => Promise<void> {
  return async (baseOid, branchName) => {
    try {
      const issue = await opts.githubClient.getIssue(opts.owner, opts.repo, opts.issueNumber);
      await opts.githubClient.createLinkedBranch(issue.nodeId, branchName, baseOid);
    } catch (err) {
      stderrWrite(
        `Warning: linked branch registration failed for issue #${opts.issueNumber}: ${(err as Error).message ?? err}`,
      );
    }
  };
}

/**
 * Write the issue body as a draft request.md and start the pipeline via the injected primitive.
 *
 * Ordering contract: writeDraft is called before startPrimitive.
 * Primitive exceptions (e.g. SlugOccupiedError) propagate to the caller unchanged.
 */
export async function materializeDraftAndStart(opts: MaterializeDraftAndStartOptions): Promise<number> {
  const { repoRoot, slug, issueBody, issueNumber, githubClient, owner, repo, startPrimitive } = opts;
  await writeDraft(repoRoot, slug, issueBody);
  const draftPath = `specrunner/drafts/${slug}/request.md`;
  const onFeatureBranchCreated = buildLinkedBranchRegistrar({ githubClient, owner, repo, issueNumber });
  return startPrimitive(draftPath, { cwd: repoRoot, inboxOrigin: true, issue: issueNumber, onFeatureBranchCreated });
}

/**
 * Start from an existing request.md path with issue linkage (positional + --issue path).
 *
 * Does NOT pass inboxOrigin — positional path is not inbox-origin.
 */
export async function startWithIssueLink(opts: StartWithIssueLinkOptions): Promise<number> {
  const { repoRoot, requestMdPath, issueNumber, githubClient, owner, repo, startPrimitive } = opts;
  const onFeatureBranchCreated = buildLinkedBranchRegistrar({ githubClient, owner, repo, issueNumber });
  return startPrimitive(requestMdPath, { cwd: repoRoot, issue: issueNumber, onFeatureBranchCreated });
}
