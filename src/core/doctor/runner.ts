/**
 * Doctor runner: executes checks sequentially and collects results.
 * Design D2: sequential execution for stable output order.
 * Individual check throws are caught and converted to fail results (T-9.2).
 */
import type { DoctorCheck, DoctorContext, DoctorResult } from "./types.js";
export { DOCTOR_CATEGORIES } from "./types.js";

/**
 * Run all checks sequentially against the provided context.
 * Each check's name/category/required are merged into the DoctorResult.
 * If a check throws unexpectedly, it produces a fail result rather than propagating.
 */
export async function runChecks(
  checks: DoctorCheck[],
  ctx: DoctorContext,
): Promise<DoctorResult[]> {
  const results: DoctorResult[] = [];

  for (const check of checks) {
    let partialResult: Omit<DoctorResult, "name" | "category" | "required">;
    try {
      partialResult = await check.check(ctx);
    } catch (err: unknown) {
      // Catch unexpected exceptions and record as fail (TC-055)
      const message =
        err instanceof Error
          ? `Check threw unexpectedly: ${err.message}`
          : `Check threw unexpectedly: ${String(err)}`;
      partialResult = {
        status: "fail",
        message,
      };
    }

    results.push({
      name: check.name,
      category: check.category,
      required: check.required,
      ...partialResult,
    });
  }

  return results;
}
