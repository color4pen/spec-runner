import { createHash } from "node:crypto";

/**
 * Canonical JSON serialization for deterministic hashing.
 * Sorts object keys recursively. Returns compact JSON (no spaces).
 * Arrays preserve element order.
 */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJson).join(",") + "]";
  }
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce<string[]>((acc, key) => {
      const val = (obj as Record<string, unknown>)[key];
      // Skip undefined values — { a: undefined } and {} must hash identically
      if (val === undefined) return acc;
      acc.push(JSON.stringify(key) + ":" + canonicalJson(val));
      return acc;
    }, [])
    .join(",");
  return "{" + sorted + "}";
}

/**
 * Compute SHA-256 hash of any object via canonical JSON.
 * Returns lowercase hex string prefixed with "sha256:".
 * The returned string is always 64 hex chars after the prefix.
 */
export function hashObject(obj: unknown): string {
  const canonical = canonicalJson(obj);
  return "sha256:" + createHash("sha256").update(canonical).digest("hex");
}
