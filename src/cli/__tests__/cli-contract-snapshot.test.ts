/**
 * CLI contract test (T-01, T-21).
 *
 * Compares the current COMMANDS tree (normalised with full field coverage) against
 * the base fixture generated from commit 483c75f7.  Any CLI-contract change —
 * new/removed flag, changed type, arg rename, guard toggle, visibility change —
 * will cause this test to fail.  Intentional changes require updating the fixture.
 *
 * Base fixture: src/cli/__tests__/fixtures/cli-contract.base.json
 * Generation procedure (run once to refresh; requires commit 483c75f7 in repo):
 *
 *   git show 483c75f7:src/cli/command-registry.ts > src/cli/command-registry.base.tmp.ts
 *   cat > src/cli/__tests__/dump-base.tmp.ts <<'EOF'
 *   import { COMMANDS } from "../command-registry.base.tmp.js";
 *   import { normalizeCommandsTree } from "./cli-contract-normalize.js";
 *   console.log(JSON.stringify(normalizeCommandsTree(COMMANDS), null, 2));
 *   EOF
 *   bun src/cli/__tests__/dump-base.tmp.ts > src/cli/__tests__/fixtures/cli-contract.base.json
 *   rm src/cli/command-registry.base.tmp.ts src/cli/__tests__/dump-base.tmp.ts
 *
 * The `hasHandler` field captures only boolean presence (handler !== undefined)
 * so moving an inline closure to a named function does NOT fail this test — which
 * is exactly what the R3a (handler-extraction) refactoring verifies.
 */

import { describe, it, expect } from "vitest";
import { COMMANDS } from "../command-registry.js";
import { normalizeCommandsTree } from "./cli-contract-normalize.js";
import baseFixture from "./fixtures/cli-contract.base.json";

// ---------------------------------------------------------------------------
// Contract test
// ---------------------------------------------------------------------------

describe("CLI contract", () => {
  it("COMMANDS tree matches base fixture (483c75f7)", () => {
    const candidate = normalizeCommandsTree(COMMANDS);

    // Sanity: all expected top-level commands are present
    const topLevel = Object.keys(candidate);
    const expected = [
      "init", "login", "credentials", "run", "request", "job",
      "config", "inbox", "rules", "reviewers", "runtime", "doctor", "guide", "usage",
    ];
    for (const cmd of expected) {
      expect(topLevel).toContain(cmd);
    }

    expect(candidate).toEqual(baseFixture);
  });
});
