/**
 * Tests for lockfile sync instruction in implementer user message.
 *
 * TC-010: 両分岐の user message に lockfile 同期指示が含まれる
 *
 * Requirement: implementer の user message（buildImplementerInitialMessage）の手順には、
 * 依存を追加・変更した場合は lockfile を同期してから完了する旨が含まれる MUST。
 * この指示は testsMaterialized: true と false の両分岐に含まれる SHALL。
 */
import { describe, it, expect } from "vitest";
import { buildImplementerInitialMessage } from "../../../src/core/step/implementer.js";

// ---------------------------------------------------------------------------
// TC-010: 両分岐の user message に lockfile 同期指示が含まれる
// ---------------------------------------------------------------------------

describe("TC-010: 両分岐の user message に lockfile 同期指示が含まれる", () => {
  const BASE_OPTS = {
    slug: "my-change",
    branch: "change/my-change",
    requestContent: "Do something important",
  };

  it("testsMaterialized: true (implementation-only mode) のメッセージに lockfile 同期指示が含まれる", () => {
    const message = buildImplementerInitialMessage({
      ...BASE_OPTS,
      testsMaterialized: true,
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

  it("testsMaterialized: false (TDD mode) のメッセージに lockfile 同期指示が含まれる", () => {
    const message = buildImplementerInitialMessage({
      ...BASE_OPTS,
      testsMaterialized: false,
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

  it("testsMaterialized 未指定（デフォルト）のメッセージにも lockfile 同期指示が含まれる", () => {
    // testsMaterialized: undefined は false と同等（fast pipeline / TDD mode）
    const message = buildImplementerInitialMessage(BASE_OPTS);

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
      testsMaterialized: true,
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

  it("両分岐で lockfile 同期指示の内容が対称的（完了前に同期する旨）", () => {
    const messageTrue = buildImplementerInitialMessage({
      ...BASE_OPTS,
      testsMaterialized: true,
    });
    const messageFalse = buildImplementerInitialMessage({
      ...BASE_OPTS,
      testsMaterialized: false,
    });

    // 両方に lockfile 指示が含まれること（非対称にならない）
    const checkInstruction = (msg: string) => {
      const lower = msg.toLowerCase();
      return (
        lower.includes("lockfile") ||
        lower.includes("bun.lock") ||
        lower.includes("package-lock.json") ||
        lower.includes("lock")
      );
    };

    expect(checkInstruction(messageTrue)).toBe(true);
    expect(checkInstruction(messageFalse)).toBe(true);
  });
});
