/**
 * Unit tests for src/core/verification/type-only.ts
 *
 * TC-001: 型のみの構文は true
 * TC-002: runtime 構文を 1 つでも含むと false
 * TC-003: 型宣言と式文が混在すると false（偽陽性の排除）
 * TC-009: 空ファイル・空白のみ・コメントのみは true
 * TC-018: typecheck が green（isTypeOnlySource の型整合性）
 *
 * These tests are RED until src/core/verification/type-only.ts is created by the implementer.
 */
import { describe, it, expect } from "vitest";
import { isTypeOnlySource } from "../../../../src/core/verification/type-only.js";

// ---------------------------------------------------------------------------
// TC-001: 型のみの構文は true
// Source: spec.md > Requirement: type-only 判定は許可構文の閉集合で行う
//         > Scenario: 型のみの構文は true
// ---------------------------------------------------------------------------
describe("TC-001: 型のみの構文は true", () => {
  it("line comment only", () => {
    expect(isTypeOnlySource("// just a comment")).toBe(true);
  });

  it("block comment only", () => {
    expect(isTypeOnlySource("/* block comment */")).toBe(true);
  });

  it("JSDoc comment only", () => {
    expect(isTypeOnlySource("/** @fileoverview This is a description */")).toBe(true);
  });

  it("import type named", () => {
    expect(isTypeOnlySource('import type { A } from "./a";')).toBe(true);
  });

  it("export type re-export (export type { A } from ...)", () => {
    expect(isTypeOnlySource('export type { A } from "./a";')).toBe(true);
  });

  it("export type alias (export type B = ...)", () => {
    expect(isTypeOnlySource("export type B = A | C;")).toBe(true);
  });

  it("export type union multiline", () => {
    const src = "export type B =\n  | A\n  | C;";
    expect(isTypeOnlySource(src)).toBe(true);
  });

  it("interface declaration", () => {
    expect(isTypeOnlySource("interface I { x: number; y?: string }")).toBe(true);
  });

  it("exported interface declaration", () => {
    expect(isTypeOnlySource("export interface I { x: number }")).toBe(true);
  });

  it("declare const", () => {
    expect(isTypeOnlySource("declare const k: number;")).toBe(true);
  });

  it("empty export {}", () => {
    expect(isTypeOnlySource("export {};")).toBe(true);
  });

  it("type alias without export", () => {
    expect(isTypeOnlySource("type X = string | number;")).toBe(true);
  });

  it("interface without export", () => {
    expect(isTypeOnlySource("interface Foo { bar: () => void }")).toBe(true);
  });

  it("combination: comment + import type + export type + interface + declare + export {}", () => {
    const src = [
      "// comment",
      'import type { A } from "./a";',
      "export type B = A | C;",
      "interface I { x: number; y?: string }",
      "declare const k: number;",
      "export {};",
    ].join("\n");
    expect(isTypeOnlySource(src)).toBe(true);
  });

  it("multiline export type union (#884 pattern: SnapshotStatus)", () => {
    const src = [
      "/** Snapshot status */",
      "export type SnapshotStatus =",
      '  | "pending"',
      '  | "resolved"',
      '  | "wontfix";',
    ].join("\n");
    expect(isTypeOnlySource(src)).toBe(true);
  });

  it("interface with JSDoc (#884 pattern: reviewer-snapshot.ts)", () => {
    const src = [
      "/**",
      " * Snapshot of reviewer findings.",
      " * @since 2024-01-01",
      " */",
      "export interface ReviewerSnapshot {",
      "  id: string;",
      "  findings: ReadonlyArray<{ file: string; line: number; message: string }>;",
      "}",
    ].join("\n");
    expect(isTypeOnlySource(src)).toBe(true);
  });

  it("declare function (ambient declaration)", () => {
    expect(isTypeOnlySource("declare function f(x: number): void;")).toBe(true);
  });

  it("declare module (ambient module)", () => {
    const src = "declare module './foo' { export type X = string; }";
    expect(isTypeOnlySource(src)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-002: runtime 構文を 1 つでも含むと false
// Source: spec.md > Requirement: type-only 判定は許可構文の閉集合で行う
//         > Scenario: runtime 構文を 1 つでも含むと false
// ---------------------------------------------------------------------------
describe("TC-002: runtime 構文を 1 つでも含むと false", () => {
  it("enum", () => {
    expect(isTypeOnlySource("enum E { A, B }")).toBe(false);
  });

  it("const enum", () => {
    expect(isTypeOnlySource("const enum CE { A }")).toBe(false);
  });

  it("class", () => {
    expect(isTypeOnlySource("class C {}")).toBe(false);
  });

  it("export class", () => {
    expect(isTypeOnlySource("export class C {}")).toBe(false);
  });

  it("function declaration", () => {
    expect(isTypeOnlySource("function f() {}")).toBe(false);
  });

  it("export function", () => {
    expect(isTypeOnlySource("export function f() {}")).toBe(false);
  });

  it("export const (value export)", () => {
    expect(isTypeOnlySource("export const x = 1;")).toBe(false);
  });

  it("export default (identifier)", () => {
    expect(isTypeOnlySource("export default X;")).toBe(false);
  });

  it("export default function", () => {
    expect(isTypeOnlySource("export default function f() {}")).toBe(false);
  });

  it("export * from (re-export all values)", () => {
    expect(isTypeOnlySource('export * from "./a";')).toBe(false);
  });

  it("value import (import { a } from ...)", () => {
    expect(isTypeOnlySource('import { a } from "./a";')).toBe(false);
  });

  it("side-effect import (import './a')", () => {
    expect(isTypeOnlySource('import "./a";')).toBe(false);
  });

  it("expression statement (foo())", () => {
    expect(isTypeOnlySource("foo();")).toBe(false);
  });

  it("const declaration (runtime value)", () => {
    expect(isTypeOnlySource("const x = 1;")).toBe(false);
  });

  it("let declaration (runtime value)", () => {
    expect(isTypeOnlySource("let x = 1;")).toBe(false);
  });

  it("template literal (backtick — runtime)", () => {
    // Backtick is in the forbidden set per tasks.md T-01 (template literal → false)
    expect(isTypeOnlySource("const x = `hello`;")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-003: 型宣言と式文が混在すると false（偽陽性の排除）
// Source: spec.md > Requirement: type-only 判定は許可構文の閉集合で行う
//         > Scenario: 型宣言と式文が混在すると false（偽陽性の排除）
//
// Safety invariant: a runtime statement starting with a non-allowed leader token
// at depth-0 must not be absorbed into a preceding allowed statement.
// These tests verify the depth-0 boundary is respected.
// ---------------------------------------------------------------------------
describe("TC-003: 型宣言と式文が混在すると false（偽陽性の排除）", () => {
  it("type X = A; then foo() — with semicolons", () => {
    expect(isTypeOnlySource("type X = A;\nfoo();")).toBe(false);
  });

  it("type X = A followed by foo() — without semicolons", () => {
    expect(isTypeOnlySource("type X = A\nfoo()")).toBe(false);
  });

  it("interface then class (class must not be absorbed into interface body)", () => {
    const src = "interface I { x: number }\nclass C implements I { x = 1 }";
    expect(isTypeOnlySource(src)).toBe(false);
  });

  it("export type alias then value export (must detect value export after type alias)", () => {
    const src = 'export type T = string;\nexport const x = 1;';
    expect(isTypeOnlySource(src)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-009: 空ファイル・空白のみ・コメントのみは true
// Source: tasks.md > T-01 Acceptance Criteria / T-04
// ---------------------------------------------------------------------------
describe("TC-009: 空ファイル・空白のみ・コメントのみは true", () => {
  it("(a) empty string", () => {
    expect(isTypeOnlySource("")).toBe(true);
  });

  it("(b) whitespace only — spaces, tabs, newlines", () => {
    expect(isTypeOnlySource("   \n  \t  \n   \n")).toBe(true);
  });

  it("(c) line comment // only", () => {
    expect(isTypeOnlySource("// just a comment\n// another one")).toBe(true);
  });

  it("(d) block comment /* */ only", () => {
    expect(isTypeOnlySource("/* block\nmultiline\ncomment */")).toBe(true);
  });

  it("(e) JSDoc /** */ only", () => {
    expect(isTypeOnlySource("/** @fileoverview This is a JSDoc comment */")).toBe(true);
  });

  it("mixed whitespace and comments only", () => {
    const src = "// line comment\n\n/** JSDoc */\n\n/* block */\n";
    expect(isTypeOnlySource(src)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-018: typecheck が green（isTypeOnlySource の型整合性の確認）
// Source: tasks.md > T-01/T-02/T-03/T-04 Acceptance Criteria
//
// Full typecheck is validated via `bun run typecheck`. This test verifies the
// function signature at runtime: accepts string, returns boolean.
// ---------------------------------------------------------------------------
describe("TC-018: isTypeOnlySource の型整合性（型は実装後に bun run typecheck で確認）", () => {
  it("takes a string argument and returns a boolean", () => {
    const input: string = "type X = string;";
    const result: boolean = isTypeOnlySource(input);
    expect(typeof result).toBe("boolean");
    expect(result).toBe(true);
  });

  it("returns boolean for runtime source too", () => {
    const input: string = "const x = 1;";
    const result: boolean = isTypeOnlySource(input);
    expect(typeof result).toBe("boolean");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F-IIFE: セミコロンなしスタイルの IIFE 吸収による偽陽性の封鎖
// (cross-boundary review 2026-07-23 の発見シナリオ)
//
// `(` / `[` を無条件の継続トークンにすると、ASI 境界を跨いだ行頭の
// runtime 式 (IIFE / array expression) が型文の継続として吸収され、
// runtime コードを持つファイルが type-only 判定される (偽陽性 = gate の抜け穴)。
// 修正: 改行を跨いだ行頭の `(` `[` は文末扱い (偽陰性側に倒す)。
// 同一行の `(` `[` (array suffix `{}[]` / call signature) は従来どおり型構文。
//
// DESTROY: 行頭 `(` `[` の文末扱いを外す (無条件継続に戻す) と
// 下の false 期待テストが true になり fail する。
// ---------------------------------------------------------------------------

describe("F-IIFE: 行頭 ( / [ の runtime 式吸収を封鎖 (偽陽性の構造的排除)", () => {
  it("type 宣言 + 改行 + IIFE → false (ASI 経路の吸収封鎖)", () => {
    const src = 'type X = A\n(function initRuntime() { globalThis.__init = true })()';
    expect(isTypeOnlySource(src)).toBe(false);
  });

  it("interface ブロック + 改行 + IIFE → false (block-close 経路の吸収封鎖)", () => {
    const src = 'interface X { a: number }\n(function initRuntime() { globalThis.__init = true })()';
    expect(isTypeOnlySource(src)).toBe(false);
  });

  it("type 宣言 + 改行 + 行頭 array expression → false", () => {
    const src = 'type X = A\n[1, 2].forEach(() => {})';
    expect(isTypeOnlySource(src)).toBe(false);
  });

  it("同一行の array suffix ({...}[]) は type-only のまま (挙動保存)", () => {
    const src = 'type Rows = { id: number }[];\ntype Other = string;';
    expect(isTypeOnlySource(src)).toBe(true);
  });

  it("同一行の function type ((x) => void) は type-only のまま (挙動保存)", () => {
    const src = 'type Handler = (event: string) => void;';
    expect(isTypeOnlySource(src)).toBe(true);
  });

  it("改行を跨ぐ行頭 ( の multiline function type は偽陰性側に倒す (許容された縮小)", () => {
    // `type F =` の次行を `(` で始める書式は文末扱いになり type-only と判定されない。
    // 偽陰性は現行どおり gate fail に落ちるだけで検出力は下がらない (request R1 の bias)。
    const src = 'type F =\n(x: number) => void';
    expect(isTypeOnlySource(src)).toBe(false);
  });
});
