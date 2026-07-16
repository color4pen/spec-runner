/**
 * Shim: re-exports canonicalJson and hashObject from src/util/hash.ts (leaf layer).
 * The implementations were moved there so that src/state/ (shared-kernel) can also import
 * these helpers without creating a shared-kernel→domain dependency.
 *
 * Existing importers (e.g. src/core/agent/registry.ts) continue to resolve without change.
 */
export { canonicalJson, hashObject } from "../../util/hash.js";
