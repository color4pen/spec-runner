/**
 * Job state operations: history append and on-read validation/normalization.
 */
import type { JobState, HistoryEntry, StepRun, OperatorAdjudication } from "./types.js";

export const MAX_HISTORY_SIZE = 100;

/**
 * Append a history entry to a job state (pure transform — returns new state).
 * Design D4: no persistent truncation — the full history is retained in the journal.
 * Callers that need display truncation should apply cap at presentation time.
 */
export function appendHistoryEntry(state: JobState, entry: HistoryEntry): JobState {
  const history = [...state.history, entry];
  return {
    ...state,
    history,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Append a synthesized commit OID to the synthesizedCommits ledger (pure transform).
 *
 * Deduplicates: if the OID is already present in the ledger, returns the original state
 * unchanged (idempotent). Never performs I/O — synchronous pure function.
 *
 * Design B-13: state writes happen only in the CommitOrchestrator layer; git-layer callers
 * receive the OID in-memory and pass it upward for this helper to persist.
 *
 * @param state - Current job state (not mutated).
 * @param oid   - Commit OID to append to the ledger.
 * @returns New state with the OID appended (or original state if OID was already present).
 */
export function appendSynthesizedCommit(state: JobState, oid: string): JobState {
  const existing = state.synthesizedCommits ?? [];
  if (existing.includes(oid)) return state;
  return { ...state, synthesizedCommits: [...existing, oid] };
}

/**
 * Append an operator adjudication record to the operatorAdjudications ledger (pure transform).
 *
 * Pattern mirrors appendSynthesizedCommit: returns a new state with the record appended.
 * Never mutates the original state — creates a new array reference.
 * When operatorAdjudications is absent, creates a 1-element array.
 *
 * @param state  - Current job state (not mutated).
 * @param record - Operator adjudication record to append.
 * @returns New state with record appended to operatorAdjudications.
 */
export function appendOperatorAdjudication(
  state: JobState,
  record: OperatorAdjudication,
): JobState {
  const existing = state.operatorAdjudications ?? [];
  return { ...state, operatorAdjudications: [...existing, record] };
}

/**
 * Normalize a steps record: convert any legacy format to StepRun[].
 * Handles:
 *   - Missing or null steps → {}
 *   - Pre-array (plain object per step) → [StepRun]
 *   - StepResult[] (iteration/session shape) → StepRun[]
 *   - StepRun[] (current shape) → StepRun[] (passthrough)
 */
function normalizeSteps(steps: unknown): Record<string, StepRun[]> {
  if (typeof steps !== "object" || steps === null) {
    return {};
  }
  const result: Record<string, StepRun[]> = {};
  const fallbackTs = new Date().toISOString();

  for (const [key, value] of Object.entries(steps as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      if (typeof value === "object" && value !== null) {
        // Pre-array: single plain object → wrap as StepRun with attempt=1
        result[key] = [legacyObjectToStepRun(value as Record<string, unknown>, 1, fallbackTs)];
      }
      continue;
    }

    // Array form: each element may be StepRun or legacy StepResult
    result[key] = (value as unknown[]).map((item, idx) => {
      if (typeof item !== "object" || item === null) return null;
      const obj = item as Record<string, unknown>;
      // StepRun has `attempt` + `outcome`; StepResult has `iteration` or `verdict` at top level
      if ("attempt" in obj && "outcome" in obj) {
        return obj as unknown as StepRun;
      }
      // Legacy StepResult shape
      return legacyObjectToStepRun(obj, idx + 1, fallbackTs);
    }).filter((r): r is StepRun => r !== null);
  }
  return result;
}

/**
 * Convert a legacy StepResult-shaped plain object to StepRun.
 */
function legacyObjectToStepRun(
  obj: Record<string, unknown>,
  attempt: number,
  fallbackTs: string,
): StepRun {
  const sessionId =
    typeof obj["sessionId"] === "string"
      ? obj["sessionId"]
      : typeof obj["session"] === "object" && obj["session"] !== null
        ? ((obj["session"] as Record<string, unknown>)["id"] as string | null) ?? null
        : null;
  const endedAt = (obj["completedAt"] as string | null) ?? fallbackTs;
  return {
    attempt,
    sessionId,
    outcome: {
      verdict: (obj["verdict"] as StepRun["outcome"]["verdict"]) ?? null,
      findingsPath: (obj["findingsPath"] as string | null) ?? null,
      error: (obj["error"] as StepRun["outcome"]["error"]) ?? null,
    },
    startedAt: endedAt,
    endedAt,
  };
}

/**
 * Validate that a raw parsed object is a valid JobState.
 * Returns the typed state or throws describing the invalid field.
 * Backward compat: missing `steps` field is filled with `{}`.
 * Backward compat: steps entries that are plain objects are normalized to arrays.
 */
export function validateJobState(raw: unknown): JobState {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("State must be a JSON object.");
  }
  const obj = raw as Record<string, unknown>;

  // Backward compat: accept version 1 (pre-R5) and normalize to 2 on read.
  // Version 2 introduces lineage recording (journal-side) and arbitrary step name support.
  // Versions other than 1 or 2 are rejected.
  if (obj["version"] !== 1 && obj["version"] !== 2) {
    throw new Error(`State version must be 1 or 2 (got ${JSON.stringify(obj["version"])}).`);
  }
  if (obj["version"] === 1) {
    obj["version"] = 2;
  }
  if (typeof obj["jobId"] !== "string" || obj["jobId"].length === 0) {
    throw new Error("Missing required field: jobId.");
  }
  if (typeof obj["createdAt"] !== "string") {
    throw new Error("Missing required field: createdAt.");
  }
  if (typeof obj["updatedAt"] !== "string") {
    throw new Error("Missing required field: updatedAt.");
  }
  if (typeof obj["request"] !== "object" || obj["request"] === null) {
    throw new Error("Missing required field: request.");
  }
  // Backward compat: slug field absent in legacy state files → default to null
  {
    const req = obj["request"] as Record<string, unknown>;
    if (!("slug" in req)) {
      req["slug"] = null;
    }
  }
  if (typeof obj["repository"] !== "object" || obj["repository"] === null) {
    throw new Error("Missing required field: repository.");
  }
  if (typeof obj["step"] !== "string") {
    throw new Error("Missing required field: step.");
  }
  if (typeof obj["status"] !== "string") {
    throw new Error("Missing required field: status.");
  }
  if (!Array.isArray(obj["history"])) {
    throw new Error("Missing required field: history.");
  }

  // Backward compat: fill missing steps field with empty object, and normalize legacy object-form steps
  obj["steps"] = normalizeSteps(obj["steps"]);

  // Backward compat: worktreePath absent in legacy state files → treated as undefined (not an error)
  // No validation needed: the field is optional and null/string/undefined are all valid values.

  // Backward compat: on-read remap; mutates the parsed object so subsequent persists do not write SESSION_TIMEOUT.
  // Design D2: old state files with error.code === "SESSION_TIMEOUT" are remapped on read.
  if (
    typeof obj["error"] === "object" &&
    obj["error"] !== null &&
    (obj["error"] as Record<string, unknown>)["code"] === "SESSION_TIMEOUT"
  ) {
    (obj["error"] as Record<string, unknown>)["code"] = "SESSION_TERMINATED";
  }

  // Backward compat: remap legacy step="propose" to "design" (renamed in 2026-05)
  if (obj["step"] === "propose") {
    obj["step"] = "design";
  }

  // Backward compat: remap legacy status="success" to "awaiting-archive"
  if (obj["status"] === "success") {
    obj["status"] = "awaiting-archive";
  }

  // Backward compat: remap legacy status="awaiting-merge" to "awaiting-archive"
  if (obj["status"] === "awaiting-merge") {
    obj["status"] = "awaiting-archive";
  }

  // Validate status is a known value
  const VALID_STATUSES: Set<string> = new Set([
    "running", "awaiting-resume", "awaiting-archive", "failed", "terminated", "archived", "canceled",
  ]);
  if (!VALID_STATUSES.has(obj["status"] as string)) {
    throw new Error(`Invalid status: ${obj["status"] as string}`);
  }

  // Validate resumePoint when present (backward compat: absence is OK)
  if ("resumePoint" in obj && obj["resumePoint"] !== null && obj["resumePoint"] !== undefined) {
    if (typeof obj["resumePoint"] !== "object") {
      throw new Error("resumePoint must be an object when present.");
    }
  }

  // Validate mainCheckoutDrift when present (backward compat: absence is OK)
  if ("mainCheckoutDrift" in obj && obj["mainCheckoutDrift"] !== null && obj["mainCheckoutDrift"] !== undefined) {
    if (typeof obj["mainCheckoutDrift"] !== "object") {
      throw new Error("mainCheckoutDrift must be an object when present.");
    }
    const drift = obj["mainCheckoutDrift"] as Record<string, unknown>;
    if (!Array.isArray(drift["changes"])) {
      throw new Error("mainCheckoutDrift.changes must be an array when present.");
    }
    if (typeof drift["detectedAtStep"] !== "string") {
      throw new Error("mainCheckoutDrift.detectedAtStep must be a string when present.");
    }
    if (typeof drift["ts"] !== "string") {
      throw new Error("mainCheckoutDrift.ts must be a string when present.");
    }
  }

  // Validate issueNumber when present (backward compat: absence is OK)
  if ("issueNumber" in obj && obj["issueNumber"] !== null && obj["issueNumber"] !== undefined) {
    const n = obj["issueNumber"];
    if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
      throw new Error("issueNumber must be a positive integer when present.");
    }
  }

  // Validate reviewers when present (backward compat: absence is OK → treated as [])
  if ("reviewers" in obj && obj["reviewers"] !== null && obj["reviewers"] !== undefined) {
    if (!Array.isArray(obj["reviewers"])) {
      throw new Error("reviewers must be an array when present.");
    }
    for (const r of obj["reviewers"] as unknown[]) {
      if (typeof r !== "object" || r === null) {
        throw new Error("Each entry in reviewers must be an object.");
      }
      const rObj = r as Record<string, unknown>;
      if (typeof rObj["name"] !== "string" || !rObj["name"]) {
        throw new Error("Each reviewer snapshot must have a non-empty string 'name'.");
      }
      if (typeof rObj["maxIterations"] !== "number") {
        throw new Error(`Reviewer snapshot "${rObj["name"]}" must have a numeric 'maxIterations'.`);
      }
      // Backward compat: paths/requestTypes are optional. When present must be arrays.
      if ("paths" in rObj && rObj["paths"] !== null && rObj["paths"] !== undefined) {
        if (!Array.isArray(rObj["paths"])) {
          throw new Error(`Reviewer snapshot "${rObj["name"]}" paths must be an array when present.`);
        }
      }
      if ("requestTypes" in rObj && rObj["requestTypes"] !== null && rObj["requestTypes"] !== undefined) {
        if (!Array.isArray(rObj["requestTypes"])) {
          throw new Error(`Reviewer snapshot "${rObj["name"]}" requestTypes must be an array when present.`);
        }
      }
    }
  }

  // Validate reviewerStatuses when present (backward compat: absence is OK → treated as undefined)
  // Design D1 (reviewer-parallel-execution): lightweight check — array with name + status per entry.
  if ("reviewerStatuses" in obj && obj["reviewerStatuses"] !== null && obj["reviewerStatuses"] !== undefined) {
    if (!Array.isArray(obj["reviewerStatuses"])) {
      throw new Error("reviewerStatuses must be an array when present.");
    }
    const VALID_REVIEWER_STATUSES: Set<string> = new Set(["pending", "approved", "skipped"]);
    for (const rs of obj["reviewerStatuses"] as unknown[]) {
      if (typeof rs !== "object" || rs === null) {
        throw new Error("Each entry in reviewerStatuses must be an object.");
      }
      const rsObj = rs as Record<string, unknown>;
      if (typeof rsObj["name"] !== "string" || !rsObj["name"]) {
        throw new Error("Each reviewerStatus entry must have a non-empty string 'name'.");
      }
      if (typeof rsObj["status"] !== "string" || !VALID_REVIEWER_STATUSES.has(rsObj["status"] as string)) {
        throw new Error(`reviewerStatus "${rsObj["name"]}" has invalid status: ${JSON.stringify(rsObj["status"])}. Must be "pending", "approved", or "skipped".`);
      }
    }
  }

  // Validate biteEvidence when present (backward compat: absence is OK → treated as undefined)
  // Design (bite-evidence-forward R4): lightweight check — array with expected fields per entry.
  if ("biteEvidence" in obj && obj["biteEvidence"] !== null && obj["biteEvidence"] !== undefined) {
    if (!Array.isArray(obj["biteEvidence"])) {
      throw new Error("biteEvidence must be an array when present.");
    }
    const VALID_RESULTS: Set<string> = new Set(["red", "green"]);
    for (const be of obj["biteEvidence"] as unknown[]) {
      if (typeof be !== "object" || be === null) {
        throw new Error("Each entry in biteEvidence must be an object.");
      }
      const beObj = be as Record<string, unknown>;
      if (typeof beObj["testId"] !== "string" || !beObj["testId"]) {
        throw new Error("Each biteEvidence entry must have a non-empty string 'testId'.");
      }
      if (beObj["strategy"] !== "forward") {
        throw new Error(`biteEvidence entry "${beObj["testId"]}" has invalid strategy: ${JSON.stringify(beObj["strategy"])}. Must be "forward".`);
      }
      if (typeof beObj["baseResult"] !== "string" || !VALID_RESULTS.has(beObj["baseResult"] as string)) {
        throw new Error(`biteEvidence entry "${beObj["testId"]}" has invalid baseResult: ${JSON.stringify(beObj["baseResult"])}. Must be "red" or "green".`);
      }
      if (typeof beObj["candidateResult"] !== "string" || !VALID_RESULTS.has(beObj["candidateResult"] as string)) {
        throw new Error(`biteEvidence entry "${beObj["testId"]}" has invalid candidateResult: ${JSON.stringify(beObj["candidateResult"])}. Must be "red" or "green".`);
      }
      if (typeof beObj["verified"] !== "boolean") {
        throw new Error(`biteEvidence entry "${beObj["testId"]}" must have a boolean 'verified' field.`);
      }
      // Optional HEAD-binding fields (assurance-provenance-floor): when present, must be strings.
      // Absent is valid (backward compat with records written before this field existed).
      for (const optField of ["baseRef", "candidateOid", "testHash"] as const) {
        if (optField in beObj && beObj[optField] !== undefined) {
          if (typeof beObj[optField] !== "string") {
            throw new Error(`biteEvidence entry "${beObj["testId"]}" field '${optField}' must be a string when present.`);
          }
        }
      }
    }
  }

  // Validate operatorAdjudications when present (backward compat: absence is OK → empty ledger)
  // Design D4: array of { text, step, recordedAt } records. Non-array or missing required string
  // fields are rejected. Absence is valid (treated as empty ledger).
  if ("operatorAdjudications" in obj && obj["operatorAdjudications"] !== null && obj["operatorAdjudications"] !== undefined) {
    if (!Array.isArray(obj["operatorAdjudications"])) {
      throw new Error("operatorAdjudications must be an array when present.");
    }
    for (const entry of obj["operatorAdjudications"] as unknown[]) {
      if (typeof entry !== "object" || entry === null) {
        throw new Error("Each entry in operatorAdjudications must be an object.");
      }
      const e = entry as Record<string, unknown>;
      if (typeof e["text"] !== "string") {
        throw new Error("Each operatorAdjudications entry must have a string 'text' field.");
      }
      if (typeof e["step"] !== "string") {
        throw new Error("Each operatorAdjudications entry must have a string 'step' field.");
      }
      if (typeof e["recordedAt"] !== "string") {
        throw new Error("Each operatorAdjudications entry must have a string 'recordedAt' field.");
      }
    }
  }

  // Validate touchedFiles when present (backward compat: absence is OK → treated as undefined)
  // Design D2 (touched-files-propagation): lightweight check — non-array object with array values.
  // Fail-open at the element level: entries with non-string elements are dropped (not a crash)
  // because touchedFiles is a hint; a corrupted entry skips injection for that step only.
  if ("touchedFiles" in obj && obj["touchedFiles"] !== null && obj["touchedFiles"] !== undefined) {
    if (typeof obj["touchedFiles"] !== "object" || Array.isArray(obj["touchedFiles"])) {
      throw new Error("touchedFiles must be a non-array object when present.");
    }
    const sanitized: Record<string, string[]> = {};
    for (const [stepName, value] of Object.entries(obj["touchedFiles"] as Record<string, unknown>)) {
      if (!Array.isArray(value)) {
        throw new Error("touchedFiles values must be arrays when present.");
      }
      // Fail-open: drop entries containing non-string elements (corrupt hint → skip injection)
      if (value.every((el) => typeof el === "string")) {
        sanitized[stepName] = value as string[];
      }
    }
    obj["touchedFiles"] = sanitized;
  }

  return raw as JobState;
}

