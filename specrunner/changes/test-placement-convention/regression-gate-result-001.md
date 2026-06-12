# Regression Gate Result — Iteration 1

- **verdict**: needs-fix

## Finding Verification

### [1] union error message にパスプレフィックスが重複する
- **File**: src/config/schema.ts:572
- **Status**: fixed
- **Evidence**: `testPlacementSchema` union error message is `'must have style "sibling" or "mirror" with required fields.'` — no `tests.placement` path prefix.

### [2] configSchema の JSDoc フィールド順コメントが inbox・transientRetry・tests を含まず陳腐化
- **File**: src/config/schema.ts:596
- **Status**: regression
- **severity**: low
- **resolution**: fixable
- **Evidence**: The comment at lines 596–597 still reads `runtime → agents → environment → specReview → pipeline → steps → models → progress → verification → github → logs → archive` and does not include `inbox`, `transientRetry`, or `tests`, which are all present in the actual schema (lines 742, 760, 779). The fix was not applied.

### [3] mirror renderer: sourceRoot≠'src' のとき example と sourceRootNote が整合しない
- **File**: src/prompts/test-placement.ts:32
- **Status**: fixed
- **Evidence**: `exampleSource` is now `sourceRoot ? \`${sourceRoot}/foo/bar.ts\` : "src/foo/bar.ts"` so the example path always starts with the configured `sourceRoot`. The strip logic at line 35 (`exampleSource.startsWith(\`${sourceRoot}/\`)`) is guaranteed to match, and `sourceRootNote` at line 47 echoes the same `sourceRoot` value — consistent for any non-`src` value.
