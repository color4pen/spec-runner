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
  positional?: string;    // 後方互換: positionals[0]
  positionals: string[];  // 全 non-flag トークン
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
 * 3. `-h` / `--help` (and `--help=...`) → reserved; always sets `help: true` regardless of flagDefs
 * 4. Non-flag tokens → all collected into positionals array; positional = positionals[0]
 * 5. Unknown flag → FlagParseError
 * 6. Enum constraint violation → FlagParseError
 * 7. Required positional missing → FlagParseError (skipped when `flags["help"]` is true)
 * 8. String flag with no following value → FlagParseError
 * 9. count: N → FlagParseError if positionals.length < N
 */
export function parseFlags(
  rawArgs: string[],
  flagDefs: Record<string, FlagDef>,
  positionalDef?: { name: string; required: boolean; count?: number },
): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  let i = 0;

  while (i < rawArgs.length) {
    const arg = rawArgs[i]!;

    // Short aliases: -h → help, -q → quiet, -vv → debug, -v → verbose
    // NOTE: -vv must be checked before -v to avoid prefix collision
    if (arg === "-h") {
      flags["help"] = true;
      i++;
      continue;
    }
    if (arg === "-q") {
      flags["quiet"] = true;
      i++;
      continue;
    }
    if (arg === "-vv") {
      flags["debug"] = true;
      i++;
      continue;
    }
    if (arg === "-v") {
      flags["verbose"] = true;
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

      // Reserved: --help / --help=... → always set flags["help"] = true (never unknown)
      if (flagName === "help") {
        flags["help"] = true;
        i++;
        continue;
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
      // positional: collect all non-flag tokens
      positionals.push(arg);
    }

    i++;
  }

  // required positional check (count-aware); skipped when --help/-h is set
  if (positionalDef?.required && !flags["help"]) {
    const count = positionalDef.count ?? 1;
    if (positionals.length < count) {
      throw new FlagParseError(
        count === 1
          ? `requires a <${positionalDef.name}> argument`
          : `requires <${positionalDef.name}> arguments`,
      );
    }
  }

  return { flags, positional: positionals[0], positionals };
}
