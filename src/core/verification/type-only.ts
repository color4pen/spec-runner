/**
 * Type-only source detector.
 *
 * Pure lexical analysis — no AST, no external dependencies (not even node:*).
 *
 * Returns true if and only if the given TypeScript source contains ONLY
 * type-level constructs that produce no runtime code.
 *
 * Conservative (safe against false positives): unknown constructs → false.
 * False negatives (type-only source classified as runtime) are acceptable —
 * the caller falls through to the existing fail-closed not-loaded behavior.
 *
 * Safety invariant: runtime statements always begin with a non-allowed leader
 * token at depth-0. consume-to-end terminates at depth-0 statement boundaries
 * (semicolon / closing-block / ASI) before re-classifying the next leader token.
 * This ensures runtime statements can never be absorbed into an allowed statement.
 * This invariant holds when the input is valid TypeScript (typecheck has passed).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Tokens that, when appearing at depth-0 after a block closes or after a
 * depth-0 newline, indicate the preceding statement continues (not a new
 * statement leader).
 */
const TYPE_CONTINUATION_TOKENS = new Set<string>([
  "|", "&", "?", ":", ".", ",", "<", ">", "(", "[", ")", "]", "=>",
  "extends", "keyof", "typeof", "infer", "readonly", "in", "as", "is",
  "asserts", "from", "...",
]);

// ---------------------------------------------------------------------------
// Phase 1: Strip comments and neutralize string literals
// ---------------------------------------------------------------------------

/**
 * Remove line and block comments from source, replacing with whitespace
 * (preserving newlines for ASI detection). Neutralize string literal content
 * by replacing with spaces.
 *
 * Returns null if:
 * - A template literal (backtick) is encountered → false signal.
 * - An unterminated block comment is encountered → false signal.
 */
function stripCommentsAndStrings(source: string): string | null {
  const n = source.length;
  let result = "";
  let i = 0;

  while (i < n) {
    const ch = source[i]!;

    // Line comment: // ... (ends at newline; newline is preserved)
    if (ch === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") {
        result += " ";
        i++;
      }
      // The newline itself is added in the next iteration.
      continue;
    }

    // Block comment: /* ... */
    if (ch === "/" && source[i + 1] === "*") {
      result += "  "; // replace /*
      i += 2;
      let closed = false;
      while (i < n) {
        if (source[i] === "*" && source[i + 1] === "/") {
          result += "  "; // replace */
          i += 2;
          closed = true;
          break;
        }
        // Preserve newlines within block comments for line tracking.
        result += source[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (!closed) return null; // unterminated block comment → false
      continue;
    }

    // Template literal: immediately signal false (forbidden construct).
    if (ch === "`") return null;

    // Single or double quoted string: neutralize content with spaces.
    if (ch === '"' || ch === "'") {
      const quote = ch;
      result += " "; // replace opening quote
      i++;
      while (i < n) {
        const sc = source[i]!;
        if (sc === "\\") {
          // Escape sequence: skip backslash and the escaped character.
          result += "  ";
          i += 2;
          continue;
        }
        if (sc === quote) {
          result += " "; // replace closing quote
          i++;
          break;
        }
        if (sc === "\n") {
          // Unterminated string (line continuation via \ is handled above).
          result += "\n";
          i++;
          break;
        }
        result += " ";
        i++;
      }
      continue;
    }

    result += ch;
    i++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Phase 2: Tokenize the stripped source
// ---------------------------------------------------------------------------

/**
 * Extract tokens from the comment/string-stripped source.
 *
 * - Horizontal whitespace is skipped.
 * - Newlines become "\n" tokens (needed for ASI detection).
 * - Word sequences ([A-Za-z_$][\w$]*) become keyword/identifier tokens.
 * - Numeric literals become the placeholder "#NUM".
 * - Two-char operator "=>" and three-char "..." are combined.
 * - Unknown characters become "??" (causes analyzeStatements to return false).
 */
function tokenize(source: string): string[] {
  const tokens: string[] = [];
  const n = source.length;
  let i = 0;

  while (i < n) {
    const ch = source[i]!;

    // Skip horizontal whitespace.
    if (ch === " " || ch === "\t" || ch === "\r") {
      i++;
      continue;
    }

    // Preserve newlines as tokens for ASI detection.
    if (ch === "\n") {
      tokens.push("\n");
      i++;
      continue;
    }

    // Two-char: => (arrow function / mapped type)
    if (ch === "=" && source[i + 1] === ">") {
      tokens.push("=>");
      i += 2;
      continue;
    }

    // Three-char: ... (rest/spread)
    if (ch === "." && source[i + 1] === "." && source[i + 2] === ".") {
      tokens.push("...");
      i += 3;
      continue;
    }

    // Word tokens: keywords and identifiers.
    if ((ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_" || ch === "$") {
      let word = "";
      while (i < n) {
        const wc = source[i]!;
        if (
          (wc >= "A" && wc <= "Z") ||
          (wc >= "a" && wc <= "z") ||
          (wc >= "0" && wc <= "9") ||
          wc === "_" ||
          wc === "$"
        ) {
          word += wc;
          i++;
        } else {
          break;
        }
      }
      tokens.push(word);
      continue;
    }

    // Numeric literals (actual value is irrelevant; produce placeholder).
    if (ch >= "0" && ch <= "9") {
      while (i < n) {
        const nc = source[i]!;
        if ((nc >= "0" && nc <= "9") || (nc >= "a" && nc <= "z") || (nc >= "A" && nc <= "Z") || nc === "." || nc === "_") {
          i++;
        } else {
          break;
        }
      }
      tokens.push("#NUM");
      continue;
    }

    // Known single-char punctuation/operators.
    if ("{}()[];,.<>?:*=|&!+-~^".includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }

    // Slash: after comment stripping, remaining / is division or regex → runtime.
    if (ch === "/") {
      tokens.push("/");
      i++;
      continue;
    }

    // At-sign: decorator → runtime.
    if (ch === "@") {
      tokens.push("@");
      i++;
      continue;
    }

    // Unknown character → will cause analyzeStatements to return false.
    tokens.push("??");
    i++;
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Phase 3: Analyze top-level statements
// ---------------------------------------------------------------------------

/**
 * Walk the token stream and verify every top-level statement is in the
 * allowed (type-only) set. Returns false immediately on encountering a
 * runtime construct.
 */
function analyzeStatements(tokens: string[]): boolean {
  const n = tokens.length;
  let i = 0;

  /** Skip consecutive newline tokens. */
  function skipNewlines(): void {
    while (i < n && tokens[i] === "\n") i++;
  }

  /**
   * Consume the remainder of an allowed statement.
   *
   * Called after the statement leader (and sometimes the keyword immediately
   * following it) has already been consumed. Tracks nesting depth and returns
   * when the statement boundary is reached.
   *
   * Returns true if consumed successfully (no forbidden tokens encountered).
   * Returns false if a forbidden token (@, /, ??) is found.
   *
   * Safety invariant: depth returns to 0 only after a matching closing bracket.
   * At that point, the next non-newline token is checked against
   * TYPE_CONTINUATION_TOKENS. If it is not a continuation, the statement ends
   * and the next token is left for the main loop to re-classify as a leader.
   * This prevents any runtime statement from being silently absorbed.
   */
  function consumeAllowedRest(): boolean {
    let depth = 0; // nesting depth within this statement

    while (i < n) {
      const tok = tokens[i]!;

      // Semicolon at depth 0 terminates the statement.
      if (tok === ";" && depth === 0) {
        i++;
        return true;
      }

      // Opening brackets increase depth.
      if (tok === "{" || tok === "(" || tok === "[") {
        depth++;
        i++;
        continue;
      }

      // Closing brackets decrease depth.
      if (tok === "}" || tok === ")" || tok === "]") {
        if (depth === 0) {
          // Closing bracket belongs to an outer context — stop consuming.
          return true;
        }
        depth--;
        i++;
        if (depth === 0) {
          // Just closed a block at the statement level. Check whether the
          // next non-newline token is a type continuation (e.g., from, &, |,
          // extends). If not, the statement ends here.
          let j = i;
          while (j < n && tokens[j] === "\n") j++;
          const next = tokens[j];
          if (next === undefined || !TYPE_CONTINUATION_TOKENS.has(next)) {
            return true;
          }
          // Continuation: keep consuming (e.g., `export type { A } from "..."`)
        }
        continue;
      }

      // Newline at depth 0: check for ASI.
      if (tok === "\n" && depth === 0) {
        i++;
        // Skip further consecutive newlines.
        while (i < n && tokens[i] === "\n") i++;
        const next = tokens[i];
        if (next === undefined || !TYPE_CONTINUATION_TOKENS.has(next)) {
          // ASI: statement ends here. Do NOT consume `next` — leave it for
          // the main loop to re-classify as a statement leader.
          return true;
        }
        // Continuation token (e.g., `|` in a multiline union type): keep going.
        continue;
      }

      // Forbidden tokens in any context signal runtime code.
      if (tok === "@" || tok === "/" || tok === "??") {
        return false;
      }

      // All other tokens (identifiers, keywords, operators, #NUM): consume.
      i++;
    }

    // EOF reached: statement completed without forbidden tokens.
    return true;
  }

  // -------------------------------------------------------------------------
  // Main statement loop: classify each depth-0 statement leader.
  // -------------------------------------------------------------------------
  while (i < n) {
    skipNewlines();
    if (i >= n) break;

    const tok = tokens[i]!;

    // Empty statement (standalone semicolon).
    if (tok === ";") {
      i++;
      continue;
    }

    // Immediately forbidden tokens.
    if (tok === "@" || tok === "/" || tok === "??") return false;

    // -----------------------------------------------------------------------
    // `import` statement
    // -----------------------------------------------------------------------
    if (tok === "import") {
      i++;
      skipNewlines();
      if (tokens[i] === "type") {
        // `import type ...` → allowed.
        i++; // consume "type"
        if (!consumeAllowedRest()) return false;
        continue;
      }
      // Value import (`import { a }`) or side-effect import (`import "./a"`)
      // → runtime.
      return false;
    }

    // -----------------------------------------------------------------------
    // `export` statement
    // -----------------------------------------------------------------------
    if (tok === "export") {
      i++;
      skipNewlines();
      const next = tokens[i];

      if (next === "type") {
        // `export type ...` (alias or re-export) → allowed.
        i++; // consume "type"
        if (!consumeAllowedRest()) return false;
        continue;
      }

      if (next === "interface" || next === "declare") {
        // `export interface ...` or `export declare ...` → allowed.
        i++; // consume "interface" or "declare"
        if (!consumeAllowedRest()) return false;
        continue;
      }

      if (next === "{") {
        // `export {}` (empty module marker) → allowed.
        // `export { non-empty }` → runtime (value export).
        i++; // consume "{"
        skipNewlines();
        if (tokens[i] === "}") {
          i++; // consume "}"
          skipNewlines();
          if (tokens[i] === ";") i++; // optional semicolon
          continue;
        }
        return false; // non-empty export block → runtime
      }

      // export *, export default, export const/let/var/function/class/enum
      // → runtime.
      return false;
    }

    // -----------------------------------------------------------------------
    // `interface`, `type`, `declare` (standalone declarations)
    // -----------------------------------------------------------------------
    if (tok === "interface" || tok === "type" || tok === "declare") {
      i++;
      if (!consumeAllowedRest()) return false;
      continue;
    }

    // -----------------------------------------------------------------------
    // Anything else at depth-0 is a runtime statement.
    // -----------------------------------------------------------------------
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the given TypeScript source file contains ONLY type-level
 * constructs (no runtime code emission).
 *
 * Allowed constructs (exhaustive whitelist):
 * - Empty file / whitespace / comments only
 * - `import type ...`
 * - `export type ...` (alias or re-export)
 * - `export interface ...`
 * - `export declare ...`
 * - `interface ...`
 * - `type ...`
 * - `declare ...`
 * - `export {}` (empty module marker)
 * - Standalone semicolons (empty statements)
 *
 * Any construct not in the above list (enum, const enum, class, function
 * declaration, value import, value export, expression statement, template
 * literal, decorator, etc.) causes false to be returned.
 *
 * @param source - Full text of a TypeScript source file.
 * @returns true iff the file is type-only (produces no runtime code).
 */
export function isTypeOnlySource(source: string): boolean {
  // Phase 1: Strip comments and neutralize string literals.
  // Returns null on template literal or unterminated block comment.
  const stripped = stripCommentsAndStrings(source);
  if (stripped === null) return false;

  // Phase 2: Tokenize the stripped source.
  const tokens = tokenize(stripped);

  // Phase 3: Analyze top-level statements.
  return analyzeStatements(tokens);
}
