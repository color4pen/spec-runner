import type { DeltaSpecValidatorFs } from "../../../../../src/core/spec/delta-spec-validator.js";

/** Build a mock DeltaSpecValidatorFs from a map of path → content. */
export function makeFsMock(files: Record<string, string>): DeltaSpecValidatorFs {
  return {
    readdir: async (p: string) => {
      const prefix = p.endsWith("/") ? p : p + "/";
      const seen = new Set<string>();
      for (const filePath of Object.keys(files)) {
        if (filePath.startsWith(prefix)) {
          const rest = filePath.slice(prefix.length);
          const parts = rest.split("/");
          if (parts.length > 0 && parts[0]) {
            seen.add(parts[0]);
          }
        }
      }
      if (seen.size === 0) {
        throw new Error(`ENOENT: no such directory: ${p}`);
      }
      return [...seen];
    },
    readFile: async (p: string) => {
      if (p in files) return files[p]!;
      throw new Error(`ENOENT: no such file: ${p}`);
    },
  };
}

export const CHANGE_PATH = "/work/specrunner/changes/my-change";

export function validSpecContent(capability: string = "my-capability"): string {
  return `# ${capability} Spec

## ADDED Requirements

### Requirement: The system SHALL do something

The system SHALL support the feature.
`;
}
