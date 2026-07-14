/**
 * Config schema and validator for specrunner CLI.
 *
 * Split across:
 *   - schema/types.ts      — config interfaces, type aliases, default constants
 *   - schema/validation.ts — zod structural schema + semantic checks (validateConfig)
 *   - schema/resolution.ts — resolvers that apply defaults to optional sections
 *
 * Validation is a two-layer flow:
 *   1. configSchema.safeParse (zod/v4-mini) — structural type/range/enum checks
 *   2. runSemanticChecks — post-schema checks (model registry, byRequestType semantics)
 */
export * from "./schema/types.js";
export * from "./schema/validation.js";
export * from "./schema/resolution.js";
