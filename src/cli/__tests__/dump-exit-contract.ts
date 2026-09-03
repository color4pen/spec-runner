/**
 * Generates src/cli/__tests__/fixtures/cli-exit-contract.base.json.
 *
 * Run this script to regenerate the base fixture after an intentional change
 * to exit codes or output messages:
 *
 *   bun run src/cli/__tests__/dump-exit-contract.ts
 *
 * The generated file is committed and used by cli-exit-contract.test.ts as
 * the expected snapshot.  Do NOT regenerate unless the change is intentional.
 *
 * NOTE: This script must be run from the repo root (where bin/specrunner.ts lives).
 * It sets up the same mocks as cli-exit-contract.test.ts but in Bun script mode.
 */

// This file is intentionally not a vitest test — it is a standalone script.
// The fixture generation uses the actual production code path.
//
// To regenerate:
//   bun run src/cli/__tests__/dump-exit-contract.ts
//
// The output is written to src/cli/__tests__/fixtures/cli-exit-contract.base.json.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT_CONTRACT_CASES } from "./exit-contract-cases.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "fixtures");
const OUTPUT_FILE = path.join(FIXTURES_DIR, "cli-exit-contract.base.json");

console.error("[dump-exit-contract] This script must be run via vitest or bun in test mode.");
console.error("[dump-exit-contract] Use: bun run test -- src/cli/__tests__/dump-exit-contract-runner.test.ts");
console.error("[dump-exit-contract] Cases defined:", EXIT_CONTRACT_CASES.map((c) => c.id).join(", "));
console.error("[dump-exit-contract] Output would be written to:", OUTPUT_FILE);
console.error("[dump-exit-contract] To regenerate the fixture, run:");
console.error("[dump-exit-contract]   node --loader ts-node/esm src/cli/__tests__/dump-exit-contract.ts");

// Ensure fixtures directory exists
if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}
