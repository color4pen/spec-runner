import type { FoldResult } from "./event-journal.js";
import type { StepRun } from "../state/schema.js";
import { validateJobState } from "../state/schema.js";

/**
 * Migrate legacy (pre-split-layout) steps if necessary.
 *
 * Returns `foldResult.steps` unchanged when no migration is needed.
 * Returns validateJobState-normalized steps from stateWithoutJournal when:
 *   - foldResult.stepsTotal === 0 (no step-attempt records in journal), AND
 *   - parsedState has no "_journal" key (pre-split-layout state.json), AND
 *   - stateWithoutJournal.steps is a non-empty object (legacy steps present).
 */
export function migrateSteps(
  foldResult: FoldResult,
  parsedState: Record<string, unknown>,
  stateWithoutJournal: Record<string, unknown>,
): Record<string, StepRun[]> {
  if (foldResult.stepsTotal === 0 && !parsedState["_journal"]) {
    const legacyStepsRaw = stateWithoutJournal["steps"];
    if (
      legacyStepsRaw &&
      typeof legacyStepsRaw === "object" &&
      !Array.isArray(legacyStepsRaw) &&
      Object.keys(legacyStepsRaw as object).length > 0
    ) {
      const legacyValidated = validateJobState({ ...stateWithoutJournal, history: [] });
      return legacyValidated.steps ?? {};
    }
  }
  return foldResult.steps;
}
