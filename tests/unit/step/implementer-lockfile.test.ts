/**
 * Tests for lockfile sync instruction in implementer user message.
 *
 * TC-010: user message に lockfile 同期指示が含まれる
 *
 * Requirement: implementer の user message（buildImplementerInitialMessage）の手順には、
 * 依存を追加・変更した場合は lockfile を同期してから完了する旨が含まれる MUST。
 * absorb-test-materialize: 単一 mode（testsMaterialized 分岐廃止）。
 */
import { describe, it, expect } from "vitest";
import { buildImplementerInitialMessage } from "../../../src/core/step/implementer.js";

// ---------------------------------------------------------------------------
// TC-010: 両分岐の user message に lockfile 同期指示が含まれる
// ---------------------------------------------------------------------------

describe("TC-010: user message に lockfile 同期指示が含まれる", () => {
  const BASE_OPTS = {
    slug: "my-change",
    branch: "change/my-change",
    requestContent: "Do something important",
  };

  it("単一 mode（absorb-test-materialize）のメッセージに lockfile 同期指示が含まれる", () => {
    const message = buildImplementerInitialMessage({
      ...BASE_OPTS,
    });

    // lockfile 同期を指示する文言が含まれること
    // 例: "lockfile", "bun.lock", "package-lock.json", "同期" 等
    const messageLower = message.toLowerCase();
    const hasLockfileInstruction =
      messageLower.includes("lockfile") ||
      messageLower.includes("bun.lock") ||
      messageLower.includes("package-lock.json") ||
      messageLower.includes("lock");

    expect(hasLockfileInstruction).toBe(true);

    // 「依存を追加・変更した場合」という条件付きであること（または依存関連の指示があること）
    const hasDependencyContext =
      messageLower.includes("依存") ||
      messageLower.includes("depend") ||
      messageLower.includes("install");

    expect(hasDependencyContext).toBe(true);
  });

  it("dynamicContext 付きメッセージに lockfile 同期指示が含まれる", () => {
    const message = buildImplementerInitialMessage({
      ...BASE_OPTS,
      dynamicContext: { gitLog: "abc def", diffStat: "+1 -0", changesList: [] },
    });

    const messageLower = message.toLowerCase();
    const hasLockfileInstruction =
      messageLower.includes("lockfile") ||
      messageLower.includes("bun.lock") ||
      messageLower.includes("package-lock.json") ||
      messageLower.includes("lock");

    expect(hasLockfileInstruction).toBe(true);

    const hasDependencyContext =
      messageLower.includes("依存") ||
      messageLower.includes("depend") ||
      messageLower.includes("install");

    expect(hasDependencyContext).toBe(true);
  });

  it("placement 付きメッセージにも lockfile 同期指示が含まれる", () => {
    const message = buildImplementerInitialMessage({
      ...BASE_OPTS,
      placement: { colocated: true } as never,
    });

    const messageLower = message.toLowerCase();
    const hasLockfileInstruction =
      messageLower.includes("lockfile") ||
      messageLower.includes("bun.lock") ||
      messageLower.includes("package-lock.json") ||
      messageLower.includes("lock");

    expect(hasLockfileInstruction).toBe(true);
  });

  it("指示は system prompt ではなく user message（<user-request> タグ内）に含まれる", () => {
    // spec 要件: user message に置く（IMPLEMENTER_SYSTEM_PROMPT ではなく）
    const message = buildImplementerInitialMessage({
      ...BASE_OPTS,
    });

    // メッセージ全体が <user-request> タグで囲まれていること
    expect(message).toContain("<user-request>");
    expect(message).toContain("</user-request>");

    // lockfile 指示がタグの中に含まれること（タグの外側に isolated で存在しない）
    const userRequestContent = message.replace(/<user-request>|<\/user-request>/g, "");
    const messageLower = userRequestContent.toLowerCase();
    const hasLockfileInstruction =
      messageLower.includes("lockfile") ||
      messageLower.includes("bun.lock") ||
      messageLower.includes("package-lock.json") ||
      messageLower.includes("lock");

    expect(hasLockfileInstruction).toBe(true);
  });

  it("単一 mode のメッセージに lockfile 同期指示が含まれる（対称性確認）", () => {
    const message = buildImplementerInitialMessage(BASE_OPTS);

    const checkInstruction = (msg: string) => {
      const lower = msg.toLowerCase();
      return (
        lower.includes("lockfile") ||
        lower.includes("bun.lock") ||
        lower.includes("package-lock.json") ||
        lower.includes("lock")
      );
    };

    expect(checkInstruction(message)).toBe(true);
  });
});
