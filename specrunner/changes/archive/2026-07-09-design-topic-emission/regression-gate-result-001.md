# Regression Gate Result — design-topic-emission — iteration 001

- **verdict**: needs-fix
- **iteration**: 001

## Summary

All three items in the findings ledger are **not present** in the current code.
The code review (`review-feedback-001.md`) marked all three as `Fix: no` with verdict `approved`,
so the code-fixer was never instructed to add these tests. The ledger appears to have been
populated from non-blocking (`Fix: no`) review findings, creating an inconsistency between
the ledger claim ("fixed during this job") and the actual code state.

## Findings

| # | Severity | Resolution | File | Description |
|---|----------|------------|------|-------------|
| 1 | low | fixable | tests/unit/config/design-layer-config.test.ts | TC-016: `resolveDesignLayerConfig` with explicit `topicEmission: false` input → `false` output is not tested. Existing tests only cover the `topicEmission: true` default (TC-DL-CONFIG-004 line 83 and TC-DL-CONFIG-005 line 104). The `!== false` guard in the resolver is correct but lacks regression coverage. |
| 2 | low | fixable | src/core/archive/__tests__/merge-then-archive.test.ts | TC-017: `topicEmission` does not appear anywhere in this test file. No test verifies that the `--with-merge` path propagates `designLayer` to `runArchiveOrchestrator` such that topic emission fires. Current tests mock `runArchiveOrchestrator` but do not assert topic-emission-related behaviour. |
| 3 | low | fixable | tests/unit/config/design-layer-config.test.ts | TC-019: No test for `designLayer.topicEmission` receiving a non-boolean value (e.g. `"yes"` or `1`). TC-DL-CONFIG-002 and TC-DL-CONFIG-003 cover `enabled` and `command` with the same pattern, but `topicEmission` is absent. The schema has `optional(boolean(...))` and is correct; the test coverage gap remains. |

## Detail

### TC-016 — NOT FIXED

`tests/unit/config/design-layer-config.test.ts` contains `topicEmission` at lines 76, 83, 104, all expecting `true` (default). There is no `it(...)` block exercising an input of `{ designLayer: { topicEmission: false } }` and asserting the resolver returns `topicEmission: false`.

### TC-017 — NOT FIXED

`src/core/archive/__tests__/merge-then-archive.test.ts` (403 lines): no occurrence of `topicEmission`, `emitDesignTopics`, or any assertion about design-topic emission. The tests mock `runArchiveOrchestrator` as a black box and verify exit codes / cleanup / integrity-check wiring — they do not verify `designLayer` propagation for topic emission purposes.

### TC-019 — NOT FIXED

`tests/unit/config/design-layer-config.test.ts` has no describe block or `it(...)` for `topicEmission` with a non-boolean input. Searching for `TC-019`, `topicEmission.*"yes"`, `topicEmission.*42` yields no matches.

## Context: ledger vs. review contradiction

The code review (`review-feedback-001.md`) verdict was `approved` and all three findings carried `Fix: no`, meaning the code-fixer step was explicitly told not to address them. The regression gate ledger nevertheless lists them as "fixed during this job," which is factually incorrect — they were approved as non-blocking gaps, not implemented.

Recommended resolution: either add the three test cases (fixable) or, if the human confirms the code review approval stands, mark these findings as `skip` and reissue the regression gate with an empty ledger.
