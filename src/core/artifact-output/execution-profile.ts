/**
 * Execution profile capability definitions for the artifact-output profile.
 * T-05: execution-profile.ts — pure data, no I/O.
 *
 * Defines:
 * - Profile IDs
 * - Runtime capability IDs
 * - Profile → capability table
 * - Unsupported operations for artifact-output profile
 * - Unsupported entry routes
 */

// ─── Profile IDs ──────────────────────────────────────────────────────────────

export const EXECUTION_PROFILE_IDS = {
  GIT_PR: "git-pr",
  ARTIFACT_OUTPUT: "artifact-output",
} as const;

export type ExecutionProfileId = (typeof EXECUTION_PROFILE_IDS)[keyof typeof EXECUTION_PROFILE_IDS];

// ─── Runtime capability IDs ───────────────────────────────────────────────────

export type RuntimeCapabilityId =
  | "git-revision"
  | "git-commit-attribution"
  | "git-remote-publish"
  | "github-api"
  | "branch-borne-state"
  | "changed-files";

// ─── Profile → capability table ───────────────────────────────────────────────

const PROFILE_CAPABILITIES: Record<ExecutionProfileId, ReadonlySet<RuntimeCapabilityId>> = {
  [EXECUTION_PROFILE_IDS.GIT_PR]: new Set<RuntimeCapabilityId>([
    "git-revision",
    "git-commit-attribution",
    "git-remote-publish",
    "github-api",
    "branch-borne-state",
    "changed-files",
  ]),
  [EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT]: new Set<RuntimeCapabilityId>([
    // artifact-output provides snapshot-based identity, not git-based
    // No git or github capabilities
  ]),
};

export function getProfileCapabilities(profileId: ExecutionProfileId): ReadonlySet<RuntimeCapabilityId> {
  return PROFILE_CAPABILITIES[profileId] ?? new Set();
}

// ─── Step → required capability table ────────────────────────────────────────

/**
 * Maps logical "step/operation name" to the runtime capabilities it requires.
 * Step names that are not listed here require no capabilities.
 *
 * This is the D12 mapping table. Step names match STEP_NAMES constants.
 */
export const STEP_CAPABILITY_REQUIREMENTS: Record<string, readonly RuntimeCapabilityId[]> = {
  // Pipeline steps
  "pr-create": ["git-remote-publish", "github-api"],
  // Lifecycle operations (not pipeline steps per se, but tracked for preflight)
  "merge": ["git-remote-publish", "github-api"],
  "archive": ["git-commit-attribution", "branch-borne-state"],
  "branch-checkpoint": ["branch-borne-state", "git-revision"],
  "commit-adopt": ["git-commit-attribution", "git-revision"],
  "egress-ledger": ["git-commit-attribution", "branch-borne-state"],
  // These steps have no capability requirements:
  // "request-review", "design", "spec-review", "spec-fixer", "test-case-gen",
  // "implementer", "verification", "code-review", "code-fixer", "conformance", "adr-gen"
};

// ─── Unsupported operations ───────────────────────────────────────────────────

export interface UnsupportedOperation {
  id: string;
  displayName: string;
  reason: string;
}

/**
 * Operations that are explicitly unsupported in the artifact-output profile.
 * The guide topic body is derived from this table — no hand-written duplication.
 */
export const UNSUPPORTED_OPERATIONS: readonly UnsupportedOperation[] = [
  {
    id: "push-pr-merge",
    displayName: "Push / PR create / merge",
    reason: "Requires git-remote-publish and github-api capabilities not available in artifact-output profile",
  },
  {
    id: "archive-record",
    displayName: "Feature branch archive record",
    reason: "Requires git-commit-attribution and branch-borne-state not available in artifact-output profile",
  },
  {
    id: "commit-adopt-egress-ledger",
    displayName: "Commit adoption and egress ledger",
    reason: "Requires git-commit-attribution and git-revision not available in artifact-output profile",
  },
  {
    id: "remote-reattach",
    displayName: "Branch checkpoint remote reattach",
    reason: "Requires branch-borne-state and git-revision not available in artifact-output profile",
  },
  {
    id: "issue-unattended-managed",
    displayName: "Issue-origin unattended managed runtime",
    reason: "Issue-origin entry routes are explicitly unsupported; --from-issue and --issue are rejected at preflight",
  },
  {
    id: "commit-oid-operations",
    displayName: "Commit OID-bound operations",
    reason: "No commit OIDs exist in artifact-output profile; revision identity is snapshot-digest based",
  },
];

// ─── Unsupported entry routes ─────────────────────────────────────────────────

export const UNSUPPORTED_ENTRY_ROUTES = {
  FROM_ISSUE: "--from-issue",
  ISSUE_LINKED: "--issue",
} as const;

/**
 * Assert that the entry route is supported for the given profile.
 * Throws an Error with a descriptive message for unsupported routes.
 */
export function assertEntryRouteSupported(
  opts: { fromIssue?: boolean; issueLinked?: boolean },
  profileId: ExecutionProfileId,
): void {
  if (profileId !== EXECUTION_PROFILE_IDS.ARTIFACT_OUTPUT) return;

  if (opts.fromIssue) {
    throw new Error(
      `The artifact-output profile does not support issue-origin entry routes (${UNSUPPORTED_ENTRY_ROUTES.FROM_ISSUE}). ` +
      `Use a request file path with --source <dir> instead.`,
    );
  }
  if (opts.issueLinked) {
    throw new Error(
      `The artifact-output profile does not support issue linkage (${UNSUPPORTED_ENTRY_ROUTES.ISSUE_LINKED}). ` +
      `Issue linkage requires git-remote-publish and github-api capabilities.`,
    );
  }
}
