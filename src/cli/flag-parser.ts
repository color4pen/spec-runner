/**
 * Lightweight flag parser for the specrunner CLI.
 * No external dependencies.
 */

export interface FlagDef {
  type: "boolean" | "string";
  values?: readonly string[]; // enum constraint for string flags
}

export interface ParsedArgs {
  flags: Record<string, string | boolean>;
  positional?: string;
}

export class FlagParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlagParseError";
  }
}

/**
 * Parse raw CLI arguments into flags and an optional positional argument.
 *
 * Rules:
 * 1. `--flag=value` → string flag stores value; boolean flag ignores value part
 * 2. `--flag` (no `=`) → boolean flag sets true; string flag consumes next arg
 * 3. `-h` → maps to `help: true`
 * 4. Non-flag tokens → first one becomes positional
 * 5. Unknown flag → FlagParseError
 * 6. Enum constraint violation → FlagParseError
 * 7. Required positional missing → FlagParseError
 * 8. String flag with no following value → FlagParseError
 */
export function parseFlags(
  rawArgs: string[],
  flagDefs: Record<string, FlagDef>,
  positionalDef?: { name: string; required: boolean },
): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  let positional: string | undefined;
  let i = 0;

  while (i < rawArgs.length) {
    const arg = rawArgs[i]!;

    // Short alias: -h → help: true
    if (arg === "-h") {
      flags["help"] = true;
      i++;
      continue;
    }

    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      let flagName: string;
      let valueAfterEq: string | undefined;

      if (eqIdx !== -1) {
        flagName = arg.slice(2, eqIdx);
        valueAfterEq = arg.slice(eqIdx + 1);
      } else {
        flagName = arg.slice(2);
      }

      const def = flagDefs[flagName];
      if (!def) {
        throw new FlagParseError(`Unknown flag(s): --${flagName}`);
      }

      if (def.type === "boolean") {
        flags[flagName] = true;
        // ignore valueAfterEq for boolean flags
      } else {
        // string flag
        let value: string;
        if (valueAfterEq !== undefined) {
          value = valueAfterEq;
        } else {
          // consume next arg
          i++;
          if (i >= rawArgs.length || rawArgs[i]!.startsWith("--")) {
            throw new FlagParseError(
              `Flag --${flagName} requires a value but none was provided`,
            );
          }
          value = rawArgs[i]!;
        }

        // enum validation
        if (def.values && !def.values.includes(value)) {
          throw new FlagParseError(
            `Invalid --${flagName} value: "${value}". Valid values are: ${def.values.join(", ")}.`,
          );
        }

        flags[flagName] = value;
      }
    } else {
      // positional: take only the first one
      if (positional === undefined) {
        positional = arg;
      }
    }

    i++;
  }

  // required positional check
  if (positionalDef?.required && positional === undefined) {
    throw new FlagParseError(
      `requires a <${positionalDef.name}> argument`,
    );
  }

  return { flags, positional };
}
