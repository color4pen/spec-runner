/**
 * TC-075: ARCHIVE_USAGE ヘルプ文言が単相 archive 実装と一致する
 *
 * plain-archive.ts の実装は:
 *   record push → archived transition → cleanup (1 run で完結)
 *
 * ARCHIVE_USAGE が「PR merge 後に再実行」等、実装と矛盾する記述を
 * 持っていないことを検証する。
 */
import { describe, it, expect } from "vitest";
import { ARCHIVE_USAGE } from "../../../src/cli/archive.js";

describe("TC-075: ARCHIVE_USAGE ヘルプ文言が単相 archive 実装（1 回で complete）と一致する", () => {
  it("実装と矛盾する『PR merge 後に再実行』の記述が存在しない", () => {
    expect(ARCHIVE_USAGE).not.toContain("re-run the same command");
    expect(ARCHIVE_USAGE).not.toContain("after the PR is merged");
    expect(ARCHIVE_USAGE).not.toContain("After the PR is merged");
    expect(ARCHIVE_USAGE).not.toContain("awaiting-archive until the PR");
  });

  it("単相完了 (single run) の説明が存在する", () => {
    expect(ARCHIVE_USAGE).toMatch(/single run|1.*run|one.*step/i);
  });

  it("GitHub 無効 job の動作説明が存在する", () => {
    expect(ARCHIVE_USAGE).toMatch(/github integration disabled|integration disabled/i);
  });

  it("archived が merge 済みを意味しないことが明記されている", () => {
    expect(ARCHIVE_USAGE).toMatch(/archived.*does not imply|does not imply.*merged/i);
  });

  it("--with-merge は GitHub integration が必要であることが明記されている", () => {
    expect(ARCHIVE_USAGE).toContain("requires GitHub");
  });
});
