/**
 * factcheck-attestation — pure functions for request-review fact-check attestation.
 *
 * Purpose: request-review writes a machine-readable attestation after completing
 * its Step 2 (Code Assertion Fact-Check). The design step reads this attestation
 * to skip re-verifying assertions that were already verified against an unchanged
 * request.md, reducing design exploration cost.
 *
 * All functions in this module are pure (no I/O, no side effects).
 * Uses node:crypto — no Bun APIs (per codebase constraint).
 */
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FactCheckAttestation {
  requestHash: string;
  codeAssertionsVerified: boolean;
  verifiedAssertions: string[];
  /**
   * SHA of the most recent source commit (excluding the change folder) at the
   * time request-review ran. Used by design to detect source changes that occurred
   * after the attestation was written.
   * Optional for backward compatibility — absent in attestations written before
   * this field was introduced (treated as stale by evaluateFactCheckAttestation).
   */
  sourceRevision?: string;
}

export type AttestationStatus = "valid" | "stale" | "absent";

export interface AttestationEvaluation {
  status: AttestationStatus;
  verifiedAssertions: string[];
}

// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------

/**
 * Deterministically hash a request.md content string.
 * Returns "sha256:" + hex digest.
 *
 * Uses node:crypto createHash (not Bun APIs) per codebase constraint.
 */
export function hashRequestContent(content: string): string {
  return "sha256:" + createHash("sha256").update(content).digest("hex");
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Build a FactCheckAttestation from request content, verified assertions, and
 * an optional source revision.
 *
 * @param requestContent - The raw content of request.md (used to compute requestHash).
 * @param verifiedAssertions - List of assertion descriptions verified in Step 2.
 * @param sourceRevision - Optional git SHA of the most recent source commit
 *   (excluding the change folder). When provided, it is included in the output
 *   so design can verify the source has not changed since request-review ran.
 *   When omitted, the field is not included in the output.
 * Pure: no I/O.
 */
export function buildFactCheckAttestation(
  requestContent: string,
  verifiedAssertions: string[],
  sourceRevision?: string,
): FactCheckAttestation {
  const attestation: FactCheckAttestation = {
    requestHash: hashRequestContent(requestContent),
    codeAssertionsVerified: true,
    verifiedAssertions: Array.from(verifiedAssertions),
  };
  if (sourceRevision !== undefined) {
    attestation.sourceRevision = sourceRevision;
  }
  return attestation;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Parse a raw JSON string into a FactCheckAttestation.
 * Returns null on parse error or when the shape is invalid
 * (missing/typed-wrong requestHash / codeAssertionsVerified / verifiedAssertions).
 * Coerces verifiedAssertions elements to strings.
 */
export function parseFactCheckAttestation(raw: string): FactCheckAttestation | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)["requestHash"] !== "string" ||
      typeof (parsed as Record<string, unknown>)["codeAssertionsVerified"] !== "boolean" ||
      !Array.isArray((parsed as Record<string, unknown>)["verifiedAssertions"])
    ) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    const verifiedAssertions = (obj["verifiedAssertions"] as unknown[]).map((item) =>
      typeof item === "string" ? item : String(item),
    );
    // sourceRevision is optional; accept only string values, treat all others as undefined.
    const sourceRevision =
      typeof obj["sourceRevision"] === "string" ? obj["sourceRevision"] : undefined;
    const attestation: FactCheckAttestation = {
      requestHash: obj["requestHash"] as string,
      codeAssertionsVerified: obj["codeAssertionsVerified"] as boolean,
      verifiedAssertions,
    };
    if (sourceRevision !== undefined) {
      attestation.sourceRevision = sourceRevision;
    }
    return attestation;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Evaluate
// ---------------------------------------------------------------------------

/**
 * Evaluate a raw attestation string against the current request.md content and
 * the current source revision.
 *
 * Judgment order (fail-safe: every ambiguity resolves to stale rather than valid):
 *
 * 1. null or unparseable → { status: "absent", verifiedAssertions: [] }
 * 2. !codeAssertionsVerified OR requestHash mismatch → { status: "stale", ... }
 * 3. attestation.sourceRevision === undefined (old attestation without source binding),
 *    OR currentSourceRevision === null (git unavailable / no source commits),
 *    OR sourceRevision mismatch → { status: "stale", ... }
 * 4. All checks pass → { status: "valid", verifiedAssertions }
 *
 * @param attestationRaw - Raw JSON string from the attestation file, or null if absent.
 * @param currentRequestContent - Current content of request.md (for hash comparison).
 * @param currentSourceRevision - Source revision read at evaluation time (from
 *   readSourceRevision). Pass null when git is unavailable; the result will be stale
 *   (fail-safe).
 */
export function evaluateFactCheckAttestation(
  attestationRaw: string | null,
  currentRequestContent: string,
  currentSourceRevision: string | null,
): AttestationEvaluation {
  // 1. Absent / unparseable
  if (attestationRaw === null) {
    return { status: "absent", verifiedAssertions: [] };
  }

  const parsed = parseFactCheckAttestation(attestationRaw);
  if (parsed === null) {
    return { status: "absent", verifiedAssertions: [] };
  }

  // 2. Existing stale conditions (preserved verbatim)
  if (!parsed.codeAssertionsVerified || parsed.requestHash !== hashRequestContent(currentRequestContent)) {
    return { status: "stale", verifiedAssertions: [] };
  }

  // 3. Source revision binding (fail-safe: any missing / mismatched signal → stale)
  if (
    parsed.sourceRevision === undefined ||
    currentSourceRevision === null ||
    parsed.sourceRevision !== currentSourceRevision
  ) {
    return { status: "stale", verifiedAssertions: [] };
  }

  // 4. All checks passed
  return { status: "valid", verifiedAssertions: parsed.verifiedAssertions };
}

// ---------------------------------------------------------------------------
// Directive
// ---------------------------------------------------------------------------

/**
 * Build a text directive for injection into the design initial message.
 *
 * For valid: instructs the agent to skip re-verifying the listed assertions
 * and to verify only in-scope assertions NOT in the list.
 *
 * For stale/absent: instructs the agent to verify ALL in-scope assertions as usual.
 */
export function buildFactCheckDirective(evaluation: AttestationEvaluation): string {
  if (evaluation.status === "valid") {
    const listItems =
      evaluation.verifiedAssertions.length > 0
        ? evaluation.verifiedAssertions.map((a) => `  - ${a}`).join("\n")
        : "  (none listed)";
    return `## Fact-Check Attestation Directive

The request-review step has already verified the following code assertions against the current request.md (attestation: valid — hash matches):

${listItems}

**Instruction**: You MAY skip re-verifying the assertions listed above — they have already been verified by request-review against an unchanged request.md. You MUST still verify any in-scope assertion (file:line / symbol / path) that is NOT in the list above before proceeding with design.`;
  }

  // stale or absent
  const reason =
    evaluation.status === "stale"
      ? "the attestation is stale (request.md has changed, source revision has changed since request-review ran, or codeAssertionsVerified is false)"
      : "no fact-check attestation is present for this change";

  return `## Fact-Check Attestation Directive

No valid attestation is available (${reason}).

**Instruction**: Verify ALL in-scope code assertions (file:line / symbol / path) as usual before proceeding with design.`;
}
