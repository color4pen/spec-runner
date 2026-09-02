/**
 * Capability contract tests: compile-time verification that LocalRuntime and ManagedRuntime
 * structurally satisfy the consumer-owned capability interfaces.
 *
 * TC-017: LocalRuntime が ChangedFilesCapability を structural typing で満たす
 * TC-018: ManagedRuntime が CommitInspectionCapability を structural typing で満たす
 * TC-028: capability-contracts.test.ts で LocalRuntime と ManagedRuntime の全 capability 実装を compile-time 検証する
 * TC-016: LocalRuntime インスタンスが AssuranceProvenanceRuntime として代入できる (TC-016)
 *
 * These tests are compile-time in nature — if TypeScript type assignments below fail,
 * the test file will not compile (typecheck will fail). No runtime assertions needed.
 */
import { describe, it } from "vitest";
import { LocalRuntime } from "../../../../src/core/runtime/local.js";
import { ManagedRuntime } from "../../../../src/core/runtime/managed.js";
import type {
  ChangedFilesCapability,
  CommitInspectionCapability,
  RevisionContentCapability,
} from "../../../../src/core/port/runtime-strategy.js";
import type { AssuranceProvenanceRuntime } from "../../../../src/core/archive/achieved-assurance.js";

// ---------------------------------------------------------------------------
// Minimal stubs for constructor parameters (not invoked, type-check only)
// ---------------------------------------------------------------------------

function buildMockGithubClient() {
  return {
    verifyBranch: () => Promise.resolve(true),
    verifyPath: () => Promise.resolve(true),
    getRawFile: () => Promise.resolve(null),
    verifyTokenScopes: () => Promise.resolve({ status: 200, scopes: ["repo"] }),
    getRefSha: () => Promise.resolve(null),
    listPullRequests: () => Promise.resolve([]),
    createPullRequest: () => Promise.resolve({ url: "", number: 0 }),
    getPullRequest: () => Promise.resolve({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
    mergePullRequest: () => Promise.resolve({ merged: true, message: "" }),
    getCheckStatus: () => Promise.resolve({ state: "success" as const, total: 0, failing: [], pending: [] }),
    listPullRequestFiles: () => Promise.resolve({ files: [], truncated: false }),
    createIssueComment: () => Promise.resolve({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: () => Promise.resolve([]),
    listIssueComments: () => Promise.resolve([]),
    removeLabel: () => Promise.resolve(undefined),
    getIssue: () => Promise.resolve({ number: 1, title: "Test Issue", body: "", nodeId: "NODE_001" }),
    createLinkedBranch: () => Promise.resolve(undefined),
    listIssueClosingPullRequests: () => Promise.resolve([]),
  };
}

function buildMockSessionClient() {
  return {
    createSession: () => Promise.resolve({ sessionId: "" }),
    sendUserMessage: () => Promise.resolve(),
    pollUntilComplete: () => Promise.resolve({ status: "complete" }),
    streamEvents: async function* () { yield undefined; },
    getSessionUsage: () => Promise.resolve(undefined),
    listEvents: () => Promise.resolve([]),
    sendEvents: () => Promise.resolve(undefined),
  };
}

// ---------------------------------------------------------------------------
// TC-017: LocalRuntime が ChangedFilesCapability を structural typing で満たす
// ---------------------------------------------------------------------------

describe("TC-017: LocalRuntime satisfies capability interfaces (compile-time)", () => {
  it("LocalRuntime instance is assignable to all capability types", () => {
    const githubClient = buildMockGithubClient();
    const runtime = new LocalRuntime({ cwd: "/tmp/test", githubClient });

    // Compile-time checks: if these assignments fail, typecheck fails
    const _cf: ChangedFilesCapability = runtime;
    const _ci: CommitInspectionCapability = runtime;
    const _rv: RevisionContentCapability = runtime;
    const _apr: AssuranceProvenanceRuntime = runtime;

    // Suppress "unused variable" warnings — these are type-only checks
    void _cf; void _ci; void _rv; void _apr;
  });
});

// ---------------------------------------------------------------------------
// TC-018: ManagedRuntime が CommitInspectionCapability を structural typing で満たす
// ---------------------------------------------------------------------------

describe("TC-018: ManagedRuntime satisfies capability interfaces (compile-time)", () => {
  it("ManagedRuntime instance is assignable to all capability types", () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGithubClient();
    const runtime = new ManagedRuntime(
      "/tmp/test",
      sessionClient as never,
      githubClient,
      { owner: "testowner", name: "testrepo" },
      undefined,
      "",
    );

    // Compile-time checks: if these assignments fail, typecheck fails
    const _cf: ChangedFilesCapability = runtime;
    const _ci: CommitInspectionCapability = runtime;
    const _rv: RevisionContentCapability = runtime;
    const _apr: AssuranceProvenanceRuntime = runtime;

    // Suppress "unused variable" warnings — these are type-only checks
    void _cf; void _ci; void _rv; void _apr;
  });
});

// ---------------------------------------------------------------------------
// Negative contract: `{}` must NOT satisfy the capability interfaces.
//
// Regression guard for PR #1102 review: when the sole method of a capability
// was optional, `{}` satisfied the interface and the positive assignments above
// were vacuous. The @ts-expect-error lines below fail typecheck if any of these
// methods is ever made optional again.
// ---------------------------------------------------------------------------

describe("negative contract: empty object does not satisfy required-method capabilities", () => {
  it("{} is rejected at compile time for each capability", () => {
    // @ts-expect-error listCommitChangedFiles is required
    const _badCi: CommitInspectionCapability = {};
    // @ts-expect-error readRevisionContent is required
    const _badRv: RevisionContentCapability = {};
    // @ts-expect-error readFileAtCommit is required
    const _badApr: AssuranceProvenanceRuntime = {};
    // @ts-expect-error listChangedFiles is required
    const _badCf: ChangedFilesCapability = {};

    void _badCi; void _badRv; void _badApr; void _badCf;
  });
});

// Note: deriveCommitInspectionCapability and deriveRevisionContentCapability have been
// deleted as part of the R2c refactoring (T-09). buildDeps() now constructs capabilities
// directly using bound methods instead of shim functions.
