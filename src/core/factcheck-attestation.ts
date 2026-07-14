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
 * Build a FactCheckAttestation from request content and verified assertions.
 * Pure: no I/O.
 */
export function buildFactCheckAttestation(
  requestContent: string,
  verifiedAssertions: string[],
): FactCheckAttestation {
  return {
    requestHash: hashRequestContent(requestContent),
    codeAssertionsVerified: true,
    verifiedAssertions: Array.from(verifiedAssertions),
  };
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
    return {
      requestHash: obj["requestHash"] as string,
      codeAssertionsVerified: obj["codeAssertionsVerified"] as boolean,
      verifiedAssertions,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Evaluate
// ---------------------------------------------------------------------------

/**
 * Evaluate a raw attestation string against the current request.md content.
 *
 * - null or unparseable → { status: "absent", verifiedAssertions: [] }
 * - parsed but codeAssertionsVerified !== true OR hash mismatch → { status: "stale", verifiedAssertions: [] }
 * - parsed AND codeAssertionsVerified AND hash matches → { status: "valid", verifiedAssertions }
 */
export function evaluateFactCheckAttestation(
  attestationRaw: string | null,
  currentRequestContent: string,
): AttestationEvaluation {
  if (attestationRaw === null) {
    return { status: "absent", verifiedAssertions: [] };
  }

  const parsed = parseFactCheckAttestation(attestationRaw);
  if (parsed === null) {
    return { status: "absent", verifiedAssertions: [] };
  }

  if (!parsed.codeAssertionsVerified || parsed.requestHash !== hashRequestContent(currentRequestContent)) {
    return { status: "stale", verifiedAssertions: [] };
  }

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
      ? "the attestation is stale (request.md has changed since request-review ran, or codeAssertionsVerified is false)"
      : "no fact-check attestation is present for this change";

  return `## Fact-Check Attestation Directive

No valid attestation is available (${reason}).

**Instruction**: Verify ALL in-scope code assertions (file:line / symbol / path) as usual before proceeding with design.`;
}
