/**
 * Unit tests for canonicalJson and hashObject.
 * TC-NEW-hash-001: { a: undefined } and {} produce the same hash.
 * TC-NEW-hash-002: defined values still hash correctly.
 * TC-NEW-hash-003: hashObject is deterministic and key-sorted.
 */
import { describe, it, expect } from "vitest";
import { canonicalJson, hashObject } from "../../../src/core/agent/hash.js";

// TC-NEW-hash-001: undefined values are skipped
describe("canonicalJson: { a: undefined } and {} hash identically", () => {
  it("returns same hash for object with undefined value and empty object", () => {
    const hash1 = hashObject({ a: undefined });
    const hash2 = hashObject({});
    expect(hash1).toBe(hash2);
  });

  it("canonicalJson({ a: undefined }) equals canonicalJson({})", () => {
    expect(canonicalJson({ a: undefined })).toBe(canonicalJson({}));
  });
});

// TC-NEW-hash-002: defined values are still serialized correctly
describe("canonicalJson: defined values are preserved", () => {
  it("serializes { a: 1, b: 2 } correctly", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it("keys are sorted", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("mixes undefined and defined: { a: 1, b: undefined, c: 3 } == { a: 1, c: 3 }", () => {
    const hash1 = hashObject({ a: 1, b: undefined, c: 3 });
    const hash2 = hashObject({ a: 1, c: 3 });
    expect(hash1).toBe(hash2);
  });
});

// TC-NEW-hash-003: hashObject produces sha256: prefix and 64-char hex
describe("hashObject: prefix and format", () => {
  it("returns string starting with sha256:", () => {
    const h = hashObject({ foo: "bar" });
    expect(h.startsWith("sha256:")).toBe(true);
  });

  it("hex part is exactly 64 characters", () => {
    const h = hashObject({ foo: "bar" });
    const hexPart = h.slice("sha256:".length);
    expect(hexPart).toHaveLength(64);
    expect(hexPart).toMatch(/^[a-f0-9]+$/);
  });

  it("is deterministic — same input produces same hash", () => {
    const h1 = hashObject({ x: 1, y: "hello" });
    const h2 = hashObject({ x: 1, y: "hello" });
    expect(h1).toBe(h2);
  });

  it("changes on any field value change", () => {
    const h1 = hashObject({ x: 1 });
    const h2 = hashObject({ x: 2 });
    expect(h1).not.toBe(h2);
  });
});
