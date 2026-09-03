/**
 * CLI contract normalization helper (T-21).
 *
 * Converts a CommandSpec tree into a stable JSON-serializable form for
 * comparison with the base fixture (src/cli/__tests__/fixtures/cli-contract.base.json).
 *
 * Normalizes all fields that constitute the CLI contract:
 *   - path, summary, visibility, aliasOf, requiresRepo, worktreeGuard
 *   - args: name, required, count
 *   - flags: type, min, values, deprecated (key-sorted)
 *   - help: group, summary, detail
 *   - hasHandler: handler !== undefined
 *   - children: key-sorted, recursive
 *
 * Excluded: handler identity (the function reference itself) — we only
 * capture presence (hasHandler), so renaming a function does not break the
 * fixture.
 */

import type { CommandSpec } from "../command-registry.js";

// ---------------------------------------------------------------------------
// Normalised types
// ---------------------------------------------------------------------------

export interface NormalisedFlag {
  type: string;
  min?: number;
  values?: readonly string[];
  deprecated?: { message: string };
}

export interface NormalisedArg {
  name: string;
  required: boolean;
  count?: number;
}

export interface NormalisedHelp {
  group?: string;
  summary?: string;
  detail?: string;
}

export interface NormalisedSpec {
  path: string[];
  summary: string;
  visibility?: string;
  aliasOf?: string[];
  requiresRepo?: boolean;
  worktreeGuard?: boolean;
  args: NormalisedArg[];
  flags: Record<string, NormalisedFlag>;
  help: NormalisedHelp;
  hasHandler: boolean;
  children: Record<string, NormalisedSpec>;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

function normaliseFlag(def: {
  type: string;
  min?: number;
  values?: readonly string[];
  deprecated?: { message: string | ((v: string | undefined) => string) };
}): NormalisedFlag {
  const out: NormalisedFlag = { type: def.type };
  if (def.min !== undefined) out.min = def.min;
  if (def.values !== undefined) out.values = def.values;
  if (def.deprecated !== undefined) {
    out.deprecated = {
      message: typeof def.deprecated.message === "function" ? "<function>" : def.deprecated.message,
    };
  }
  return out;
}

function normaliseSpec(spec: CommandSpec): NormalisedSpec {
  // Flags: sort by key for stable output
  const flagEntries = Object.entries(spec.flags ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const flags = Object.fromEntries(flagEntries.map(([k, v]) => [k, normaliseFlag(v)]));

  // Args: preserve order (positional order matters)
  const args: NormalisedArg[] = (spec.args ?? []).map((a) => {
    const out: NormalisedArg = { name: a.name, required: a.required };
    if (a.count !== undefined) out.count = a.count;
    return out;
  });

  // Help: all three optional fields
  const help: NormalisedHelp = {};
  if (spec.help?.group !== undefined) help.group = spec.help.group;
  if (spec.help?.summary !== undefined) help.summary = spec.help.summary;
  if (spec.help?.detail !== undefined) help.detail = spec.help.detail;

  // Children: sort by key for stable output
  const children: Record<string, NormalisedSpec> = {};
  for (const key of Object.keys(spec.children ?? {}).sort()) {
    children[key] = normaliseSpec(spec.children![key]!);
  }

  const out: NormalisedSpec = {
    path: spec.path,
    summary: spec.summary,
    args,
    flags,
    help,
    hasHandler: spec.handler !== undefined,
    children,
  };

  // Optional fields — only include when defined (to keep JSON compact)
  if (spec.visibility !== undefined) out.visibility = spec.visibility;
  if (spec.aliasOf !== undefined) out.aliasOf = spec.aliasOf;
  if (spec.requiresRepo !== undefined) out.requiresRepo = spec.requiresRepo;
  if (spec.worktreeGuard !== undefined) out.worktreeGuard = spec.worktreeGuard;

  return out;
}

/**
 * Normalize the full COMMANDS tree into a stable JSON-serializable form.
 * Top-level keys are sorted for stable output.
 */
export function normalizeCommandsTree(
  commands: Record<string, CommandSpec>,
): Record<string, NormalisedSpec> {
  return Object.fromEntries(
    Object.keys(commands)
      .sort()
      .map((key) => [key, normaliseSpec(commands[key]!)]),
  );
}
