/**
 * Type narrowing for `process.exit` to ensure test mock compatibility.
 *
 * @types/node 20.x expanded the signature to `exit(code?: number | string | null): never`,
 * but test mocks written with explicit `(code?: number)` parameter annotation fail TypeScript's
 * parameter assignability check against the broader signature.
 *
 * This module augments the global `NodeJS.Process` interface so that the narrow overload
 * `exit(code?: number): never` appears in the merged type. Combined with Vitest's spy types
 * and TypeScript's overload resolution for `Parameters<T>`, this enables test mocks typed as
 * `(code?: number) => never` to type-check correctly.
 */
export {};
declare global {
  namespace NodeJS {
    interface Process {
      exit(code?: number | string | null): never;
      exit(code?: number): never;
    }
  }
}
