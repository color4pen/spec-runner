import type { TestPlacement } from "../config/schema.js";
import { DEFAULT_TEST_SUFFIX } from "../config/schema.js";

/**
 * Render a deterministic test file placement instruction section for the implementer user message.
 *
 * Returns a `## Test File Placement` markdown section derived solely from the `placement` config
 * value. The same config always produces the same instruction string (pure function, no I/O).
 *
 * The section explicitly states that this directive takes precedence over the default
 * "follow the existing test placement pattern" guidance in the implementer system prompt.
 */
export function renderTestPlacementInstruction(placement: TestPlacement): string {
  const suffix = placement.suffix ?? DEFAULT_TEST_SUFFIX;

  if (placement.style === "sibling") {
    return `## Test File Placement

**This directive overrides the default "follow the existing test placement pattern" guidance.**

Place each test file in the **same directory** as the source file under test, using the suffix \`${suffix}\`.

Example:
- Source: \`src/foo/bar.ts\`
- Test:   \`src/foo/bar${suffix}\``;
  }

  // mirror style
  const { testsRoot, sourceRoot } = placement;

  const exampleSource = "src/foo/bar.ts";
  let exampleTest: string;
  if (sourceRoot) {
    // Strip sourceRoot prefix then place under testsRoot
    const stripped = exampleSource.startsWith(`${sourceRoot}/`)
      ? exampleSource.slice(sourceRoot.length + 1)
      : exampleSource;
    const baseName = stripped.replace(/\.[^.]+$/, "");
    exampleTest = `${testsRoot}/${baseName}${suffix}`;
  } else {
    // No sourceRoot: keep full source path under testsRoot
    const baseName = exampleSource.replace(/\.[^.]+$/, "");
    exampleTest = `${testsRoot}/${baseName}${suffix}`;
  }

  const sourceRootNote = sourceRoot
    ? `\`${sourceRoot}/\` prefix is stripped before mirroring.`
    : `No \`sourceRoot\` is configured; the full source path is preserved under \`${testsRoot}/\`.`;

  return `## Test File Placement

**This directive overrides the default "follow the existing test placement pattern" guidance.**

Place each test file under \`${testsRoot}/\`, mirroring the source tree structure. ${sourceRootNote}

Example:
- Source: \`${exampleSource}\`
- Test:   \`${exampleTest}\``;
}
