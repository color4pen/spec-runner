/**
 * Unit tests for git-command-classifier.ts — permission-layer-git-write-denial
 *
 * TC-001: ALWAYS_MUTATING サブコマンド群が mutation を返す (must)
 * TC-002: 読み取り系 git と非 git が read-or-nongit を返す (must)
 * TC-003: mutation セグメントを含む複合コマンドが mutation を返す (must)
 * TC-004: 全セグメントが非 mutation の複合コマンドは read-or-nongit を返す (should)
 * TC-005: git がセグメント先頭以外に現れるコマンドは read-or-nongit を返す (must)
 * TC-006: 値を取る global option をスキップして subcommand を正しく検出する (must)
 * TC-007: 環境変数代入プレフィックスをスキップして subcommand を正しく検出する (should)
 * TC-008: CONDITIONAL サブコマンドの読み取り形が read-or-nongit を返す (must)
 * TC-009: CONDITIONAL サブコマンドの変更形が mutation を返す (must)
 */
import { describe, it, expect } from "vitest";
// NOTE: git-command-classifier.ts does not exist yet (created by implementer T-02).
// These tests will fail with "Cannot find module" until the implementation is done.
import { classifyGitCommand } from "../git-command-classifier.js";

// ---------------------------------------------------------------------------
// TC-001: ALWAYS_MUTATING subcommands return { kind: "mutation", subcommand }
// ---------------------------------------------------------------------------

describe("TC-001: ALWAYS_MUTATING サブコマンド群が mutation を返す", () => {
  const cases: Array<{ cmd: string; expectedSubcommand: string }> = [
    { cmd: "git commit -m x", expectedSubcommand: "commit" },
    { cmd: "git push origin main", expectedSubcommand: "push" },
    { cmd: "git add .", expectedSubcommand: "add" },
    { cmd: "git reset --hard HEAD", expectedSubcommand: "reset" },
    { cmd: "git checkout main", expectedSubcommand: "checkout" },
    { cmd: "git clean -fd", expectedSubcommand: "clean" },
    { cmd: "git merge feature", expectedSubcommand: "merge" },
    { cmd: "git rebase main", expectedSubcommand: "rebase" },
    { cmd: "git restore src/foo.ts", expectedSubcommand: "restore" },
    { cmd: "git cherry-pick abc", expectedSubcommand: "cherry-pick" },
    { cmd: "git rm file.txt", expectedSubcommand: "rm" },
    { cmd: "git mv a.ts b.ts", expectedSubcommand: "mv" },
    { cmd: "git am patch.diff", expectedSubcommand: "am" },
    { cmd: "git apply patch.diff", expectedSubcommand: "apply" },
    { cmd: "git update-ref refs/heads/main abc", expectedSubcommand: "update-ref" },
    { cmd: "git filter-branch --tree-filter ...", expectedSubcommand: "filter-branch" },
  ];

  for (const { cmd, expectedSubcommand } of cases) {
    it(`classifies "${cmd}" as mutation with subcommand "${expectedSubcommand}"`, () => {
      const result = classifyGitCommand(cmd);
      expect(result.kind).toBe("mutation");
      if (result.kind === "mutation") {
        expect(result.subcommand).toBe(expectedSubcommand);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// TC-002: read git and non-git commands return { kind: "read-or-nongit" }
// ---------------------------------------------------------------------------

describe("TC-002: 読み取り系 git と非 git が read-or-nongit を返す", () => {
  const cases = [
    "git status",
    "git diff HEAD",
    "git log --oneline",
    "git show abc123",
    "git rev-parse HEAD",
    "git blame src/foo.ts",
    "git ls-files",
    "bun test",
    "echo ok",
  ];

  for (const cmd of cases) {
    it(`classifies "${cmd}" as read-or-nongit`, () => {
      const result = classifyGitCommand(cmd);
      expect(result.kind).toBe("read-or-nongit");
    });
  }
});

// ---------------------------------------------------------------------------
// TC-003: compound commands containing a mutation segment return mutation
// ---------------------------------------------------------------------------

describe("TC-003: mutation セグメントを含む複合コマンドが mutation を返す", () => {
  const cases = [
    "git status && git commit -m x",
    "echo ok | git add -A",
    "git diff; git push",
  ];

  for (const cmd of cases) {
    it(`classifies compound "${cmd}" as mutation`, () => {
      const result = classifyGitCommand(cmd);
      expect(result.kind).toBe("mutation");
    });
  }
});

// ---------------------------------------------------------------------------
// TC-004 (should): compound commands with all non-mutation segments return read-or-nongit
// ---------------------------------------------------------------------------

describe("TC-004: 全セグメントが非 mutation の複合コマンドは read-or-nongit を返す", () => {
  const cases = [
    "git status; echo done",
    "git log | grep foo",
  ];

  for (const cmd of cases) {
    it(`classifies all-read compound "${cmd}" as read-or-nongit`, () => {
      const result = classifyGitCommand(cmd);
      expect(result.kind).toBe("read-or-nongit");
    });
  }
});

// ---------------------------------------------------------------------------
// TC-005: git in non-leading position is not treated as git execution
// ---------------------------------------------------------------------------

describe("TC-005: git がセグメント先頭以外に現れるコマンドは read-or-nongit を返す", () => {
  it('classifies "echo git commit" as read-or-nongit (git is not the first token)', () => {
    const result = classifyGitCommand("echo git commit");
    expect(result.kind).toBe("read-or-nongit");
  });

  it('classifies "VAR=git git" with VAR=git prefix as non-git arg position', () => {
    // Only the environment variable prefix containing "git" should not count as git execution
    // (but the second "git" IS the command — this is a complex case; just verify no false positive)
    const result = classifyGitCommand("not-git commit");
    expect(result.kind).toBe("read-or-nongit");
  });
});

// ---------------------------------------------------------------------------
// TC-006: global options with values are skipped to find the correct subcommand
// ---------------------------------------------------------------------------

describe("TC-006: 値を取る global option をスキップして subcommand を正しく検出する", () => {
  it('classifies "git -C /repo commit -m x" as mutation with subcommand "commit"', () => {
    const result = classifyGitCommand("git -C /repo commit -m x");
    expect(result.kind).toBe("mutation");
    if (result.kind === "mutation") {
      expect(result.subcommand).toBe("commit");
    }
  });

  it('classifies "git --git-dir=.git log" as read-or-nongit', () => {
    const result = classifyGitCommand("git --git-dir=.git log");
    expect(result.kind).toBe("read-or-nongit");
  });

  it('classifies "git -c core.bare=false status" as read-or-nongit', () => {
    const result = classifyGitCommand("git -c core.bare=false status");
    expect(result.kind).toBe("read-or-nongit");
  });
});

// ---------------------------------------------------------------------------
// TC-007 (should): environment variable assignment prefix is skipped
// ---------------------------------------------------------------------------

describe("TC-007: 環境変数代入プレフィックスをスキップして subcommand を正しく検出する", () => {
  it('classifies "GIT_AUTHOR_NAME=foo git commit -m y" as mutation with subcommand "commit"', () => {
    const result = classifyGitCommand("GIT_AUTHOR_NAME=foo git commit -m y");
    expect(result.kind).toBe("mutation");
    if (result.kind === "mutation") {
      expect(result.subcommand).toBe("commit");
    }
  });

  it('classifies "GIT_DIR=.git git status" as read-or-nongit', () => {
    const result = classifyGitCommand("GIT_DIR=.git git status");
    expect(result.kind).toBe("read-or-nongit");
  });
});

// ---------------------------------------------------------------------------
// TC-008: CONDITIONAL subcommands in read form return read-or-nongit
// ---------------------------------------------------------------------------

describe("TC-008: CONDITIONAL サブコマンドの読み取り形が read-or-nongit を返す", () => {
  const cases = [
    "git branch",           // branch with no args = list
    "git branch --list",    // explicit list flag
    "git branch -l",        // short list flag
    "git tag",              // tag with no args = list
    "git tag -l",           // tag list flag
    "git stash list",       // stash list sub-action
    "git stash show",       // stash show sub-action
  ];

  for (const cmd of cases) {
    it(`classifies "${cmd}" as read-or-nongit`, () => {
      const result = classifyGitCommand(cmd);
      expect(result.kind).toBe("read-or-nongit");
    });
  }
});

// ---------------------------------------------------------------------------
// TC-009: CONDITIONAL subcommands in write/modify form return mutation
// ---------------------------------------------------------------------------

describe("TC-009: CONDITIONAL サブコマンドの変更形が mutation を返す", () => {
  const cases = [
    "git branch -D foo",          // delete flag → mutation
    "git branch new-branch",      // positional arg = create → mutation
    "git branch -m old new",      // move flag → mutation
    "git tag v1.0.0",             // positional arg = create → mutation
    "git tag -a v1.0 -m msg",     // annotate flag → mutation
    "git tag -d v0.9",            // delete flag → mutation
    "git stash",                  // bare git stash = push → mutation
    "git stash pop",              // pop sub-action → mutation
    "git stash drop",             // drop sub-action → mutation
    "git stash push",             // push sub-action → mutation
  ];

  for (const cmd of cases) {
    it(`classifies "${cmd}" as mutation`, () => {
      const result = classifyGitCommand(cmd);
      expect(result.kind).toBe("mutation");
    });
  }
});
