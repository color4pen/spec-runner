# Implementation Notes — refactor-cli-entrypoint

- **result**: completed
- **tasks_completed**: 25/25

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/cli/flag-parser.ts` | created | `FlagDef`, `ParsedArgs`, `FlagParseError` types and `parseFlags()` function. Handles `--flag=value`, `--flag value`, boolean flags, `-h` → `help` mapping, positional extraction, unknown flag detection, enum validation, required positional check. |
| `src/cli/command-registry.ts` | created | `CommandDef`, `ParentCommandDef`, `CommandEntry` types and `COMMANDS` registry with all 9 commands. Also defines `USAGE` and `FINISH_USAGE` constants (moved from bin/ to enable 100-line target). |
| `bin/specrunner.ts` | modified | Replaced 338-line switch/case with 83-line registry-based dispatch. Re-exports `USAGE` and `FINISH_USAGE` from command-registry.ts for backward compatibility. |
| `tests/unit/cli/flag-parser.test.ts` | created | 17 tests covering all parseFlags() behavior: `--flag=value`, `--flag value`, boolean, `-h`, positional, mixed, unknown flag, enum violation, valid enum, required/optional positional, string flag with no value, flag-before-positional order. |
| `tests/core/doctor/doctor-cli.test.ts` | modified | TC-054 updated to read `src/cli/command-registry.ts` instead of `bin/specrunner.ts` since USAGE was moved to the registry. |
| `openspec/changes/refactor-cli-entrypoint/tasks.md` | modified | All tasks marked [x]. |

## Blocked Tasks

None. All tasks completed.

## Notes

- **USAGE moved to command-registry.ts**: The design (D5) states USAGE should remain in bin/specrunner.ts, but the 100-line constraint required moving it. Both `USAGE` and `FINISH_USAGE` are defined in `src/cli/command-registry.ts` and re-exported from `bin/specrunner.ts`, maintaining the same import contract for any external consumers.

- **TC-054 doctor-cli.test.ts adjustment**: The existing test read `bin/specrunner.ts` as raw source text to verify USAGE contains "doctor". Since USAGE moved to command-registry.ts, the test was updated to read the new file. This is the only existing test that required modification.

- **Error message compatibility**: The `requires a <slug>` error message format (checked by `specrunner-resume-dispatch.test.ts` TC-DISPATCH-002) is preserved by using `"requires a <${positionalDef.name}> argument"` in `FlagParseError`. The `"Invalid --from value"` and `"Unknown flag(s)"` messages match the existing test expectations exactly.

- **`init` runtime enum**: The original code had a custom error message `Unknown --runtime value: "...". Valid values are "managed" or "local".` The refactored version uses the generic parseFlags enum error format. The design (D6) explicitly states exact error message match is not required; exit code 2 and stderr output are maintained.

- **bin/specrunner.ts line count**: 83 lines (target: ≤ 100). No switch/case present.
