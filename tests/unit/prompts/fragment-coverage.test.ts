/**
 * Fragment coverage test — locks the required fragment ↔ prompt mapping.
 *
 * If a prompt file omits a fragment from its buildSystemPrompt array,
 * this test fails with a clear message showing which prompt is missing which fragment.
 *
 * NOTE: SPEC_RUNNER_COMMON_CONTEXT, AUTHORITY_SPEC_GUARD, and DELTA_SPEC_FORMAT
 * have been removed from fragments.ts and moved to specrunner/rules.md.
 * Agents now read rules.md via Read tool (identity priming) at runtime.
 */
import { describe, test, expect } from "vitest";
import {
  COMMIT_DISCIPLINE,
  PIPELINE_RULES,
} from "../../../src/prompts/fragments.js";
import { IMPLEMENTER_SYSTEM_PROMPT } from "../../../src/prompts/implementer-system.js";
import { DESIGN_SYSTEM_PROMPT } from "../../../src/prompts/design-system.js";
import { SPEC_FIXER_SYSTEM_PROMPT } from "../../../src/prompts/spec-fixer-system.js";
import { CODE_FIXER_SYSTEM_PROMPT } from "../../../src/prompts/code-fixer-system.js";
import { BUILD_FIXER_SYSTEM_PROMPT } from "../../../src/prompts/build-fixer-system.js";
import { ADR_GEN_SYSTEM_PROMPT } from "../../../src/prompts/adr-gen-system.js";
import { SPEC_REVIEW_SYSTEM_PROMPT } from "../../../src/prompts/spec-review-system.js";
import { CODE_REVIEW_SYSTEM_PROMPT } from "../../../src/prompts/code-review-system.js";
import { TEST_CASE_GEN_SYSTEM_PROMPT } from "../../../src/prompts/test-case-gen-system.js";
import { REQUEST_GENERATE_SYSTEM_PROMPT } from "../../../src/prompts/request-generate-system.js";
import { REQUEST_REVIEW_SYSTEM_PROMPT } from "../../../src/prompts/request-review-system.js";

type FragmentCoverageEntry = [name: string, prompt: string, required: readonly string[]];

const EXPECTED: FragmentCoverageEntry[] = [
  ["IMPLEMENTER",       IMPLEMENTER_SYSTEM_PROMPT,       [COMMIT_DISCIPLINE]],
  ["DESIGN",            DESIGN_SYSTEM_PROMPT,            []],
  ["SPEC_FIXER",        SPEC_FIXER_SYSTEM_PROMPT,        [COMMIT_DISCIPLINE]],
  ["CODE_FIXER",        CODE_FIXER_SYSTEM_PROMPT,        [COMMIT_DISCIPLINE]],
  ["BUILD_FIXER",       BUILD_FIXER_SYSTEM_PROMPT,       [COMMIT_DISCIPLINE]],
  ["ADR_GEN",           ADR_GEN_SYSTEM_PROMPT,           [COMMIT_DISCIPLINE]],
  ["SPEC_REVIEW",       SPEC_REVIEW_SYSTEM_PROMPT,       [PIPELINE_RULES]],
  ["CODE_REVIEW",       CODE_REVIEW_SYSTEM_PROMPT,       [PIPELINE_RULES]],
  ["TEST_CASE_GEN",     TEST_CASE_GEN_SYSTEM_PROMPT,     []],
  ["REQUEST_GENERATE",  REQUEST_GENERATE_SYSTEM_PROMPT,  []],
  ["REQUEST_REVIEW",    REQUEST_REVIEW_SYSTEM_PROMPT,    []],
];

describe("fragment coverage — required fragments are present in each prompt", () => {
  test.each(EXPECTED)("%s contains required fragments", (_name, prompt, required) => {
    for (const frag of required) {
      expect(prompt).toContain(frag);
    }
  });
});
